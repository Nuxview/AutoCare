# AutoCare

Multi-tenant automotive service management for Kenyan drivers and garages, built with Next.js 16, React 19, Supabase Auth, Supabase Postgres, Supabase Storage, Paystack and M-Pesa Daraja.

## Local setup

1. Create a Supabase project. In Authentication, enable Email/Password and choose whether new accounts must confirm their email.
2. Apply the SQL files in `supabase/migrations` in filename order (or link the Supabase CLI and run `supabase db push`).
3. Copy `.env.example` to `.env.local`. Add the project URL, publishable key, and server-only secret key from the Supabase project settings. Never expose `SUPABASE_SECRET_KEY` to the browser.
4. Generate the field key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, install dependencies with `npm install`, and run `npm run dev`.
5. Open http://localhost:3000 and create the first account through the registration page.

## Client and garage workflows

- Clients request a garage visit. The request remains pending until an authorized garage staff member approves or declines it. Customers should bring the vehicle only after approval.
- Garages check in approved visits and create repair jobs. Staff add ordered repair steps, update each step from pending to in progress to completed, set the garage's own repair estimate, then issue an invoice for that amount. The amount is locked after invoicing. Staff can mark the vehicle ready for collection and complete the job.
- Clients and garages share JPG, PNG or WebP photos on a booking. Photos live in a private Supabase Storage bucket; the server grants short-lived read URLs only to the booking's client and authorized garage staff. Garage logos live in a separate public bucket. Both buckets are created by the latest migration.
- Garages manage stock quantities, reorder levels and prices, and customize their business/shop name, logo, weekly opening hours and booking availability. Client vehicle entry offers 10 popular make/model suggestions while still allowing any make and model.

## Paystack setup (Kenya)

1. In the Paystack Dashboard, get a **test secret key** and put it in `PAYSTACK_SECRET_KEY` in `.env.local`. Keep this key server-only. Create a monthly **KES 3,500** plan and put its `PLN_...` code in `PAYSTACK_STARTER_PLAN_CODE`. The app verifies the plan amount, currency and interval before starting checkout.
2. Set `APP_URL` to the URL users return to after checkout. In Paystack's test webhook settings, add `https://your-public-app-url/api/payments/paystack/webhook`. A localhost URL cannot receive webhooks; the app also verifies a returned transaction from its billing or invoice page for local testing.
3. Garage owners can open **Billing** to connect a Kenyan payout bank account. Paystack creates a subaccount with a 0% platform share, so customer invoice payments go to the garage. The bank account number is sent to Paystack and is not stored by AutoCare.
4. Garage owners can start the Starter subscription from **Billing**. Paystack charges the first month immediately and renews monthly by card. The existing 14-day AutoCare trial remains available until the owner chooses to subscribe. Paystack's subscription flow supports card payments in Kenya; M-Pesa remains a separate invoice payment method.
5. Use the corresponding live Paystack key, plan code and webhook setting only after testing the full flow in test mode. Never commit keys to Git.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and `docker compose config`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, tenancy, migration decisions, and production hardening.
