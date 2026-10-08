# Repository guidance

## Architecture

- This is an npm-workspaces/Turborepo repository. `apps/web` uses Next.js App Router, React, and TanStack Query; `apps/api` uses NestJS; `apps/db` provides local PostgreSQL Compose.
- `packages/prisma` owns the schema, migrations, seed, and database client. Read SQL migrations as well as the Prisma schema: retail CHECK constraints are migration-only.
- `packages/api-client` contains typed endpoint descriptors and serialized interfaces. `packages/authorization` owns the shared runtime-independent `can()` policy and access-token format. Keep it free of fetch execution, React, and Next.js runtime dependencies. Web transport belongs in `apps/web/lib/fetch` and the explicit Next.js BFF routes.
- Reuse the existing UI, design-system, icons, and configuration packages. Keep Prisma runtime and secrets out of browser components.
- Start with [doc/README.md](doc/README.md) for the project map and detailed behavior.

## Authorization and data integrity

- The browser sends protected requests to the Next.js BFF. Next exchanges an opaque cookie for a short-lived JWT and checks `can()`; Nest verifies the bearer token and database session independently. Controllers explicitly protect routes; there is no global auth guard. The inherited Links scaffold is public and must not be used as a security pattern.
- Services reuse shared `can()` and own dynamic resource scope. Preserve tenant, region, and assigned-store predicates; customer order reads additionally use customer ownership.
- `apps/api/src/orders/refund.policy.ts` supplies both refund capabilities and the conditional refund write. Capabilities are advisory snapshots; always enforce eligibility again during mutation.
- The demo refund override is local UI state only. Never add a server authorization bypass for it.
- Sale and adjustment transactions must keep stock, movement history, and audit writes together. Preserve conditional stock decrements and server-calculated prices/receipt snapshots.
- Mock login is for development; production mode disables it and has no replacement provider today. Refunds only change status and are not payment operations.

## Development and verification

- Use the root manifests/scripts as authority. Shared packages export built artifacts, so build dependencies before standalone application tests when needed.
- Typical checks: `npm run build`, `npm run test --workspace=api -- --runInBand`, `npm run test --workspace=web -- --runInBand`, affected workspace lint, and `npx turbo run check-types`.
- `npm run test:retail` requires a running seeded development API/database. It creates persistent orders/history while restoring tested stock; run it only against an isolated demo database.
- Apply committed migrations for faithful constraints. Client generation and `db:push` do not recreate migration-only checks.
- The seed is not a reset: it changes grants/assignments but preserves existing inventory/orders. Do not run it against business data.
- Root `.env` is ignored. Environment distribution replaces regular workspace `.env` files with symlinks; keep intended settings at the root and never commit secrets.
- Documentation-only changes need scoped formatting and link checks; do not mutate the demo database merely to verify prose.

## Documentation and Git

- Maintain explanatory Markdown in `doc/`; existing screenshot assets remain in `docs/screenshots/`. Link new guides from the index and distinguish current behavior from proposals.
- Current CI checks lint/format/types/build, not behavioral tests. The local `test:retail` now requires both web and API servers. Do not report a green build as proof of authorization or concurrency behavior.
- Recent history uses scoped Conventional Commits. Pre-commit runs lint-staged/type checks; commit-msg runs commitlint.
- Reinspect branches/remotes before Git operations. Do not assume a develop/release workflow; the inspected repository uses main and has no checked-in release automation.
