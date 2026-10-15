# Proxied mock login, conditional grants, and renewable access tokens

NestJS owns the OAuth-style login flow and PostgreSQL-backed application sessions. Next.js proxies the browser-facing login/callback, renders the dashboard, and handles same-origin `/api/bff` requests. The local provider is a teaching stand-in, not ThaiD, and does not authenticate a real person.

## Flow

1. NestJS `/auth/login` creates state and a PKCE verifier.
2. NestJS stores them for five minutes in an AES-256-GCM encrypted, HttpOnly, SameSite=Lax `oauth_attempt` cookie.
3. The local provider returns a short-lived code and selected mock subject to NestJS `/auth/callback`.
4. NestJS validates state and expiry, exchanges the code with the verifier, and maps the subject to an application `User`.
5. NestJS creates an `AuthSession` row containing a SHA-256 hash of a new random token.
6. The encrypted `app_session` cookie contains the raw token and expiry, not identity or permission claims.
7. Nest builds typed conditional grants from role permissions and assignments, signs a ten-minute JWT, and sets a separate HttpOnly `access_token` cookie.
8. Next verifies that JWT and its named grant; Nest verifies it again and derives tenant/store database scope from its conditions. Current business rules remain in domain services.
9. On access-token 401, the browser makes one same-origin refresh attempt. Nest checks the revocable session, rebuilds grants, and sets a fresh access cookie.
10. Current-session logout revokes one row; all-device logout revokes every active row for the current user. Both clear browser cookies.

The temporary OAuth attempt remains cookie-backed. PostgreSQL rejects a copied renewal cookie after revocation. An already-issued access JWT can remain valid until its ten-minute expiry, including after logout or a grant change.

## Run

Follow the root [`README.md`](../../README.md) to configure the shared secret and URLs, start PostgreSQL, apply migrations, seed users, and run the workspace.

## Production integration

A real ThaiD adapter must use registered endpoints, the exact redirect URI, required client authentication, and verified OIDC identity data, including signature, issuer, audience, expiry, nonce where applicable, and claim mapping. Callback query parameters are not identity.

The temporary login attempt is not reliably single-use across concurrent callbacks because it remains cookie-backed. Production systems should add one-time login-attempt storage when replay consumption is required. Also add rate limits, session cleanup, device metadata, key rotation, and authorization audit logging.

The local mock provider rejects authorization-code reuse within one API process and is disabled when `NODE_ENV=production`. Its consumed-code cache is in memory: use a real provider and durable one-time code storage before deploying across processes.

The complete current request flow is in [the BFF architecture guide](../../doc/12-bff-authentication-architecture.md).
