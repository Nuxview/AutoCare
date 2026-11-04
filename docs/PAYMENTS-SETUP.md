# AutoCare sandbox payments

Stripe Checkout and M-Pesa Express currently run in **sandbox only**. Live keys are rejected. They are limited to the garage whose ID is `PAYMENT_TEST_FRANCHISE_ID`; use a dedicated demo garage, never a real trading garage. Successful tests update that demo garage's invoices and create payment records with `is_test=true`.

## Vercel environment

Set these on the `autocare` project, Production environment, then redeploy:

| Variable | Value/source |
| --- | --- |
| APP_URL | `https://autocare-orcin-iota.vercel.app` |
| PAYMENT_TEST_FRANCHISE_ID | Dedicated demo garage UUID |
| STRIPE_SECRET_KEY | Stripe sandbox key beginning `sk_test_` |
| STRIPE_WEBHOOK_SECRET | Signing secret for the endpoint below, beginning `whsec_` |
| MPESA_ENV | `sandbox` |
| MPESA_CONSUMER_KEY | AutoCare Daraja sandbox app |
| MPESA_CONSUMER_SECRET | AutoCare Daraja sandbox app |
| MPESA_SHORTCODE | Lipa Na M-Pesa sandbox business shortcode |
| MPESA_PASSKEY | Lipa Na M-Pesa sandbox passkey |

Store provider credentials as Vercel **Secret** variables. Do not prefix them with NEXT_PUBLIC, put them in source control, or enter them into customer-facing forms. Existing Supabase and encryption variables must remain intact.

## Provider dashboards

- [Stripe sandbox API keys](https://dashboard.stripe.com/test/apikeys)
- [Daraja apps](https://developer.safaricom.co.ke/dashboard/myapps): enable M-Pesa Express.
- [AutoCare environment settings](https://vercel.com/enoch-kibets-projects/autocare/settings/environment-variables)

Stripe webhook: `https://autocare-orcin-iota.vercel.app/api/payments/stripe/webhook`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired` in the same sandbox account as the API key. Use snapshot payloads. The handler verifies the raw signature and retrieves the checkout session before settlement.

M-Pesa callback: `https://autocare-orcin-iota.vercel.app/api/payments/mpesa/callback`

This URL is supplied automatically in each STK request. The callback alone cannot mark an invoice paid: AutoCare queries Safaricom using its credentials and matches the checkout ID. Do not use the C2B URL registration flow for STK callbacks.

## Testing

Sign in as the demo customer, open Invoices, and choose Stripe or enter the Daraja sandbox test phone for M-Pesa. Use Stripe's [official test payment details](https://docs.stripe.com/testing), never a real card. Check success, cancellation, decline, and repeated status checks; a successful invoice must only be credited once. A Stripe cancel redirect leaves checkout open so it can be resumed; confirmed expiry releases the reservation.

After any uncertain result use **Check payment status**. Refreshing restores the active payment from the database. An M-Pesa timeout before the checkout ID is saved is deliberately left pending, since blindly repeating an STK request could charge twice. An operator must verify the request in Daraja before marking it failed; no automatic timeout cancellation is performed. Stripe initiation retries reuse the same idempotency key for up to 23 hours; older unresolved requests require operator reconciliation.

## Before real payments

This release does not enable live collection or distribute money between garages. Add verified per-garage merchant/payout accounts (Stripe Connect and appropriate Daraja merchant credentials), live onboarding, refunds, reconciliation monitoring, and operational handling of ambiguous provider outcomes before enabling live payments. Do not remove the sandbox restriction simply by substituting live secrets.
