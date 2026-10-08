# Risks and limitations

[Documentation index](README.md)

## How to read this register

These findings come from source inspection, not penetration testing, a dependency vulnerability scan, or a running production assessment. **Confirmed** means the behavior or omission is visible in the checked-in code. **Conditional** means the consequence requires an additional condition such as public deployment, a new writer, bad data, or scale.

BLOCKER means a blocker to the stated real-world use, not a reason the isolated teaching demo cannot run. IMPORTANT marks a meaningful security, correctness, or reliability concern. SUGGESTION marks a narrower improvement. Proposed changes are in the [roadmap](11-improvement-roadmap.md).

## R1 — Mock identity is not real authentication

**BLOCKER for public identity-based use; confirmed.** [AuthService](../apps/api/src/auth/auth.service.ts) issues identities for selected existing users without proving who the caller is. The guard only disables the mock for exact `NODE_ENV=production`, and no real provider adapter replaces it.

A development-mode server exposed to untrusted callers enables persona impersonation. Production mode prevents that login mechanism but leaves no usable real login. Add a real provider integration, explicit configuration validation, and production tests. Do not describe state/PKCE alone as proof of user identity.

## R2 — Public template CRUD and incomplete DTO validation

**BLOCKER before unrestricted public exposure; confirmed.** [LinksController](../apps/api/src/links/links.controller.ts) has no session, permission, tenant, or origin check. Its read/delete surface is independent of retail's protection. The app has no global authentication guard to cover new routes automatically.

Link DTOs have Swagger annotations but no class-validator field decorators. Global whitelisting can strip their fields; a typed request interface does not guarantee a functioning validated write. Remove unused scaffold routes or protect and validate them explicitly, with HTTP-level tests for anonymous reads/writes/deletes and malformed IDs.

## R3 — A refund is only a status change

**BLOCKER for real refunds/accounting; confirmed.** [OrdersService.refund](../apps/api/src/orders/orders.service.ts) marks REFUNDED but creates no payment reversal, refund entity, reason, audit entry, or stock return. A “paid” sale also has no payment-provider proof.

The UI can reduce its recent-sales total while no money has moved. Define payment, return, and refund semantics before adding a provider; use durable operation state and reconciliation. Keep the current action labeled as a demonstration until that exists.

## R4 — Repeated sales and adjustments are not idempotent

**IMPORTANT; confirmed.** [RetailService](../apps/api/src/retail/retail.service.ts) uses transactions and conditional stock changes, but there is no request identity or saved result. A response lost after commit followed by a retry can create another sale or apply an adjustment twice.

Atomicity protects one execution; it does not deduplicate executions. Add a caller-scoped idempotency key, uniqueness constraint, request fingerprint, and stored result. Test simultaneous duplicates and response-loss recovery.

## R5 — Tenant consistency relies partly on writers

**IMPORTANT; confirmed constraints, conditional exposure.** The [schema](../packages/prisma/prisma/schema.prisma) relates Order to Store and StoreProduct to Product/Store by ID without composite tenant consistency. The dashboard scopes the parent Store and then includes child rows without independently filtering every child's tenant/region.

The current sale path creates consistent records. A future importer, direct SQL edit, or buggy writer could attach another tenant's child data to an authorized store and have it included. This is not a demonstrated cross-tenant exploit through the existing sale API. Validate all writers and consider composite keys/constraints or another explicit tenant-isolation strategy with migration tests.

## R6 — Dashboard read permission is broader than order detail

**IMPORTANT for custom roles; confirmed.** The BFF and dashboard check `store.read` and include orders, while order detail checks `order.read`. All seeded workforce roles have both, so the difference is hidden in current personas.

A future role with only store.read would still see order information. Decide whether store.read intentionally includes this data or whether each response segment needs separate grants. Add a custom-role test so the behavior is a deliberate contract.

## R7 — Limited auditability and reconciliation

**IMPORTANT for operational use; confirmed.** Audits cover sales and stock adjustments, but not status transitions, refunds, permission edits, or denied actions. Actor IDs and movement sale references are unstructured strings. Audit rows are not append-only at the database level, and stock is not constrained to equal movement history.

Receipt totals are calculated correctly by the current sale path, but the database does not enforce order/item agreement. Legacy seeded orders have no items. Introduce structured operation references, audit coverage, and reconciliation checks before treating these logs as complete financial or security evidence.

## R8 — Authentication flow lacks production failure handling

