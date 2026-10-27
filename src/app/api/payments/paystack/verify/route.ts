import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser, requireTenantMembership } from "@/server/auth/context";
import { reconcilePaystackTransaction } from "@/server/payments/paystack-reconcile";

const schema = z.object({ reference: z.string().regex(/^(PAY|SUB)-[a-f0-9]{32}$/) });

export async function GET(request: Request) {
  try {
    const { reference } = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();
    if (reference.startsWith("PAY-")) {
      const { data, error } = await admin.from("payments").select("customer_id").eq("reference", reference).eq("provider", "PAYSTACK").maybeSingle();
      if (error) throw error;
      if (!data || data.customer_id !== user.id) throw new ApiError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    } else {
      const { data, error } = await admin.from("subscriptions").select("franchise_id")
        .eq("paystack_checkout_reference", reference).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError(404, "Subscription checkout not found", "PAYMENT_NOT_FOUND");
      await requireTenantMembership(data.franchise_id, undefined, ["FRANCHISE_OWNER"], true);
    }
    const result = await reconcilePaystackTransaction(reference);
    return Response.json({ paid: result.paid }, { status: result.paid ? 200 : 202 });
  } catch (error) { return jsonError(error); }
}
