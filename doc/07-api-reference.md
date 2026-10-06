# API reference

[Documentation index](README.md)

## Conventions

The default API base is `http://localhost:3001`; use the configured `API_PUBLIC_URL` for your environment. There is no `/v1` prefix. Swagger is mounted at `/api`, but its template-focused annotations do not fully specify retail behavior. This guide follows controllers, DTOs, services, and [shared contracts](../packages/api-client/src/index.ts).

Protected requests use the `app_session` cookie, not an Authorization bearer token. Browser fetches set `credentials: 'include'`. Retail/order mutations require an exact Origin equal to `WEB_ORIGIN` (default `http://localhost:3000`), including non-browser callers. Auth logout routes compare against `WEB_URL` with `WEB_ORIGIN` fallback. An absent Origin is rejected by those checks.

POST retail/refund handlers use Nest's default success status 201; GET and PATCH handlers return 200. Successful auth redirects normally use 302; logout uses 303. Error bodies generally follow Nest's `{ "message": ..., "error": ..., "statusCode": ... }` shape. Validation messages may be arrays; callers should not depend on one fixed error string for every failure.

Global ValidationPipe uses `whitelist: true` and `transform: true`. It does not enable `forbidNonWhitelisted`: unknown decorated-DTO fields are stripped rather than rejected. TypeScript types and Swagger annotations alone do not validate runtime data.

## Authentication routes

Implemented in [AuthController](../apps/api/src/auth/auth.controller.ts).

- **GET `/auth/login?persona=mock-manager-10`**: starts the development flow, sets `oauth_attempt`, redirects to the local provider. No current session required.
- **GET `/mock-provider/authorize`**: expects the flow's response type, client ID, callback URI, state, S256 challenge, and optional persona. Returns a callback redirect or 400 for invalid authorization parameters.
- **POST `/mock-provider/token`**: body `{ "code": "...", "codeVerifier": "...", "redirectUri": "..." }`; returns `{ "subject": "...", "displayName": "..." }` with 200, or `{ "error": "invalid_grant" }` with 400 for an invalid exchange. This is a custom mock identity response, not a real OAuth token response. Wrong runtime field types are not comprehensively DTO-validated.
- **GET `/auth/callback?code=...&state=...`**: validates the attempt, exchanges the code, creates a session, and redirects to the web dashboard. Normal login failure redirects to the home error query; unexpected failures can still become server errors.
- **POST `/auth/logout`**: trusted origin; revokes the current session when identifiable, clears the cookie, and redirects to the web app.
- **POST `/auth/logout-all`**: trusted origin; with an active session, revokes the user's unrevoked sessions. Missing/invalid sessions revoke zero rows. Either way, it clears the cookie and redirects.

Mock-provider operations are disabled in production. Full details: [authentication guide](03-authentication-and-sessions.md).

## GET `/retail`

Requires an active session and `store.read`. Returns the actor and only assigned stores in the actor's tenant/region. The following is an abbreviated shape, not a complete fixture:

```json
{
  "actor": {
    "id": "mock-manager-10",
    "role": "STORE_MANAGER",
    "tenantId": "thai-food",
    "region": "TH",
    "storeIds": ["10"],
    "permissions": ["store.read", "order.refund"],
    "refundLimit": 500
  },
  "stores": [
    {
      "id": "10",
      "name": "Siam Square",
      "products": [],
      "orders": [],
      "audits": []
    }
  ]
}
```

Product listings include ID, numeric price, stock, availability, and catalog information. Orders include numeric total, timestamp, receipt items, and `capabilities.refund`. Audits include actor, action, detail, and timestamp. The service currently spreads Prisma objects, so wire responses contain additional fields beyond the smaller shared interface. The contract is not an exact field allowlist.

Orders are limited to 50 and audits to 15 per store. No page cursor or aggregate-report endpoint exists. A valid actor without store assignments can receive an empty stores array. Missing permission yields 403; invalid session yields 401.

## POST `/retail/sales`

