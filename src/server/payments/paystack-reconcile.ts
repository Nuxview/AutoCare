import "server-only";
import { ApiError } from "@/lib/api";
import { nextBillingMonth } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSubscription, toPaystackMinorUnits, verifyTransaction, type PaystackTransaction } from "./paystack";

function code(value: unknown, field: string): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && field in value) {
    const found = (value as Record<string, unknown>)[field];
    return typeof found === "string" ? found : null;
  }
  return null;
}

export async function reconcilePaystackTransaction(reference: string) {
  const admin = createAdminClient();
  const [paymentResult, subscriptionResult] = await Promise.all([
    admin.from("payments").select("id,reference,franchise_id,status,provider").eq("reference", reference).eq("provider", "PAYSTACK").maybeSingle(),
    admin.from("subscriptions").select("id,franchise_id,current_period_ends_at,paystack_customer_code,paystack_plan_code,paystack_subscription_code,plan:plans(monthly_price)")
      .eq("paystack_checkout_reference", reference).maybeSingle(),
  ]);
  if (paymentResult.error) throw paymentResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  const payment = paymentResult.data;
  const subscription = subscriptionResult.data;
  if (!payment && !subscription) return { found: false, paid: false };

  const transaction = await verifyTransaction(reference);
  if (transaction.reference !== reference || transaction.status !== "success") return { found: true, paid: false };
  if (transaction.currency !== "KES" || !Number.isSafeInteger(transaction.amount)) {
    throw new ApiError(409, "Paystack transaction currency or amount is invalid", "PAYMENT_MISMATCH");
  }

  if (payment) {
    const { data: franchise, error } = await admin.from("franchises").select("paystack_subaccount_code")
      .eq("id", payment.franchise_id).single();
    if (error) throw error;
    if (!franchise.paystack_subaccount_code || code(transaction.subaccount, "subaccount_code") !== franchise.paystack_subaccount_code) {
      throw new ApiError(409, "Paystack payout destination does not match the garage", "PAYOUT_MISMATCH");
    }
    const settled = await admin.rpc("settle_paystack_invoice_payment", {
      p_reference: reference, p_amount_minor: transaction.amount, p_currency: transaction.currency,
    });
    if (settled.error) throw settled.error;
    return { found: true, paid: true };
  }

  if (!subscription) return { found: false, paid: false };
  const plan = Array.isArray(subscription.plan) ? subscription.plan[0] : subscription.plan;
  const customerCode = transaction.customer?.customer_code;
  const transactionPlan = code(transaction.plan, "plan_code");
  if (!plan || transaction.amount !== toPaystackMinorUnits(plan.monthly_price) || !customerCode ||
      (transactionPlan && transactionPlan !== subscription.paystack_plan_code)) {
    throw new ApiError(409, "Paystack subscription charge does not match this plan", "PAYMENT_MISMATCH");
  }
  const paidAt = new Date(transaction.paid_at ?? Date.now());
  if (Number.isNaN(paidAt.getTime())) throw new ApiError(409, "Paystack returned an invalid payment date", "PAYMENT_MISMATCH");
  if (subscription.paystack_customer_code === customerCode &&
      Date.parse(subscription.current_period_ends_at) > Date.parse(nextBillingMonth(paidAt))) {
    return { found: true, paid: true };
  }
  const updated = await admin.from("subscriptions").update({
    paystack_customer_code: customerCode, paystack_status: "active", paystack_checkout_url: null,
    current_period_starts_at: paidAt.toISOString(), current_period_ends_at: nextBillingMonth(paidAt),
  }).eq("id", subscription.id).eq("paystack_checkout_reference", reference);
  if (updated.error) throw updated.error;
  const franchiseUpdated = await admin.from("franchises").update({ status: "ACTIVE" })
    .eq("id", subscription.franchise_id);
  if (franchiseUpdated.error) throw franchiseUpdated.error;
  return { found: true, paid: true };
}

