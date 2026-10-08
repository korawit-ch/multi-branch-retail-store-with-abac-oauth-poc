# Next.js web app and BFF

This app renders the store-management UI and owns the browser-facing API boundary. Start with the [project README](../../README.md) for setup and the [BFF architecture guide](../../doc/12-bff-authentication-architecture.md) for the complete request flow.

From the repository root, build shared packages and start the app:

```bash
npm run build
npm run dev --workspace=web
```

The web app defaults to `http://localhost:3000`. Set `WEB_URL` and `WEB_ORIGIN` to the actual browser origin, and configure `API_INTERNAL_URL` if Nest is not at the local `API_PORT`. Next and Nest must share the private `AUTH_COOKIE_SECRET` value; never expose it through a `NEXT_PUBLIC_` setting.

Browser API calls use the same-origin `/api/bff` routes. Next exchanges the HttpOnly `app_session` cookie for a 60-second access JWT, verifies it, checks the shared `can()` policy, and forwards allowed requests to Nest with a bearer token. The BFF has an explicit method/path allowlist. Nest independently verifies the token and session and applies resource rules. Auth redirects and logout also pass through Next so cookies stay on the web origin.

See the [frontend guide](../../doc/08-frontend.md) for fetch and UI behavior, and [AUTH_DEMO.md](AUTH_DEMO.md) for the local login walkthrough. The mock provider is disabled in production and has no replacement in this repository.
