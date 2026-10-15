# Next.js web app and BFF

This app renders the store-management UI and owns the browser-facing API boundary. Start with the [project README](../../README.md) for setup and the [BFF architecture guide](../../doc/12-bff-authentication-architecture.md) for the complete request flow.

From the repository root, build shared packages and start the app:

```bash
npm run build
npm run dev --workspace=web
```

The web app defaults to `http://localhost:3000`. Set `WEB_URL` and `WEB_ORIGIN` to the actual browser origin, and configure `API_INTERNAL_URL` if Nest is not at the local `API_PORT`. Next and Nest must share the private `AUTH_JWT_SECRET`; Nest uses a separate `AUTH_COOKIE_SECRET`. Never expose either secret through a `NEXT_PUBLIC_` setting.

Browser API calls use the same-origin `/api/bff` routes. Next verifies the ten-minute HttpOnly `access_token` JWT, checks its named grant, and forwards allowed requests to Nest with that bearer token. A 401 triggers one same-origin refresh attempt using the separate revocable `app_session` cookie. The BFF has an explicit method/path allowlist. Nest independently verifies the JWT and derives query scope from its typed conditions. Auth redirects and logout pass through Next so cookies stay on the web origin.

See the [frontend guide](../../doc/08-frontend.md) for fetch and UI behavior, and [AUTH_DEMO.md](AUTH_DEMO.md) for the local login walkthrough. The mock provider is disabled in production and has no replacement in this repository.
