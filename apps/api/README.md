# NestJS API

This app owns the mock OAuth authorization-code flow, PostgreSQL-backed application sessions, access-token issuance and verification, and retail domain writes. Start with the [project README](../../README.md) for setup and the [BFF architecture guide](../../doc/12-bff-authentication-architecture.md) for request flow and trust boundaries.

Build shared packages from the repository root before running the API alone:

```bash
npm run build
npm run dev --workspace=api
```

`API_PORT` controls the listener (default `3001`). Next.js reaches it at `API_INTERNAL_URL`, which defaults to `http://localhost:${API_PORT || 3001}`. The browser uses the Next.js `/api/bff` route for protected requests. Direct retail and order requests to Nest require a bearer access JWT; an `app_session` cookie alone is not accepted. The internal `POST /auth/access-token` exchange requires both that cookie and the server-derived BFF key.

Protected controllers verify the JWT and active database session on every request. Services enforce tenant, region, assigned-store, customer ownership, and mutable business conditions through scoped queries and transactions. The legacy Links scaffold is public and should not be copied as a protected-route pattern.

The mock persona login works only outside `NODE_ENV=production`; this repository has no production identity-provider adapter. See [authentication and sessions](../../doc/03-authentication-and-sessions.md), the [API reference](../../doc/07-api-reference.md), and [development and verification](../../doc/09-development-and-verification.md).
