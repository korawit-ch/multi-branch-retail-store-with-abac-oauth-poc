# Frontend structure and UI state

[Documentation index](README.md)

## Pages and rendering

The app uses Next.js App Router. The [home page](<../apps/web/app/(home)/page.tsx>) is a server-rendered persona selection page that reads the login error query. The [dashboard page](../apps/web/app/dashboard/page.tsx) renders [StoreDashboard](../apps/web/components/store-dashboard.tsx), a Client Component because it uses local state, forms, queries, and mutations.

The dashboard page does not itself perform an authenticated server redirect. It loads protected data through the same-origin Next BFF and shows a loading or error screen. A customer receives no retail data because Next and Nest deny `store.read`, even if the page shell is reachable.

The root layout/providers install shared styling and the query provider. Reusable components live in `packages/ui`; catalog and permission rules remain in the API rather than browser components.

## Transport and contracts

[clientFetch](../apps/web/lib/fetch/client.ts) executes descriptors from `@repo/api-client` through same-origin `/api/bff`, includes the opaque cookie, and parses JSON. HTTP failures become `ApiError(status, message, responseBody)`; network errors do not have an HTTP status. The [server fetch helper](../apps/web/lib/fetch/server.ts) calls the same BFF with forwarded cookies for server-side use and uses `cache: 'no-store'`.

Home login links and dashboard logout forms use same-origin `/auth/*` routes. Client fetch uses `/api/bff`. Next calls Nest using private `API_INTERNAL_URL`; the browser does not read it. Keep `WEB_URL` and `WEB_ORIGIN` aligned with the browser origin.

Public Next environment variables belong in browser configuration, never in secret storage. The browser must not import the Prisma client runtime, even though Prisma types are available through workspace dependencies.

## Server state versus local state

[QueryProvider](../apps/web/lib/query/provider.tsx) creates one QueryClient per mounted provider. Defaults use a one-minute stale time and disable refetch on window focus. The dashboard query key is `['retail']` and retries are disabled.

Server state consists of the actor, accessible stores, branch inventory, order snapshots, audit entries, and refund capabilities. Local state consists of the selected section/branch, product search, sale/adjustment dialogs, success notice, refund result panel, and demo override checkbox.

Switching branches selects another store already in the response; it does not fetch a separate branch resource. Product search filters the returned data locally by name and SKU. The low-stock threshold and recent-order metrics are computed from the current response. There is no polling, subscription, or real-time cross-user update channel.

## Mutation behavior

The shared operational mutation executes sale, adjustment, and status-update requests. On success it closes dialogs, shows a notice, and invalidates `['retail']`. It does not use optimistic stock/order updates. On failure, the existing snapshot can remain visible until another refresh.

Refunds use their own mutation so the demo can show the endpoint, status, and JSON result. It clears the previous result at the start and invalidates retail on settlement, including failures. All action buttons use a common busy state to avoid overlapping local operations. This is a UX measure; it does not prevent duplicates across tabs or network retries.

## Permission-aware controls

Inventory/sale controls use shared `can()` with the returned actor. Order preparation controls also inspect PAID/PREPARING status. Refunds consume `order.capabilities.refund.allowed` and the backend explanation.

The override checkbox only bypasses the refund button's eligibility-based disabled condition. Busy state remains enforced. It sends no elevated permission to either server. A missing permission is denied by the BFF; Nest independently checks direct bearer calls. Branch changes reset the checkbox and result; page reloads reset all component-local state. See the [capability guide](04-authorization-and-capabilities.md).

The display currently hardcodes successful refund status 201. Error status comes from the real HTTP response. A future fetch result envelope would let the success panel report actual transport metadata too.

## States and accessibility

The dashboard provides loading, unavailable-workspace, retry, empty-order, mutation-error, success-notice, and pending-control states. Labels identify refund buttons by order ID. Forms use native inputs and FormData; shared React Hook Form primitives elsewhere in the template do not mean this dashboard uses them.

A production UX pass should verify dialog focus entry/return and trapping, Escape behavior, background interaction, announcement of asynchronous errors, keyboard-only workflows, mobile tables, and contrast. Existing frontend tests cover FeatureBadge rather than these dashboard interactions; visual inspection is not automated coverage.

## Safe extension pattern

1. Define the permission in the shared authorization vocabulary and the authoritative business behavior/validation in Nest.
2. Add an explicit BFF route permission and an independent Nest check; update the shared endpoint/body/response contract.
3. Use the existing fetch helper and query provider.
4. Keep temporary form state local; invalidate the relevant server query after writes.
5. Add resource capabilities when an action's eligibility depends on more than a simple permission.
6. Test stale decisions and backend denials as well as enabled-button success.

The mandatory `capabilities.refund` field is a deployment contract. When deploying frontend and API independently, make the producer available before shipping a consumer that assumes that field exists, or provide an explicit compatibility strategy.

If identity switching becomes an in-app action without a full navigation, clear or scope cached data by identity. The current static query key alone does not separate users; current login/logout navigation recreates page state, but future SPA account-switching must preserve that isolation deliberately.
