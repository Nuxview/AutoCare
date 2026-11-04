import "server-only";
import Stripe from "stripe";
import { ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSandboxGarage } from "./settings";

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_") || !process.env.STRIPE_WEBHOOK_SECRET)
    throw new ApiError(
      503,
      "Stripe sandbox is not configured",
      "PAYMENT_PROVIDER_UNAVAILABLE",
    );
  return new Stripe(key, { timeout: 15000, maxNetworkRetries: 2 });
}

export async function reconcileStripe(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from("payments")
    .select("*")
    .eq("reference", session.client_reference_id ?? "")
    .eq("provider", "STRIPE")
    .maybeSingle();
  if (error) throw error;
  if (!payment)
    throw new ApiError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  assertSandboxGarage(payment.franchise_id);
  if (
    session.livemode ||
    !payment.is_test ||
    session.mode !== "payment" ||
    session.metadata?.paymentId !== payment.id ||
    session.id !== payment.provider_reference ||
    session.currency?.toUpperCase() !== payment.currency ||
    session.amount_total !== Math.round(Number(payment.amount) * 100)
  )
    throw new ApiError(409, "Payment details do not match", "PAYMENT_MISMATCH");
  if (session.payment_status === "paid") {
    const settled = await admin.rpc("settle_verified_invoice_payment", {
      p_reference: payment.reference,
      p_provider: "STRIPE",
      p_provider_reference: session.id,
      p_amount_minor: session.amount_total,
      p_currency: session.currency,
      p_is_test: true,
    });
    if (settled.error) throw settled.error;
    return "SUCCEEDED";
  }
  if (session.status === "expired") {
    const updated = await admin
      .from("payments")
      .update({ status: "CANCELLED" })
      .eq("id", payment.id)
      .in("status", ["PENDING", "PROCESSING"]);
    if (updated.error) throw updated.error;
    return "CANCELLED";
  }
  return payment.status as string;
}
