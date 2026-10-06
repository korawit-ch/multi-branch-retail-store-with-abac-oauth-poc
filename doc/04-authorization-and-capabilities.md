# Authorization and resource capabilities

[Documentation index](README.md)

## RBAC plus resource conditions

Authentication produces an actor. Role-based access control (RBAC) supplies named permissions through Role → RolePermission → Permission. Attribute-based conditions then constrain resources using tenant, region, branch assignments, customer ownership, order status, and refund limit.

These conditions are ordinary service-owned Prisma predicates, not an external policy engine. The frontend never supplies trusted tenant, role, assignments, price, or refund-limit values.

## Seeded role grants

The [seed](../packages/prisma/prisma/seed.ts) is the source for the initial grants; current database rows are authoritative afterward.

- **CUSTOMER:** `order.read`.
- **STORE_STAFF:** `store.read`, `order.create`, `order.read`, `order.update_status`.
- **STORE_MANAGER:** the staff permissions plus `order.refund` and `inventory.adjust`.
- **HQ_ADMIN:** `store.read`, `order.create`, `order.read`, `order.update_status`, `inventory.adjust`.

`promotion.manage` exists but is granted to no seeded role and used by no implemented route. HQ is not a superuser. One User has one Role; there is no multi-role aggregation or administration UI.

## Resource scoping

[RetailService](../apps/api/src/retail/retail.service.ts) limits stores to IDs in `actor.storeIds` with matching tenant and region. Inventory and sale queries follow the branch-product row's Store relation with that same scope. Sales also require an active product in the actor's tenant and available branch listing.

[OrdersService](../apps/api/src/orders/orders.service.ts) handles detail reads differently for customers: tenant and region must match, then `customerId` must match. Workforce detail reads instead require an assigned branch. Updates use tenant, region, and assigned branch regardless of customer ownership.

Missing and out-of-scope orders generally share HTTP 403, avoiding a separate existence signal in these handlers. Invalid state transitions also use 403, so callers cannot assume every 403 means a missing role grant.

The dashboard requires `store.read` and includes related orders without a separate `order.read` check. Every seeded workforce role has both, but a future role with only `store.read` would still see dashboard orders. Treat the dashboard's read permission as currently broad until that contract is deliberately changed.

## One refund policy, two uses

[refund.policy.ts](../apps/api/src/orders/refund.policy.ts) provides:

- `permitted`: whether the actor has `order.refund`.
- `where`: matching tenant, region, assigned store, PAID status, and `total <= refundLimit`.
- `reason`: either missing permission or the generic branch/status/limit explanation.

Read paths use `refundCapabilities` to find eligible order IDs with that predicate. The dashboard evaluates all returned order IDs in one batched eligibility query rather than one query per row. An actor without permission receives denied capabilities without an eligibility query.

The refund mutation uses the same predicate in `updateMany`, changing status only if exactly one row still qualifies. This shared predicate prevents a permissive UI calculation and a stricter write rule from drifting apart.

Example response fragment:

```json
{
  "id": "902",
  "status": "PAID",
  "total": 800,
  "capabilities": {
    "refund": {
      "allowed": false,
      "reason": "Refund requires a paid order in your assigned branch within your refund limit."
    }
  }
}
```

An allowed capability has `allowed: true` and `reason: null`. Both order detail and dashboard orders expose it. The capability is specific to the authenticated actor and current resource state; do not share these responses in a public cache.

## Why the backend still checks on click

A capability is a snapshot, not a token granting execution. After a read, another worker could prepare or refund the order, the user's grants could change, or their session could expire. The write must authenticate again and apply current database conditions.

For example, a manager receives an allowed capability for a PAID order. Staff then move it to PREPARING. The manager's later refund attempt is rejected because PAID is part of the update predicate. No stale client flag can override that condition.

## The deliberate UI override

In [StoreDashboard](../apps/web/components/store-dashboard.tsx), the normal disabled rule is:

```ts
busy || (!order.capabilities.refund.allowed && !overrideRefund);
```

The checkbox **Demo: enable denied refund buttons** only changes `overrideRefund` in local React state. No override field, role, or capability is sent to the API. The request remains `POST /orders/:id/refund`.

- Staff can enable a button visually and observe a 403 for missing permission.
- A manager can attempt order 902 and observe a 403 for branch/status/limit eligibility.
- An actually allowed refund still changes the order to REFUNDED.
- Pending mutations keep controls disabled even when the checkbox is checked.
- Branch changes and page reloads reset the override. Every refund result invalidates the retail query to refresh capabilities.

The error panel displays the actual HTTP status and parsed response body. The current success panel uses a hardcoded 201, matching today's Nest route default; it does not capture success status metadata from fetch.

## Where centralization stops today

Only refunds have resource capabilities. Other controls inspect permission strings and, for preparation, local order status. Their backend checks remain authoritative, but the frontend still duplicates some presentation rules. A future capability extension should cover those actions without relocating business rules to the browser.

The access-summary endpoint uses fixed example IDs 900, 903, 901, and 902. It is an educational report, not a general permission registry. Authorization currently occurs through explicit controller/service calls, so new routes require a conscious protection decision.
