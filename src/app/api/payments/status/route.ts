import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileStripe, stripeClient } from "@/server/payments/stripe";
import { reconcileMpesa } from "@/server/payments/mpesa";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const reference = z
      .string()
      .min(5)
      .max(100)
      .parse(new URL(request.url).searchParams.get("reference"));
    const admin = createAdminClient();
    const found = await admin
      .from("payments")
      .select("reference,provider,provider_reference,status,is_test")
      .eq("reference", reference)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new ApiError(404, "Payment not found");
    const payment = found.data;
    let status = payment.status;
    if (["PENDING", "PROCESSING"].includes(status)) {
      if (payment.provider === "MPESA")
        status = await reconcileMpesa(reference);
      else if (payment.provider === "STRIPE" && payment.provider_reference)
        status = await reconcileStripe(
          await stripeClient().checkout.sessions.retrieve(
            payment.provider_reference,
          ),
        );
    }
    return Response.json(
      { status, test: payment.is_test },
      { status: ["PENDING", "PROCESSING"].includes(status) ? 202 : 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