export async function linkPaystackSubscription(subscriptionCode: string) {
  const remote = await fetchSubscription(subscriptionCode);
  const customerCode = remote.customer?.customer_code;
  const planCode = remote.plan?.plan_code;
  if (!customerCode || !planCode) throw new ApiError(502, "Paystack subscription details are incomplete", "PAYMENT_PROVIDER_ERROR");
  const admin = createAdminClient();
  const { data: matches, error } = await admin.from("subscriptions")
    .select("id,paystack_subscription_code")
    .eq("paystack_customer_code", customerCode).eq("paystack_plan_code", planCode);
  if (error) throw error;
  const linked = matches?.find((item) => item.paystack_subscription_code === subscriptionCode);
  if (linked) return;
  const pending = matches?.filter((item) => !item.paystack_subscription_code) ?? [];
  if (pending.length !== 1) throw new ApiError(503, "Paystack subscription is waiting for its first payment to reconcile", "SUBSCRIPTION_PENDING");
  const update: Record<string, unknown> = {
    paystack_subscription_code: subscriptionCode,
    paystack_status: remote.status,
  };
  if (remote.next_payment_date) update.current_period_ends_at = remote.next_payment_date;
  const saved = await admin.from("subscriptions").update(update).eq("id", pending[0].id)
    .is("paystack_subscription_code", null);
  if (saved.error) throw saved.error;
}

type SubscriptionInvoice = {
  paid?: boolean;
  status?: string;
  amount?: number;
  period_start?: string;
  period_end?: string;
  subscription?: { subscription_code?: string; next_payment_date?: string };
  customer?: { customer_code?: string };
  transaction?: { reference?: string; amount?: number; currency?: string; status?: string };
};

export async function reconcilePaystackSubscriptionInvoice(invoice: SubscriptionInvoice) {
  const subscriptionCode = invoice.subscription?.subscription_code;
  if (!subscriptionCode) return;
  const admin = createAdminClient();
  const { data: local, error } = await admin.from("subscriptions")
    .select("id,franchise_id,current_period_ends_at,paystack_customer_code,plan:plans(monthly_price)")
    .eq("paystack_subscription_code", subscriptionCode).maybeSingle();
  if (error) throw error;
  if (!local) throw new ApiError(503, "Subscription link is still being reconciled", "SUBSCRIPTION_PENDING");
  if (invoice.customer?.customer_code !== local.paystack_customer_code) {
    throw new ApiError(409, "Subscription customer mismatch", "PAYMENT_MISMATCH");
  }
  const plan = Array.isArray(local.plan) ? local.plan[0] : local.plan;
  if (!plan || invoice.amount !== toPaystackMinorUnits(plan.monthly_price)) {
    throw new ApiError(409, "Subscription amount mismatch", "PAYMENT_MISMATCH");
  }
  const periodEnd = invoice.subscription?.next_payment_date ?? invoice.period_end;
  if (!periodEnd || Number.isNaN(Date.parse(periodEnd))) return;
  if (Date.parse(periodEnd) < Date.parse(local.current_period_ends_at)) return;

  if (invoice.paid && invoice.transaction?.reference) {
    const transaction: PaystackTransaction = await verifyTransaction(invoice.transaction.reference);
    if (transaction.status !== "success" || transaction.currency !== "KES" || transaction.amount !== invoice.amount) {
      throw new ApiError(409, "Subscription transaction could not be verified", "PAYMENT_MISMATCH");
    }
    const saved = await admin.from("subscriptions").update({
      paystack_status: "active", current_period_starts_at: invoice.period_start ?? new Date().toISOString(),
      current_period_ends_at: periodEnd,
    }).eq("id", local.id);
    if (saved.error) throw saved.error;
    const franchiseSaved = await admin.from("franchises").update({ status: "ACTIVE" }).eq("id", local.franchise_id);
    if (franchiseSaved.error) throw franchiseSaved.error;
  } else if (invoice.status === "attention" || invoice.status === "failed") {
    const saved = await admin.from("subscriptions").update({ paystack_status: "attention" }).eq("id", local.id);
    if (saved.error) throw saved.error;
    const franchiseSaved = await admin.from("franchises").update({ status: "PAST_DUE" }).eq("id", local.franchise_id);
    if (franchiseSaved.error) throw franchiseSaved.error;
  }
}
