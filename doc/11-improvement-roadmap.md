# Improvement roadmap

[Documentation index](README.md)

These are proposed changes, not features delivered by this documentation update. Priorities assume the next goal is a reliable authenticated pilot. If the goal remains an isolated teaching demo, start with tests, clearer boundaries, and capability consistency; real payment infrastructure is unnecessary until real payments are in scope.

## Stage 1 — Make the existing demo verifiable

### Add meaningful CI checks

Addresses R10. Keep current lint/build checks, add API/web unit tests, then run committed migrations and the retail integration script against disposable PostgreSQL. Give each CI run isolated data and configure a valid development secret without printing it.

Acceptance criteria:

- CI fails for a removed branch predicate, a broken refund policy, or an overselling race.
- Fresh migration application includes all five SQL CHECK constraints.
- A transaction failure after stock mutation leaves no partial order/history changes.
- Browser tests show a denied refund disabled, override enables only the control, and the backend returns 403 without changing the order.

### Resolve public scaffold behavior

Addresses R2. Choose whether Links is still a product feature. Remove unused public endpoints or apply authentication, authorization, input validation, and deliberate access scope. Avoid silently importing retail assumptions into an unrelated feature.

Acceptance criteria: anonymous route tests match the documented access policy; decorated DTOs retain valid input and reject invalid input; malformed IDs are controlled errors; public API inventory matches reality.

### Consolidate configuration

Addresses R8/R9. Introduce validated API/web configuration with clear private/public fields, explicit trusted callback origin, consistent web origin, and safe local database tooling. Remove credential output and make development network bindings deliberate.

Acceptance criteria: startup rejects missing/malformed required settings; all login/fetch/logout routes use the intended API; changing local ports follows one documented procedure; no startup output contains credentials.

## Stage 2 — Prepare a real authenticated pilot

### Replace the mock provider

Addresses R1/R8. Keep mock personas behind explicit development configuration. Add a real provider adapter at the existing auth boundary rather than coupling identity logic to retail services. Map stable issuer/subject identity to local User, with deliberate onboarding and account deactivation behavior.

Define provider response validation, state/PKCE and any OIDC checks, bounded timeouts, durable one-time flow state, session expiry/revocation, JWT/key rotation, and cleanup. Preserve the BFF cookie-to-token boundary. Do not select or promise provider-specific behavior without reviewing that provider's contract.

Acceptance criteria: no persona-based login path works in deployed mode; identity tests cover invalid/expired/replayed responses and restart/multiple-instance behavior; logout/revocation works across instances; authenticated users still require resource authorization.

### Close authorization contract gaps

Addresses R5/R6/R12. Decide the intended relationship between store.read and order.read. Extend resource capabilities to stock adjustment, sale, and order transitions where eligibility is resource-dependent. Each capability must derive from the same server policy used by its write. Add the named permission to the shared `can()` vocabulary and both BFF and Nest route checks.

Return stable reason codes alongside human-readable messages if the frontend needs localization or differentiated UX. Keep explanations from leaking inaccessible resource details. Do not expose a request parameter that bypasses backend policy.

Acceptance criteria: changing a server policy changes both capability output and mutation eligibility; custom-role tests verify data visibility; stale snapshots never authorize a write; identity changes clear or isolate cached responses.

### Strengthen tenant integrity

Addresses R5/R7. Inventory every writer: API, seed, migration, admin tooling, and future imports. Determine whether composite tenant-aware keys/foreign keys, restricted database roles, or another explicit isolation mechanism best fits this small schema. Validate and repair existing records before adding constraints.

Acceptance criteria: deliberately inconsistent tenant relationships are rejected or detected before exposure; cross-tenant tests include dashboard children and direct order reads; migration/backfill tests preserve valid data. Avoid claiming PostgreSQL row-level security exists until actually implemented and exercised with the real connection role.

## Stage 3 — Make operations recoverable

### Add idempotent mutations

Addresses R4. Add durable operation identity with a uniqueness boundary scoped to actor/tenant and action. Store a request fingerprint and completed response so identical retries return the same result, while a reused key with different input is rejected. Write the operation record and local effects within the appropriate transaction.

Acceptance criteria: simultaneous identical requests create one sale or adjustment; retry after a lost response returns the original result; keys cannot expose another tenant's result; failed/in-progress operations have defined retry semantics.

### Expand audit and reconciliation

Addresses R7. Record status/refund and authorization-administration changes with actor, resource, operation/request ID, structured metadata, and timestamps. Separate inventory movements from security audit purpose. Define retention and restricted write access.

Acceptance criteria: every supported state change has traceable history; order totals and inventory balances can be reconciled; seeded legacy exceptions have an explicit migration strategy; sensitive tokens and unnecessary personal data are excluded from logs.

### Define real refund semantics before implementing payments

Addresses R3/R4/R7. Decide whether refunds require returning stock, whether returns can be partial, and how discounts/tax/currency are represented. Introduce Payment/Refund or equivalent durable state only after defining their lifecycle. Plan provider idempotency, webhook validation/deduplication, retries, and reconciliation.

External payment calls should not simply be placed inside the current database transaction. Use a durable operation/outbox or another explicit recovery strategy so a provider success and a local failure can be reconciled.

Acceptance criteria: provider timeouts do not cause double refunds; duplicate webhooks are safe; pending/failed/completed states are distinguishable; payment and inventory return policies are independently explicit; financial totals reconcile with provider records.

## Stage 4 — Improve usability, scale, and operation

### Evolve the dashboard without replacing the template

Addresses R11/R12/R14. Split the large dashboard into feature-focused components when changes warrant it. Preserve shared UI primitives, frontend-owned fetch, and TanStack Query. Add pagination and date-bounded aggregate endpoints instead of deriving reports from the latest 50 orders.

Acceptance criteria: users can distinguish recent activity from complete reports; large catalogs do not require loading all data; response measurements justify indexes; keyboard and mobile workflows are tested; success/error panels reflect actual response metadata.

### Establish a production runbook

Addresses R9/R13. Define deployment topology, TLS/proxy and cookie settings, database permissions, migration ordering, compatibility/rollback, readiness, secret rotation, backup/restore, session cleanup, and alert ownership. Add structured request IDs and useful latency/error metrics with redaction.

Acceptance criteria: a restore drill succeeds; a failed migration has a documented recovery procedure; expired sessions are cleaned predictably; health checks distinguish liveness from database readiness; an operator can diagnose login and mutation failures without exposing secrets.

## Keep changes reviewable

Implement each stage as small coherent changes with its own contracts, migration considerations, tests, and documentation. Build the API producer before a frontend consumer that requires a new field, or explicitly support mixed versions. Preserve the repository's controller → service → Prisma direction and runtime-independent contract package.

Before marking an improvement complete, verify its acceptance criteria and update the [risk register](10-risks-and-limitations.md) from “current limitation” to an accurate description of the new behavior. A renamed button or an added interface does not by itself resolve a backend or data-integrity risk.
