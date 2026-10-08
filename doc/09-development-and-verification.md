# Development, operations, and verification

[Documentation index](README.md)

## Local setup

Use Node.js 22.12 or newer, npm, Docker, and Compose. The repository declares npm 10.2.3 as its package-manager version. Several wrapper scripts invoke the legacy `docker-compose` executable; if your installation only exposes `docker compose`, use the equivalent Compose commands directly or update the wrappers deliberately.

From the repository root:

```sh
npm ci
```

The root postinstall creates `.env` from `.env.example` if missing. Generate a secret locally, then put it in the ignored root `.env` as `AUTH_COOKIE_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Confirm database/API/web settings before starting anything. Then:

```sh
npm run env:distribute
npm run db:up
npx prisma migrate deploy --config packages/prisma/prisma.config.ts
npm run db:seed
npm run build
npm run dev
```

Wait for PostgreSQL to become ready before running migrations. The build generates Prisma and builds workspace packages needed by application imports and shared test configuration. `dev` runs the environment-distribution pre-hook but does not itself apply migrations or seed data.

Default URLs are web `http://localhost:3000`, API `http://localhost:3001`, Swagger `http://localhost:3001/api`, and PostgreSQL host port 5433. The older walkthrough records one developer's 3100/3101/55435 setup; those are historical local settings, not portable defaults or proof of currently running services.

## Configuration inventory

[.env.example](../.env.example) is the starting point.

- `DB_USER`, `DB_PASSWORD`, `DB_NAME`: local Postgres bootstrap values.
- `DB_PORT`: host-published database port; container Postgres still listens on 5432.
- `DB_CONTAINER_NAME`: local container identity; use a distinct value to avoid conflicts.
- `DATABASE_URL`: authoritative Prisma connection string. The initial setup script expands template defaults; changing DB\_\* later does not automatically rewrite an existing URL. Keep them aligned explicitly.
- `API_PORT`: API listening port.
- `API_INTERNAL_URL`: private NestJS address used by Next and the API mock-code exchange; local fallback is `http://localhost:${API_PORT || 3001}`.
- `API_PUBLIC_URL`, `NEXT_PUBLIC_API`, `NEXT_PUBLIC_API_URL`: legacy/template settings. Protected browser calls now use same-origin `/api/bff`; auth redirects use `WEB_URL`/`WEB_ORIGIN`.
- `WEB_ORIGIN`: browser-facing origin used for BFF and Nest mutation Origin allowlists; Nest no longer enables credentialed browser CORS.
- `WEB_URL`: auth redirect target and preferred logout Origin comparison; keep equal to the intended web origin.
- `NODE_ENV`: mock authentication is disabled only for exact `production`.
- `AUTH_COOKIE_SECRET`: random base64url-encoded material of at least 32 bytes, shared privately by Next and Nest for purpose-separated cookie, internal exchange, and JWT keys.

Do not copy real secret values into documentation, screenshots, commits, or shell output. Next public variables are visible to browsers. `API_INTERNAL_URL` and `AUTH_COOKIE_SECRET` must remain server-only.

The [distribution script](../scripts/distribute-env.js) replaces regular workspace `.env` files with symlinks to the root file for apps and most packages. Keep local settings at the root; preserve any workspace-specific file before intentionally running this script. Shared config packages are excluded.

## Database lifecycle

- `npm run db:up`: start the local PostgreSQL Compose service.
- `npm run db:ps` / `npm run db:logs`: inspect service state/logs.
- `npm run db:down`: stop/remove Compose containers; the normal command does not remove the named data volume.
- `npm run db:generate`: generate Prisma client types; does not migrate data.
- `npm run db:migrate`: development migration creation/application through `prisma migrate dev`.
- `npx prisma migrate deploy --config packages/prisma/prisma.config.ts`: apply committed migrations.
- `npm run db:seed`: install/update demo data with the non-reset behavior described in [overview](01-project-overview.md).
- `npm run db:studio`: open database administration UI; direct edits can bypass service-level invariants.
- `npm run db:push`: schema synchronization for experimentation; insufficient to recreate migration-only CHECK constraints.

The Compose file uses a named volume. Do not remove volumes as routine troubleshooting. There is no checked-in backup/restore or migration rollback procedure; define and exercise those before relying on persistent business data.

