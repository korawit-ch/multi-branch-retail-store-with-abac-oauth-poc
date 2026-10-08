# Authentication and sessions

[Documentation index](README.md) · [BFF request architecture](12-bff-authentication-architecture.md)

## Identity boundary

This repository uses a local mock authorization-code flow with state and PKCE. It demonstrates the redirects and proof-of-possession mechanics, but choosing a seeded persona is sufficient to claim that identity in development. It is not a real OAuth/OIDC provider. The mock rejects use when `NODE_ENV` is exactly `production`; no production provider adapter is implemented.

NestJS still owns authorization-code creation/exchange, identity mapping, application sessions, and revocation. Next.js now proxies the browser-facing auth paths so the browser receives cookies from its own origin. This preserves the existing mock flow while placing protected API calls behind Next.

## Login sequence

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js auth proxy
  participant A as NestJS auth
  participant D as PostgreSQL
  B->>N: GET /auth/login?persona=mock-manager-10
  N->>A: Forward login
  A-->>N: Set oauth_attempt; redirect to web /mock-provider/authorize
  N-->>B: Forward cookie and redirect
  B->>N: GET /mock-provider/authorize
  N->>A: Forward authorization request
  A->>D: Look up selected mock user
  A-->>B: Redirect through Next to /auth/callback
  B->>N: GET /auth/callback with attempt cookie
  N->>A: Forward callback and cookie
  A->>A: Validate state and redeem code using PKCE
  A->>D: Insert hashed application session
  A-->>N: Set app_session; redirect /dashboard
  N-->>B: Forward cookie and redirect
```

The [AuthService](../apps/api/src/auth/auth.service.ts) generates random state and a PKCE verifier. An encrypted `oauth_attempt` cookie lasts five minutes. The mock code expires after 60 seconds, binds the redirect URI and challenge, and is consumed once in the issuing API process. The callback validates state, then Nest redeems the code against its private `/mock-provider/token` route using `API_INTERNAL_URL` (or the local port fallback). The mock returns subject and display name rather than a standards-based provider token. [SessionService](../apps/api/src/auth/session.service.ts) requires a matching existing user ID and name.

The public redirect URI is based on `WEB_URL`, then `WEB_ORIGIN`, so it points at the Next proxy. An unconfigured web URL falls back to the request protocol/Host in the auth controller; configure an explicit trusted URL for deployment. Failure clears the attempt and normally redirects to `/?error=login_failed`.

## Opaque application session

Session creation generates a random 32-byte token. PostgreSQL stores its SHA-256 hash in `AuthSession`, along with user ID, one-hour expiry, and nullable revocation time. The encrypted HttpOnly `app_session` cookie contains the raw token and expiry. It contains no role or permission claims.

For each BFF exchange, Nest decrypts the cookie, checks expiry, hashes the token, finds an active session, and loads current user, role permissions, and store assignments. The opaque session can obtain new short-lived access JWTs until its one-hour expiry; this does not extend the session itself. A role/assignment edit appears at the next BFF exchange.

## Access JWT

`POST /auth/access-token` is an internal BFF exchange. It requires the opaque cookie plus a server-only exchange key derived from `AUTH_COOKIE_SECRET`. No valid key means denial before session lookup. Its response is `Cache-Control: no-store` and contains a 60-second HS256 JWT with subject, session hash, tenant, region, permissions, store IDs, role, customer ID, and refund limit. Signing uses a purpose-separated derived key. The JWT is returned only to the Next server, never to browser JavaScript.

[Next's BFF](../apps/web/app/api/bff/[...path]/route.ts) verifies the JWT and checks the shared `can()` policy before forwarding a protected request. [Nest's AccessTokenService](../apps/api/src/auth/access-token.service.ts) verifies the JWT independently and looks up the referenced session hash again. It rejects an expired or revoked session even if the JWT has time remaining. Controllers/services reapply authorization; domain queries check ownership and mutable state.

A direct bearer token is a short-lived authorization snapshot. If permissions are removed without revoking the session, an already issued direct token may retain its old grants until its 60-second expiry. Normal browser requests exchange afresh each time. A direct cookie-only request to a protected Nest route is rejected. Neither revocation nor token expiry cancels work that already passed its check.

## Cookie encryption, origin, and logout

[auth.crypto.ts](../apps/api/src/auth/auth.crypto.ts) uses AES-256-GCM with a random IV and authentication tag. Cookies are HttpOnly, SameSite=Lax, and Path=/; Secure is added in production. They are host scoped, so local ports on the same hostname share the cookie domain. `AUTH_COOKIE_SECRET` must decode to at least 32 random bytes. Replacing it invalidates existing cookies/JWTs; key rotation with overlapping keys is not implemented.

Browser writes to the BFF require the configured web Origin. Nest also requires the trusted Origin for retail/order writes and logout. Nest no longer enables credentialed browser CORS. `POST /auth/logout` and `/auth/logout-all` run through Next, revoke the current or all applicable database sessions, clear `app_session`, and redirect with 303. A missing/invalid cookie causes no database revocation but still clears the browser cookie.

Expired and revoked rows have no cleanup worker. The mock consumed-code map is process-local. The callback's internal fetch has no explicit timeout or runtime validation of the mock token response. No real provider credentials, discovery, signed provider-token verification, account linking, provider logout, refresh-token flow, key rotation, or device management exist. See [risks](10-risks-and-limitations.md).
