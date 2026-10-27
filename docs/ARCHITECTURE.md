# AutoCare architecture

AutoCare is a modular monolith built on Next.js App Router. Route handlers are transport adapters; domain services own authorization, transactional writes, and business rules. Supabase Postgres is the system of record and the Supabase JavaScript SDK is the persistence adapter.

## Trust boundaries

- Supabase Auth owns credentials, access tokens, refresh rotation, email confirmation, and HTTP-only SSR session cookies.
- Platform administrators have no implicit access to workshop data.
- Operational reads and writes are scoped by `franchiseId`; branch records are additionally scoped by `shopId`.
- Client-supplied identifiers are treated as lookup hints only. Services validate vehicle ownership, membership, shop/franchise relationships, subscription state, and role before mutations.
- Phone/VIN-style sensitive fields are AES-256-GCM encrypted. A separate one-way normalized hash supports exact lookups without deterministic encryption.
- The service-role Supabase key runs only on the server. Browser clients never receive it; route handlers enforce identity and tenant scope before data access.
- Row Level Security is enabled on all application tables. The current server-only data layer bypasses RLS only after route-level authorization; direct browser table access is denied by default.
- Supabase Storage is intentionally not configured. The upload route returns `501 STORAGE_NOT_CONFIGURED` until storage policies and buckets are designed.
- Money uses PostgreSQL `NUMERIC` and Decimal.js for arithmetic.

## Tenant model

`PLATFORM → FRANCHISE → SHOP`. Customers and vehicles are platform-owned. A garage sees customer data only through its own bookings, jobs, invoices, or payments. Staff membership grants a role within one franchise and optionally one branch. Franchise-wide roles use a null `shopId`.

## Main modules

- `src/server/auth`: Supabase login, onboarding, authenticated and tenant contexts.
- `src/server/bookings`: capacity-aware, ownership-checked customer bookings.
- `src/server/jobs`: role-gated job creation and tenant-scoped workshop visibility.
- `src/server/payments`: Safaricom Daraja STK requests and idempotent callback reconciliation.
- `src/lib/supabase`: browser, server-cookie, service-role, and proxy clients.
- `src/app/api`: thin HTTP handlers with Zod parsing and normalized error responses.

## Migration decision record

The supplied workspace contained no earlier frontend, Flask backend, Git history, business types, or tests. Consequently no code could be preserved or incrementally migrated. The implementation starts greenfield and deliberately does not introduce localStorage persistence. If an earlier client is later recovered, migrate one domain at a time against these APIs, retain only presentation and harmless UI preferences, and remove simulated notifications/payments after the equivalent server workflow is connected.

## Production hardening before launch

Enable Supabase backups and point-in-time recovery as required; keep the secret key in a server-only secrets manager; configure Auth redirect URLs and email templates; terminate TLS at the load balancer; configure Daraja credentials/callback allowlists; add rate limiting; add error/trace collection; test tenant isolation against a migrated test project; and complete a data protection impact assessment under Kenya's Data Protection Act.
