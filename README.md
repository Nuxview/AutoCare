# AutoCare

Multi-tenant automotive service management for Kenyan drivers and garages, built with Next.js 16, React 19, Supabase Auth, Supabase Postgres and M-Pesa Daraja. Supabase Storage is intentionally not configured yet.

## Local setup

1. Create a Supabase project. In Authentication, enable Email/Password and choose whether new accounts must confirm their email.
2. Run [supabase/migrations/202610240001_initial_schema.sql](supabase/migrations/202610240001_initial_schema.sql) in the Supabase SQL editor (or link the Supabase CLI and run `supabase db push`).
3. Copy `.env.example` to `.env.local`. Add the project URL, publishable key, and server-only secret key from the Supabase project settings. Never expose `SUPABASE_SECRET_KEY` to the browser.
4. Generate the field key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, install dependencies with `npm install`, and run `npm run dev`.
5. Open http://localhost:3000 and create the first account through the registration page.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and `docker compose config`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, tenancy, migration decisions, and production hardening.