The `db:start` helper waits for readiness but has no bounded wait and prints the password and connection URL. Avoid it with sensitive credentials. Compose publishes a host database port without a loopback address restriction in its port mapping; review network exposure outside isolated development.

## Verification commands

The following are repository commands, not a claim that they were executed for every documentation update:

```sh
npm run build
npm run test --workspace=api -- --runInBand
npm run test --workspace=web -- --runInBand
npm run lint --workspace=api
npm run lint --workspace=web
npm run lint --workspace=@repo/api-client
npx turbo run check-types
npm run test:retail
```

The root `npm run lint` also performs a broad Prettier check. For documentation-only work, scope formatting and link checks to the changed Markdown. Run behavioral checks when changing executable behavior.

### Unit tests

API unit suites cover mock state/PKCE/code replay and production guard, session hashing/revocation, access-token exchange/signature/expiry/revocation, order scopes/refund predicates and stale decisions, retail permission/stock/price behavior, and basic template controllers/services. Several use mocked Prisma calls, which verify service decisions but do not prove actual PostgreSQL constraints or concurrency.

The web suite covers FeatureBadge and the BFF route allowlist. It does not exercise the dashboard's refund checkbox, dialogs, error rendering, query invalidation, or accessibility. Test file presence does not establish coverage of those workflows.

### Live retail integration script

[scripts/test-retail.mjs](../scripts/test-retail.mjs) requires running Next.js and NestJS servers plus a seeded real development database. It follows mock login through Next, checks BFF and direct Nest authentication/authorization, branch scope, denied writes, input/origin validation, negative-stock rejection, receipt snapshots, capability denials, order transitions, and session revocation.

Its concurrency scenario sets coffee stock to one, sends two sale requests, and expects one 201 and one 400. It restores the original stock in a finally block, but leaves the created order, movement history, and audit entries. It also creates sessions and normally revokes its own sessions. It is not a read-only health check or a fully isolated rollback test. Use only a disposable/local demo database.

The Nest `test:e2e` suite is a separate root-API smoke test. It does not replace the retail integration script or a real-browser suite and does not recreate all bootstrap configuration from `main.ts`.

## CI and Git conventions

[CI](../.github/workflows/ci.yml) runs on pushes and pull requests. It installs dependencies, generates Prisma, builds packages, runs lint/formatting, runs available workspace type checks, and builds the applications. It does **not** run unit tests, create a PostgreSQL service, apply migrations, or run the retail integration test.

The [pre-commit hook](../.husky/pre-commit) runs lint-staged and Turbo type checks. Commit messages use scoped Conventional Commits via commitlint. Hooks are local conveniences, not a replacement for CI.

The inspected checkout has `main` tracking `origin/main`; recent history uses `feat(scope): ...` and `docs(scope): ...`. No develop branch, release branches, tags, or release/publishing automation were observed in the inspected refs/configuration. Do not invent Git Flow or a tagging process from generic conventions. Recheck remote refs and project policy before changing branch/release workflows.

## Troubleshooting by symptom

- **Login fails:** confirm a seeded user, working database, valid cookie secret, development mode, matching Next callback URL and reachable private mock-token-exchange endpoint. Inspect server errors without logging cookies or tokens.
- **Mutation gets 403:** distinguish incorrect Origin, missing permission, wrong tenant/region/branch, refund limit, and invalid/stale state. Check the response message and current actor/capability.
- **Fetch fails but login works:** confirm both servers have the same private cookie secret, Next can reach `API_INTERNAL_URL`, and `WEB_URL`/`WEB_ORIGIN` match the browser origin. Browser retail fetches must target `/api/bff`.
- **Workspace/package import fails:** build shared packages; many exports point at `dist` rather than source.
- **Database constraint differs from this guide:** inspect applied migrations. Generating the client or using db push alone is not evidence that SQL CHECKs exist.
- **Dashboard seems stale:** focus refetch is disabled; refetch the retail query or reload. Other users' changes are not pushed live.
- **Seeded order no longer refundable:** seed preserves existing order state. Use a newly created paid sale or a deliberately recreated demo database.

## Production operation is future work

There is no complete production deployment topology, real identity-provider adapter, migration orchestration pipeline, readiness endpoint, session cleanup scheduler, monitoring stack, or disaster-recovery procedure. Building the app verifies compilation; it does not supply those capabilities. The [roadmap](11-improvement-roadmap.md) orders the work needed before a broader deployment.
