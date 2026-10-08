# Branch & Co retail demo

This app extends the existing template instead of introducing a second architecture:

- `apps/web`: Next.js App Router, frontend-owned fetch, TanStack Query, and the existing shared Button.
- `apps/api`: NestJS controllers, validated DTOs, session authentication, and transactional business services.
- `packages/api-client`: runtime-agnostic typed endpoint definitions and serialized response types.
- `packages/prisma`: PostgreSQL schema, migrations, seed, and shared Prisma client.
- Existing design-system, UI, icons, lint, test, and TypeScript packages remain in use.

## Start from a clean checkout

Use Node 22.12+ and Docker. Installation creates `.env` from `.env.example` if absent.

```sh
npm ci
```

Set `AUTH_COOKIE_SECRET` in `.env` to a random base64url secret (at least 32 bytes). Generate a value locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Check `DATABASE_URL`, `API_PORT`, `API_INTERNAL_URL`, `WEB_ORIGIN`, and `WEB_URL` in `.env`. Both servers need the same private `AUTH_COOKIE_SECRET`. Then:

```sh
npm run env:distribute
npm run db:up
npx prisma migrate deploy --config packages/prisma/prisma.config.ts
npm run db:seed
npm run build
npm run dev
```

Open http://localhost:3000 with the default configuration. The mock sign-in provider is development-only; run `npm run dev` for the interactive demo. A production build verifies compilation but does not enable mock authentication in production.

### Current local workspace

This workspace was configured on **http://localhost:3100**, with its API on **http://localhost:3101**. PostgreSQL runs in the isolated `branch-retail-demo-db` container on port **55435**, database `branch_retail_demo`. These values are in the ignored `.env`; no secrets are committed. The existing apps on ports 3000/3001 and their database were left alone.

To restart this configuration, start `branch-retail-demo-db` if stopped, then run these in separate terminals after a build:

```sh
node --env-file=.env apps/api/dist/main.js
npm run dev --workspace=web -- --port 3100
```

## Five-minute walkthrough

1. Choose **Store manager — Siam Square**. Sign-in redirects through the local mock OAuth provider using state and PKCE, then creates a revocable database session in an encrypted HttpOnly cookie.
2. Open **Inventory**. Add 10 units to Butter cookie with a delivery reason. The low-stock count changes; **Activity** shows the actor and reason.
3. **Record a sale** for a product. Its branch price is calculated by the API, stock decreases, and the receipt retains the product name and price charged.
4. In **Orders**, move the new sale from paid to preparing, then ready. Invalid transitions are rejected by the API.
5. Sign out and choose **Store staff**. Staff can sell and prepare orders but cannot adjust inventory. Direct API attempts are rejected too.
6. Choose **Ari manager** to see only branch 42; choose **HQ administrator** to switch between assigned branches 10 and 42. **My access** explains the current grants.

## Scope and permissions

Managers and HQ have `store.read`, `order.read`, `order.create`, `order.update_status`, and `inventory.adjust`. Staff have the same read, sale, and order-status permissions but no inventory writes. Every retail query also checks tenant, region, and assigned branch IDs. HQ access comes from assignments, not an authorization bypass.

The template's customer identity, access-summary endpoint, refund permission, and legacy order examples remain available to existing API consumers. Customers cannot open the manager workspace. The Orders screen exposes the template's simplified refund operation as an authorization demonstration: it only marks an order REFUNDED, with no money transfer or stock return.

## Mapping to the supplied PDFs

Source references: `database_design_fast_track_study_guide_v3.pdf` (especially sections 5–8, 12, 15, 18–19) and `multi_branch_store_erd.pdf`.

Implemented: Store → StoreProduct ← Product, Order → OrderItem → Product, StoreProduct → InventoryMovement, Role → RolePermission ← Permission, UserStore branch membership, and branch-scoped AuditEvent. The existing user-to-role relation remains **one role per user**, keeping the starter's session contracts intact rather than implementing the reference's full UserRole many-to-many relationship.

Intentional simplifications: a sale has one product line and a walk-in customer identifier; existing seeded examples have no order items. Customer remains an identifier rather than a separate entity. Product catalog is seeded, not editable. StoreProduct owns current branch price and stock; OrderItem snapshots price and name. Money uses PostgreSQL decimal, then numeric serialized display values. InventoryMovement explains stock changes, while StoreProduct.stock is the authoritative current projection.

Payment attempts/refunds, promotions, external providers, webhook ingestion, multi-role administration, and customer management are outside this simple demo. The PDFs are domain references; their exercises and operational instructions are not executed as user requests.

## Invariants

- Unique `(store_id, product_id)` and tenant-local product SKU.
- SQL checks: nonnegative stock and price, positive order quantity, nonzero stock movement.
- Sale and adjustment write stock, history, and audit together in a transaction.
- Stock decrement uses a conditional atomic update, so concurrent requests cannot oversell.
- Price and product name come from the server; the client submits only product identity and quantity.
- Writes validate the browser origin. Session permissions are reloaded from PostgreSQL for every request.
- Read results cap orders at the latest 50 per branch and audit events at 15. Sales cards summarize that window, not all-time revenue.
- Audit history here covers sale creation and stock adjustments. The inherited order-status endpoint is not audited.

## Verification

```sh
npm run build
npm run test --workspace=api -- --runInBand
npm run test --workspace=web -- --runInBand
npm run lint --workspace=api
npm run lint --workspace=web
npm run lint --workspace=@repo/api-client
npm run test:retail
```

`test:retail` requires running Next.js and NestJS servers with a seeded development API configured through `.env`. It creates one test sale and audit entries, restores the tested product's starting stock, and revokes its own sessions. Run it only on a local demo database. It checks OAuth login, session revocation, role denials, branch isolation, invalid inputs, untrusted origins, negative stock, server-owned receipt prices, order transitions, and two concurrent requests competing for one available unit.

The local mock provider does not authenticate real people. Code replay protection is process-local and production mode disables the mock. Real deployment requires an actual OAuth/OIDC provider adapter and durable one-time authorization flow storage; no provider credentials are required for this demo.

## Capability override demonstration

Open **Orders** as the Siam Square manager. Every order includes `capabilities.refund`, calculated by the API for the signed-in user. Order 902 exceeds the seeded manager's THB 500 refund limit, so its Refund button is disabled with a backend-provided explanation. Staff have no refund permission, so all their Refund buttons are disabled.

Check **Demo: enable denied refund buttons** and click a disabled-by-policy refund. The request goes through the normal BFF route; the checkbox is never sent to either server. The response panel shows the HTTP 403 from the Next.js BFF when a permission is missing; NestJS independently rejects direct unauthorized bearer calls. Uncheck it to restore the normal disabled state. The override resets on a branch change or a page reload.

Allowed refunds still change the order status. This demonstration does not contact a payment provider or replenish inventory.

`apps/api/src/orders/refund.policy.ts` defines one Prisma predicate for role eligibility, tenant, region, branch, paid status, and refund limit. Order detail and dashboard responses calculate capabilities with that policy (one batched eligibility query for dashboard orders). The refund endpoint reuses it in a conditional atomic update. A read-time capability is a snapshot, so the backend checks again at execution and the frontend refreshes capabilities after every refund attempt.