Requires trusted origin, active session, `order.create`, authorized branch, available listing, active tenant product, and sufficient stock.

```json
{ "storeProductId": "10-coffee", "quantity": 2 }
```

ID length: 1–100 characters. Quantity: integer 1–1000. Returns 201 with `{ "id": "new-order-id" }`.

Validation failures and stock/price conflicts produce 400. Missing permission or an unavailable/out-of-scope listing produces 403. The server derives tenant, branch, customer placeholder, status, price, total, and receipt name. The request does not support multiple lines, payments, discounts, customer selection, or idempotency keys.

## POST `/retail/inventory/:id/adjust`

`:id` is the StoreProduct ID, not the Product ID. Requires trusted origin, active session, `inventory.adjust`, and assigned-branch scope.

```json
{ "delta": 10, "reason": "Received morning delivery" }
```

Delta: nonzero integer -10000 through 10000. Reason: string length 3–120 before trimming; whitespace-only values are rejected by the service. Returns 201 with `{ "ok": true }`. Insufficient stock/invalid input returns 400; permission/scope denial returns 403.

## GET `/orders/:id`

Requires `order.read`. Workforce actors need the assigned branch; customers need matching customer ownership. Both require matching tenant and region. Returns order fields with numeric total and refund capability. This handler does not load OrderItem relations; use the dashboard's orders for the existing receipt display.

Missing or unauthorized order returns 403. The shared `OrderResponse` omits some fields actually serialized by the service, such as timestamps.

## PATCH `/orders/:id`

Requires trusted origin, active session, `order.update_status`, and assigned-branch scope.

```json
{ "status": "PREPARING" }
```

Returns 200:

```json
{ "orderId": "901", "from": "PAID", "to": "PREPARING" }
```

Valid transitions are PAID → PREPARING and PREPARING → READY. Other enum values can pass DTO validation yet fail the service transition check with 403. Invalid enum strings fail validation with 400. A concurrent status change causes 403. Refunds must use the separate refund route.

## POST `/orders/:id/refund`

No body is required. Requires trusted origin, active session, `order.refund`, matching tenant/region/assigned branch, PAID status, and total within the actor's refund limit.

Returns 201 with `{ "orderId": "901", "status": "REFUNDED" }`. Permission, scope, limit, status, and repeat-refund failures return 403. There is no supported override argument. A successful call changes only status.

## GET `/orders/access-summary`

Requires an active session. Returns a limited actor summary and `examples: [{ label, allowed, reason }]`. Each example tests current grants and SQL resource scope against hardcoded seeded IDs. The controller declares this route before `/orders/:id`. It is a teaching endpoint, not a complete permissions API.

## Public template routes

[LinksController](../apps/api/src/links/links.controller.ts) exposes GET/POST `/links` and GET/PATCH/DELETE `/links/:id` without session or origin enforcement. List reads are unbounded. Declared fields are title, URL, and optional description. Missing link lookups produce 404; IDs are converted with unary `+`, not a ParseIntPipe.

The [Link DTOs](../apps/api/src/links/dto/create-link.dto.ts) use Swagger annotations but no class-validator field decorators. With global whitelisting, their declared fields are not validated/retained as expected, so do not assume the typed CRUD contract works correctly end to end. This should be resolved or the scaffold removed before public use.

GET `/` returns generic API metadata, including a template-era endpoint list. GET `/api` serves Swagger documentation. Neither is a database readiness probe. See the [risk register](10-risks-and-limitations.md) for public-surface implications.

## Client integration example

Use the existing descriptors and frontend transport:

```ts
const dashboard = await clientFetch(retailApi.dashboard());
const created = await clientFetch(
  retailApi.sale({ storeProductId: '10-coffee', quantity: 2 }),
);
```

The fetch helper throws `ApiError` with status and parsed response body for HTTP failures. Network failures remain ordinary errors. Successful JSON is asserted to the TypeScript response type without runtime schema validation. Refresh affected queries after a successful mutation and after any refund attempt; do not interpret an earlier capability as an authorization guarantee.
