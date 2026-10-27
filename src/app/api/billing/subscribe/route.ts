import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantMembership } from "@/server/auth/context";
import { fetchPlan, initializeTransaction, paystackSecretKey, toPaystackMinorUnits } from "@/server/payments/paystack";

const schema = z.object({ franchiseId: z.uuid() });

export async function POST(request: Request) {
  try {
    const { franchiseId } = schema.parse(await request.json());
    const { user } = await requireTenantMembership(franchiseId, undefined, ["FRANCHISE_OWNER"], true);
    paystackSecretKey();
    const planCode = process.env.PAYSTACK_STARTER_PLAN_CODE;
    if (!planCode) throw new ApiError(503, "The AutoCare payment plan is not configured", "PLAN_UNAVAILABLE");
    const admin = createAdminClient();
    const { data: subscription, error } = await admin.from("subscriptions")
      .select("id,franchise_id,paystack_checkout_reference,paystack_checkout_url,paystack_subscription_code,paystack_status,plan:plans(name,code,monthly_price)")
      .eq("franchise_id", franchiseId).single();
    if (error) throw error;
    if (subscription.paystack_subscription_code && subscription.paystack_status === "active") {
      throw new ApiError(409, "This garage already has an active subscription", "ALREADY_SUBSCRIBED");
    }
    if (subscription.paystack_checkout_url && !subscription.paystack_subscription_code) {
      return Response.json({ checkoutUrl: subscription.paystack_checkout_url });
    }
    const plan = Array.isArray(subscription.plan) ? subscription.plan[0] : subscription.plan;
    if (!plan || plan.code !== "STARTER") throw new ApiError(400, "This plan is not ready for Paystack billing", "PLAN_UNAVAILABLE");
    const expectedAmount = toPaystackMinorUnits(plan.monthly_price);
    const remotePlan = await fetchPlan(planCode);
    if (remotePlan.plan_code !== planCode || remotePlan.currency !== "KES" || remotePlan.interval !== "monthly" || remotePlan.amount !== expectedAmount) {
      throw new ApiError(409, "The Paystack plan does not match AutoCare's KES monthly price", "PLAN_MISMATCH");
    }

    const reference = `SUB-${crypto.randomUUID().replaceAll("-", "")}`;
    const reserved = await admin.from("subscriptions").update({
      paystack_checkout_reference: reference, paystack_plan_code: planCode, paystack_status: "pending",
    }).eq("id", subscription.id).is("paystack_checkout_reference", null).select("id").maybeSingle();
    if (reserved.error) throw reserved.error;
    if (!reserved.data) throw new ApiError(409, "Subscription checkout is already starting", "CHECKOUT_STARTING");
    let checkoutReady = false;
    try {
      const callbackUrl = new URL("/dashboard/billing", process.env.APP_URL ?? "http://localhost:3000");
      callbackUrl.searchParams.set("paystack_reference", reference);
      const checkout = await initializeTransaction({
        email: user.email, amount: expectedAmount, currency: "KES", reference,
        plan: planCode, channels: ["card"], callback_url: callbackUrl.toString(),
        metadata: JSON.stringify({ kind: "subscription", franchiseId }),
      });
      if (checkout.reference !== reference || !checkout.authorization_url.startsWith("https://checkout.paystack.com/")) {
        throw new ApiError(502, "Paystack returned an invalid checkout", "PAYMENT_PROVIDER_ERROR");
      }
      checkoutReady = true;
      const saved = await admin.from("subscriptions").update({ paystack_checkout_url: checkout.authorization_url })
        .eq("id", subscription.id);
      if (saved.error) throw saved.error;
      return Response.json({ checkoutUrl: checkout.authorization_url });
    } catch (checkoutError) {
      if (!checkoutReady) {
        await admin.from("subscriptions").update({
          paystack_checkout_reference: null, paystack_plan_code: null, paystack_status: null,
        }).eq("id", subscription.id).eq("paystack_checkout_reference", reference).is("paystack_checkout_url", null);
      }
      throw checkoutError;
    }
  } catch (error) { return jsonError(error); }
}
