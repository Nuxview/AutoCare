# Dashboard request changes

On a successful bootstrap, the dashboard entry requests `/api/dashboard` once. Its response contains the
workspace identity and dashboard data, with one session verification, profile read,
and membership read. The shell primes the client cache before mounting the page.
Direct visits to other dashboard pages still use the smaller `/api/me` response.
An unavailable dashboard preserves workspace navigation, including billing.

Dashboard reads share the existing TanStack Query dependency through
`src/lib/client-cache.ts`. Responses stay fresh for 30 seconds in tab memory and
are keyed by account, garage, role, method and URL. No private response is cached
during server rendering or persisted in browser storage. Successful writes,
including multipart uploads and payment reconciliation, invalidate cached reads
and cancel older in-flight reads. Sign-in/out clears the cache and notifies other
tabs to reload their session. Failed responses and payment checks are not cached.
The existing garage booking `PUT` remains a read.

This is return-visit caching, not polling or realtime synchronization. Changes by
other users can remain visible until the next read after the 30-second freshness
window. A full page reload authenticates and loads fresh data.

## Inspecting server latency

On a fresh signed-in dashboard load, inspect `/api/dashboard` in DevTools Network.
Its `Server-Timing` response header and Timing tab expose these durations in ms:

- `auth`: Supabase session verification, including refresh when required.
- `profile`: the active account/profile lookup.
- `memberships`: the active garage membership and garage/shop join.
- `invitations`: the invitation check for accounts without garage membership.
- Garage queries: `open_jobs`, `today_bookings`, `stock` (when permitted),
  `receivables`, `recent_jobs`, `pending_bookings`.
- Customer queries: `vehicles`, `active_bookings`, `unpaid_invoices`,
  `recent_bookings`, `recent_jobs`.
- `total`: time within the route handler, including serialization.

`/api/me` exposes the identity/workspace stages as well. Failures retain completed
stage timings and the failing stage's duration. Headers contain operation labels
and durations only. Responses remain `Cache-Control: private, no-store` at the HTTP
layer; the short-lived cache is explicitly managed by the app.

Database stage durations include the server-to-Supabase round trip and response
decoding, not just SQL execution. Parallel query durations overlap; do not add
them to estimate total latency. Function startup before the handler, browser
network time and hydration are outside `total`.

## Verification after deployment

1. Use a signed-in browser profile with extensions disabled. On a full load of
   `/dashboard`, confirm one `/api/dashboard` and no `/api/me` request.
2. Visit another dashboard page and return within 30 seconds. Previously loaded
   data should be reused. After 30 seconds, the next page read should fetch again.
3. Save a vehicle, booking, repair, invoice, inventory or settings change. Returning
   to a related page should load fresh data immediately. Payment checks should
   always make network requests.
4. Sign out and sign in as another account, including in another tab. Previous
   account data must not be reused.
5. Compare warm and first-request `Server-Timing` values. A slow `auth` span calls
   for session/auth investigation; a slow database span identifies the read to
   inspect. Compare browser request duration with `total` before attributing the
   difference to SQL or a Vercel cold start.

Production latency improvements require a deployment and a new signed-in trace;
local tests verify request budgets, cache behavior and authorization boundaries.