**IMPORTANT; confirmed.** Code consumption is held in a process-local map, so restart/multiple processes do not share replay state. Callback fetch has no explicit timeout; returned JSON lacks runtime shape validation. Mock token input is not a decorated DTO. Session creation matches mutable display name as well as subject.

There is no stable provider issuer/subject mapping, durable attempt consumption, key rotation, or session cleanup. Access JWTs can be renewed while the one-hour opaque session is valid; the session itself has no rolling renewal. `WEB_URL`/`WEB_ORIGIN` should be explicitly configured so public auth redirects do not fall back to request Host/protocol. Use explicit trusted configuration and durable provider-flow state when replacing the mock.

## R9 — Environment and local tooling can leak or misroute data

**IMPORTANT outside isolated development; confirmed.** [db-start.sh](../scripts/db-start.sh) prints the password and full database URL. Compose publishes the database port without a loopback-only binding. The environment distribution script replaces workspace-local regular .env files with root symlinks.

The new BFF uses `API_INTERNAL_URL` for private calls and `WEB_URL`/`WEB_ORIGIN` for public redirects and Origin checks. Misconfiguration can still break callbacks or proxying; keep the two web settings aligned and keep the internal URL private. Consolidate validated configuration, remove credential logging, and document the chosen proxy/cookie/origin topology.

## R10 — CI does not verify critical behavior

**IMPORTANT; confirmed.** [CI](../.github/workflows/ci.yml) builds and checks style/types but does not run tests or real-database integration. Service tests often mock Prisma; frontend tests do not cover StoreDashboard. A green pipeline therefore does not establish login, branch isolation, stock races, or override behavior.

Run unit tests in CI, then migrate/seed a disposable PostgreSQL instance for integration. Add browser coverage for disabled refund controls, override rejection, logout, and permission-specific workflows. Include rollback, duplicate-request, limit-boundary, and stale-state scenarios.

## R11 — Reporting and query scale are limited

**IMPORTANT if used for business reporting; confirmed limits, unmeasured scale.** Only 50 recent orders and 15 events are returned per store. The dashboard totals that window; it is not a complete report. Stores and products are unpaginated.

The actual cost of nested relation limits must be measured using generated SQL/query plans, not inferred from the response size. Define reporting periods and aggregate queries, paginate large lists, and add indexes only after inspecting relevant plans. No latency or capacity benchmark was performed here.

## R12 — UI snapshots and contracts can become stale

**IMPORTANT for independent deployments; confirmed.** Capabilities are advisory snapshots. Server enforcement handles changed order eligibility, but focus refetch is disabled and the query key is not identity-specific. Today full login/logout navigation recreates state; future in-app identity switching needs explicit cache isolation. Direct bearer tokens may retain an old grant for up to 60 seconds after a role change unless the session is revoked.

The frontend expects capabilities to exist. Handwritten response interfaces have no runtime validation and do not exactly enumerate Prisma-spread response fields. Changing API and web independently requires a compatibility plan. Only refunds expose a resource-specific capability; other controls use shared `can()` plus local status display rules. Dynamic business rules still belong to Nest.

## R13 — Operational controls are incomplete

**IMPORTANT before production; confirmed omissions in the inspected app.** The BFF exchanges the session for a JWT on every protected request, adding a database read. There is no application rate limiter, comprehensive security-header configuration, structured request/audit telemetry, readiness probe, backup/restore automation, or cleanup worker. `/` returns metadata without checking the database. The inherited public Links scaffold remains public through the BFF. No complete deployment or rollback pipeline is checked in.

Infrastructure outside the repository might supply some controls, but none was verified. Establish ownership and acceptance tests rather than assuming those controls exist. This documentation makes no statement about dependency CVEs because no dependency/security scan was performed.

## R14 — Smaller correctness and usability gaps

**SUGGESTION unless expanded scope makes them critical; confirmed.** Successful refund HTTP status is hardcoded in the UI. Monetary values are converted to JavaScript numbers for transport/display. Reason length is validated before trim. Native frontend dialog/error behavior has no dedicated automated accessibility coverage.

The sale's conditional stock update rechecks listing availability and price but not the related Product.active flag read earlier in the transaction. There is no catalog-edit endpoint today; concurrent administrative deactivation is a conditional future concern. Recheck that condition if editable catalog lifecycle becomes supported.

Capture real response metadata, define an explicit money transport contract for financial APIs, normalize before validating meaningful text length, and add interaction tests. Keep these focused improvements proportionate to the demo's purpose.
