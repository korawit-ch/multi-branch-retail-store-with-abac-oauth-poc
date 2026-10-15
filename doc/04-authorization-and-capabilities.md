# Conditional grants and resource capabilities

[Documentation index](README.md) · [BFF architecture](12-bff-authentication-architecture.md)

## Three distinct decisions

1. **Named permission:** `hasPermission(auth, 'order.refund')` asks whether the signed matrix contains that grant. Next uses this as an early endpoint check; Nest repeats it. It does not authorize a particular order.
2. **Stable resource scope:** `can(auth, permission, resource)` evaluates the grant's typed conditions in memory. `resourceScope(auth, permission)` resolves the same conditions into plain tenant/store filter values for Prisma. Nest uses the latter in reads and writes, including the final conditional update.
3. **Current business state:** Nest adds current region, customer ownership, stock, status, amount limits, and transition rules. A UI capability or stale read never authorizes a later write.

The [shared policy package](../packages/authorization/src/policy.ts) contains a small allowlisted vocabulary, generic `equals` and `includes` operators, claim validation, and the two evaluation forms. It has no Next, Nest, Prisma, database, or React dependency. The [backend grant builder](../apps/api/src/auth/authorization-policy.ts) owns permission-specific scope rules; unknown permission codes or unsupported customer grants fail closed. The browser cannot provide grants, conditions, assignments, roles, ownership, or Prisma filters.

## Grant shape

```ts
type PermissionGrant = {
  permission: Permission;
  conditions: GrantCondition[];
};

// Manager's order.refund grant
{
  permission: 'order.refund',
  conditions: [
    { operator: 'equals', subjectField: 'tenantId', resourceField: 'tenantId' },
    { operator: 'includes', subjectField: 'storeIds', resourceField: 'storeId' },
  ],
}
```

The signed subject holds `userId`, `tenantId`, and `storeIds`. Conditions within one grant use AND semantics. `can()` denies if a required resource field is missing. The JWT validator rejects unknown permissions, fields, operators, empty condition lists, duplicate grants, and duplicate resource fields within a grant. These rules prevent a token from introducing arbitrary expressions or an accidental unscoped grant.

For workforce store/order/inventory permissions, the builder attaches tenant equality and assigned-store inclusion. Customer `order.read` gets tenant equality; the service adds current customer ownership. `promotion.manage` is tenant scoped but has no implemented route. The builder is deliberately separate from the generic evaluator: adding an allowlisted field can reuse `equals` or `includes`, while adding an operator requires explicit in-memory and query-resolution logic and tests.

## Seeded role permissions

The [seed](../packages/prisma/prisma/seed.ts) defines the initial role grants; live database rows are authoritative when access tokens are issued or refreshed.

- **CUSTOMER:** `order.read`.
- **STORE_STAFF:** `store.read`, `order.create`, `order.read`, `order.update_status`.
- **STORE_MANAGER:** staff permissions plus `order.refund` and `inventory.adjust`.
- **HQ_ADMIN:** `store.read`, `order.create`, `order.read`, `order.update_status`, `inventory.adjust`.

One User has one Role. HQ is not a superuser and still needs explicit assignments. `promotion.manage` is ungranted and unused in the current UI.

## Database enforcement

For a manager refund, `resourceScope()` produces `{ tenantId: 'thai-food', storeId: { in: ['10'] } }`. [OrdersService](../apps/api/src/orders/orders.service.ts) and [refund.policy.ts](../apps/api/src/orders/refund.policy.ts) add current region, `PAID` status, and `total <= refundLimit` in Prisma queries. The refund mutation uses one `updateMany` with all conditions; exactly one row must change. A concurrent status change therefore cannot turn an earlier allowed capability into an unauthorized refund.

[RetailService](../apps/api/src/retail/retail.service.ts) maps the grant's `storeId` predicate to `Store.id`, adds current region, and reuses the same scoped Store relation for inventory adjustment and sale transactions. Sale prices and receipt snapshots are server calculated. Missing grant scope denies before a query.

Customer order reads add current `customerId`. Missing and out-of-scope orders generally share 403. The dashboard's `store.read` response includes orders without a separate `order.read` check; this is a known broad read contract for future custom roles.

## Backend-computed capabilities and demo

Both dashboard orders and order detail return `capabilities.refund: { allowed, reason }`. A batched eligibility query uses the same refund predicate as the write. The capability is an actor-specific, point-in-time UI hint, not a bearer of authority; do not cache these responses publicly.

The **My access** view shows coarse named permissions and calls `GET /orders/access-summary` for backend-computed examples across seeded orders. It does not reconstruct tenant/store conditions in React or expose the signed grant matrix. Other controls use coarse permission names for presentation; order preparation also checks the displayed status. Their backend decisions remain authoritative. Only refunds currently expose resource-specific capabilities.

The checkbox **Demo: enable denied refund buttons** only changes local React state. It sends no override, role, grant, or capability to the server. A staff user can force the button to appear and see the BFF's missing-grant 403; a manager can attempt an out-of-scope or ineligible order and receive Nest's scoped denial. Successful refunds still require the atomic backend condition. Every refund attempt refreshes dashboard capabilities.

## Staleness and extension

An access JWT contains a ten-minute permission/assignment snapshot. Login and refresh rebuild it from current database rows. Logout blocks refresh immediately, but an already issued token can retain an old grant until expiry. Current region, customer mapping, refund limit, order status, and stock are checked at action time.

To add an action, update the permission vocabulary, backend grant policy, role grant/seed, BFF allowlist, independent Nest check, scoped domain query, relevant capability, and tests. To add a new scope field, update subject/resource types and runtime validation, builder output, Prisma mapping, and allowed/denied/missing-field tests. Do not add a browser-side policy interpreter or let a request submit raw conditions.
