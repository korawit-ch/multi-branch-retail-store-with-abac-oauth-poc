# Authentication and sessions

[Documentation index](README.md)

## Actual security boundary

This is a local mock authorization-code flow with state and PKCE. It demonstrates protocol mechanics; it does not authenticate a real person or implement a complete external OAuth/OIDC integration. Selecting an existing persona is sufficient to obtain that identity in development.

[AuthService](../apps/api/src/auth/auth.service.ts) rejects mock-provider usage when `NODE_ENV` is exactly `production`. There is no production identity-provider replacement in the repository. A successful production build does not make login production-ready, and an unset or misspelled environment does not disable the mock.

## Login sequence

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as NestJS auth
  participant M as Local mock provider
  participant D as PostgreSQL
  B->>A: GET /auth/login?persona=mock-manager-10
  A-->>B: Set oauth_attempt; redirect with state and challenge
  B->>M: GET /mock-provider/authorize
  M->>D: Look up selected user
  M-->>B: Redirect to callback with code and state
  B->>A: GET /auth/callback (attempt cookie)
  A->>A: Validate attempt expiry and state
  A->>M: POST /mock-provider/token (code and verifier)
  M->>M: Validate code, redirect, PKCE, replay state
  M-->>A: Subject and display name
  A->>D: Validate user; create hashed-token session
  A-->>B: Set app_session; clear attempt; redirect /dashboard
```

1. Login generates random state and a verifier, each from 32 random bytes. The challenge is the SHA-256 base64url representation of the verifier.
2. An encrypted `oauth_attempt` cookie holds the attempt for five minutes. The mock authorization URL includes client ID `demo-app`, the exact API callback URL, state, and S256 challenge.
3. The mock provider validates its expected request parameters and looks up the requested existing user. Its code is encrypted, expires after 60 seconds, and binds subject/name, challenge, and redirect URI.
4. The callback validates state against the attempt cookie, then calls the API's own token route from the server with the verifier.
5. Token exchange checks expiry, callback binding, PKCE, and an in-memory consumed-code map. It returns identity data rather than a provider access token or ID token.
6. Session creation requires an existing user whose ID and name match that returned identity. Success sets the application cookie and redirects to the dashboard. Failure clears the attempt and redirects to `/?error=login_failed`.

State ties the redirect back to the initiating browser attempt. PKCE binds code redemption to possession of the verifier. Neither mechanism makes selecting a demo persona into real identity proof.

## Session representation

[SessionService](../apps/api/src/auth/session.service.ts) generates a random 32-byte session token. PostgreSQL stores its SHA-256 hash in AuthSession, with user ID, expiry, and revocation time. The encrypted browser cookie contains the raw token and expiry. A session lasts one hour; there is no rolling refresh or refresh-token system.

On each authenticated request, the API:

1. Reads and decrypts `app_session` and checks cookie expiry.
2. Hashes the token and finds the matching session row.
3. Rejects missing, expired, or revoked sessions.
4. Loads the associated user, role grants, and store assignments.
5. Builds an actor with tenant, region, role, permissions, assignments, customer ID, and refund limit.

The cookie does not grant authority through a stored role claim. A role or assignment change is reflected on the next authentication lookup. A request that authenticated before revocation can still finish; revocation does not cancel work already in flight.

## Cookie encryption and attributes

[auth.crypto.ts](../apps/api/src/auth/auth.crypto.ts) uses AES-256-GCM with a random 12-byte IV and authentication tag. Purpose-specific keys are derived from the configured secret. Sealed payloads use base64url segments. Authentication failures during opening return no payload.

`AUTH_COOKIE_SECRET` must decode to at least 32 bytes. It protects both session and mock-flow material with distinct purposes. It is checked when crypto is used; startup does not provide a complete validated configuration gate. There is no key ID or overlapping-key rotation mechanism. Replacing the secret invalidates existing encrypted cookies.

Both cookies are HttpOnly, SameSite=Lax, and Path=/; Secure is added in production. They have no Domain attribute. Cookies are host-scoped, not port-scoped, which is relevant when several local apps share localhost. The browser fetch client includes credentials; CORS allows the configured web origin.

## Logout and logout-all

`POST /auth/logout` requires the trusted origin, revokes the current active database session if present, clears the cookie, and redirects with HTTP 303. Reusing the old cookie fails after database revocation.

`POST /auth/logout-all` checks for an active stored session before revoking the user's unrevoked session rows. If the cookie/session is missing, expired, or revoked, it revokes zero rows; the controller still clears the cookie and redirects. Neither route contacts an external identity provider. Clearing a browser cookie alone would not revoke a stolen copy; the stored revocation is the important additional step.

Expired and revoked session rows are not cleaned up by a scheduled job in this repository.

## Configuration and failure limits

The auth controller uses `API_PUBLIC_URL`, falling back to request protocol/Host. It uses `WEB_URL`, then `WEB_ORIGIN`, for redirects and logout origin validation. Retail/order write origins use `WEB_ORIGIN` directly. Keep those web values aligned.

The token exchange fetch has no explicit timeout and trusts the returned JSON shape. Invalid JSON can escape the intended login-failed response path. Replay protection is process-local and resets on restart; multiple API processes do not share it. Attempt consumption is not durably recorded. The mock token body's TypeScript annotation is not a decorated DTO with runtime field validation.

These are implementation limits to address when introducing a real provider. See [risks R1 and R8](10-risks-and-limitations.md) and the [roadmap](11-improvement-roadmap.md). No external provider credentials, discovery, signature validation, issuer/audience checks, nonce validation, account linking, or provider logout integration are implemented today.
