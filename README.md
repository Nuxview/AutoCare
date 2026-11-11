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

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
`npm test` runs unit tests and embedded PostgreSQL tests without Supabase credentials
or a network connection. GitHub Actions runs this same command on every pull request.

Network-backed tests use `npm run test:integration`. Start a disposable local
Supabase instance with the migrations applied, then explicitly set
`TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, and
`TEST_SUPABASE_SECRET_KEY` from that local instance. The integration runner fails
before connecting when these values are missing, empty, or point to a nonlocal
host. It never loads `.env.local` or uses application credentials. The RLS suite
creates and deletes fixture users and records; run it against a local test database
only. Real authenticated tenant isolation is checked by that seeded suite; an
invalid JWT test checks authentication failure rather than tenant permissions.

## Workshop workflows and staff access

Apply `supabase/migrations/20261102133752_workshop_workflows.sql` after the earlier migrations **before deploying this application version**. It adds quotes, parts movements, scheduling, invitations, history-sharing grants and maintenance reminders. Existing invoices are preserved. Uninvoiced repairs now require an approved itemized quote; previously invoiced repairs can still finish their handover workflow.

The app retains two workspace types: Customer and Garage. Garage navigation and server access depend on staff role. Owners/administrators manage invitations; managers/advisors schedule visits and send quotes; mechanics see assigned repairs; inventory clerks manage stock; accountants issue approved invoices and view payments. Platform administrators receive no implicit garage access.

- **Staff:** an owner creates an invitation for an email address and branch. The recipient registers a customer account if necessary, verifies that email, signs in, and accepts under **Staff invitations**. The invitation is valid for seven days and can be revoked. Invitations appear in-app; automatic invitation emails are not configured. Acceptance is restricted to one active garage membership per account. Staff cannot invite owners or promote themselves.
- **Calendar:** configure repair bays, then schedule confirmed visits with a start/end time, mechanic, and bay. Times use East Africa Time. The database checks branch opening hours and conflicts with existing active appointments. Mechanic availability currently means an active membership with no overlapping booking; individual shifts and leave are not modeled. Scheduling before check-in assigns the mechanic when the repair job is created.
- **Quotes:** send a full itemized quote, optionally selecting stock items. The customer approves or declines the exact version. A revision includes all work and fitted parts, preserves previous decisions, and requires fresh approval. Work progression and further parts usage are blocked pending approval.
- **Parts and invoices:** approved parts are deducted transactionally and recorded with the actor. Returns restore stock. An invoice uses the approved quote lines exactly once; all quoted stock quantities must match net recorded usage. Returns and quote changes are locked after invoicing. Post-invoice refunds/credit notes are outside this workflow.
- **History:** customers see repair steps, recorded service mileage, parts, photos and invoices across their own vehicles. They can grant/revoke an entire garage's read access to a vehicle's customer-facing history. Internal notes are excluded. Revocation prevents future reads; already downloaded reports and photo URLs issued for up to five minutes cannot be recalled.
- **Reports and reminders:** reports download as printable HTML (browser Print → Save as PDF). Reminders are shown in service history when either the due date or recorded mileage is reached. They are in-app reminders, not scheduled email/SMS messages.

See [docs/WORKSHOP-WORKFLOWS.md](docs/WORKSHOP-WORKFLOWS.md) for the permission matrix and verification scope. The database tests run all migrations against isolated embedded PostgreSQL; no live customer database is used by `npm test`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, tenancy, migration decisions, and production hardening.
