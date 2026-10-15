# Authentication and sessions

[Documentation index](README.md) · [BFF request architecture](12-bff-authentication-architecture.md)

## Identity boundary

This repository uses a local mock authorization-code flow with state and PKCE. Selecting a seeded persona is sufficient to claim that identity in development. It is not a real OAuth/OIDC provider. The mock rejects use when `NODE_ENV` is exactly `production`; no production provider adapter is implemented.

Nest owns authorization-code creation/exchange, identity mapping, application sessions, and access-token issuance. Next proxies the browser-facing auth paths so cookies stay on the web origin.

## Login sequence

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next auth proxy
  participant A as Nest auth
  participant D as PostgreSQL
  B->>N: GET /auth/login?persona=mock-manager-10
  N->>A: Forward login
  A-->>N: oauth_attempt cookie + provider redirect
  N-->>B: Forward cookie and redirect
  B->>N: GET /mock-provider/authorize
  N->>A: Forward authorization request
  A-->>B: Redirect through Next to callback
  B->>N: GET /auth/callback with attempt cookie
  N->>A: Forward callback and cookie
  A->>A: Validate state and redeem code with PKCE
  A->>D: Create hashed application session
  A->>D: Load current role grants and store assignments
  A-->>N: app_session + access_token cookies; redirect
  N-->>B: Forward cookies and dashboard redirect
```

[AuthService](../apps/api/src/auth/auth.service.ts) generates random state and a PKCE verifier. An encrypted `oauth_attempt` cookie lasts five minutes. The mock code expires after 60 seconds, binds the redirect URI and challenge, and is consumed once in the issuing API process. The callback validates state and redeems the code against Nest's private `/mock-provider/token` route. The mock returns subject and display name rather than a standards-based provider token. [SessionService](../apps/api/src/auth/session.service.ts) requires a matching existing user ID and name.

The public callback URI uses `WEB_URL`, then `WEB_ORIGIN`, so it points at the Next proxy. Configure an explicit trusted URL for deployment. Failure clears the attempt and normally redirects to `/?error=login_failed`.

## Opaque renewal session

Session creation generates a random 32-byte token. PostgreSQL stores its SHA-256 hash in `AuthSession` with user ID, one-hour expiry, and nullable revocation time. The encrypted HttpOnly `app_session` cookie contains the raw token and expiry, not role or permission claims. The session is checked on refresh and logout; its expiry is not extended by refresh.

`POST /auth/refresh` requires the configured web Origin and a valid application session. Nest reloads role permissions and assignments, rebuilds the typed grant matrix, signs a fresh access token, and returns a new HttpOnly cookie. Concurrent refresh requests may issue multiple valid snapshots; the browser keeps the last response. The client fetch helper coalesces refreshes within one page instance and retries the original 401 request once.

## Short-lived authorization token

The separate `access_token` cookie contains a ten-minute HS256 JWT. It signs the subject, tenant, assigned store IDs, role, and [typed permission grants](04-authorization-and-capabilities.md). Next and Nest both verify the signature, issuer, audience, expiry, and grant shape using the shared runtime-independent package. Next only checks named permission; Nest resolves resource scope into database predicates and reads current region, customer mapping, and refund limit. A direct cookie-only Nest retail/order request is rejected.

`AUTH_JWT_SECRET` must be independent from the at-least-32-byte `AUTH_COOKIE_SECRET`. Both server processes need the JWT secret; browser JavaScript receives neither secret nor token. HS256 means Next also possesses signing material. Asymmetric signing and key rotation are future production improvements.

## Logout, revocation, and stale access

`POST /auth/logout` and `/auth/logout-all` pass through Next, revoke the current or all applicable database sessions, clear both cookies, and redirect with 303. A missing or invalid session causes no database revocation but still clears the browser cookies. A copied opaque session cannot renew after revocation.

A copied access JWT can remain valid until its ten-minute expiry even after logout or a role/assignment change. Nest does not query `AuthSession` during ordinary domain requests. It does load current user domain attributes and rejects a tenant change. Revocation does not cancel a request that has already passed its check. Use a session/version lookup or token denylist if immediate access-token invalidation is required.

The cookies are HttpOnly, SameSite=Lax, host scoped, and Secure in production. [auth.crypto.ts](../apps/api/src/auth/auth.crypto.ts) uses AES-256-GCM for the attempt and session cookies. Browser writes to the BFF and Nest mutations require the trusted Origin; credentialed browser CORS is not enabled.

Expired/revoked session rows have no cleanup worker. Mock code replay protection is process-local, and the callback's internal fetch has no explicit timeout or runtime validation of the mock token response. Real provider discovery, signature validation, account linking, provider logout, and key rotation remain unimplemented. See [risks](10-risks-and-limitations.md).
