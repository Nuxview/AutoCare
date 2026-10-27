import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { paystackSecretKey, verifyPaystackSignature } from "@/server/payments/paystack";
import {
  linkPaystackSubscription, reconcilePaystackSubscriptionInvoice, reconcilePaystackTransaction,
} from "@/server/payments/paystack-reconcile";

type Webhook = { event?: string; data?: Record<string, unknown> };

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"), paystackSecretKey())) {
      throw new ApiError(400, "Invalid Paystack signature", "INVALID_SIGNATURE");
    }
    const webhook = JSON.parse(rawBody) as Webhook;
    const data = webhook.data;
    if (!data || typeof data !== "object") throw new ApiError(400, "Invalid Paystack event", "INVALID_EVENT");

    if (webhook.event === "charge.success" && typeof data.reference === "string") {
      await reconcilePaystackTransaction(data.reference);
    } else if (webhook.event === "subscription.create" && typeof data.subscription_code === "string") {
      await linkPaystackSubscription(data.subscription_code);
    } else if (webhook.event === "invoice.update" || webhook.event === "invoice.payment_failed") {
      await reconcilePaystackSubscriptionInvoice(data);
    } else if ((webhook.event === "subscription.not_renew" || webhook.event === "subscription.disable") &&
      typeof data.subscription_code === "string") {
      const admin = createAdminClient();
      const { data: subscription, error } = await admin.from("subscriptions").select("id,franchise_id")
        .eq("paystack_subscription_code", data.subscription_code).maybeSingle();
      if (error) throw error;
      if (!subscription) throw new ApiError(503, "Subscription link is still being reconciled", "SUBSCRIPTION_PENDING");
      if (webhook.event === "subscription.not_renew") {
        const saved = await admin.from("subscriptions").update({ cancel_at_period_end: true, paystack_status: "non-renewing" })
          .eq("id", subscription.id);
        if (saved.error) throw saved.error;
      } else {
        const saved = await admin.from("subscriptions").update({ paystack_status: "cancelled" })
          .eq("id", subscription.id);
        if (saved.error) throw saved.error;
        const franchiseSaved = await admin.from("franchises").update({ status: "CANCELLED" })
          .eq("id", subscription.franchise_id);
        if (franchiseSaved.error) throw franchiseSaved.error;
      }
    }
    return Response.json({ received: true });
  } catch (error) { return jsonError(error); }
}
