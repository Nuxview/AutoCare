import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantMembership } from "@/server/auth/context";

const querySchema = z.object({ franchiseId: z.uuid() });

export async function GET(request: Request) {
  try {
    const { franchiseId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireTenantMembership(franchiseId, undefined, ["FRANCHISE_OWNER", "FRANCHISE_ADMIN"], true);
    const admin = createAdminClient();
    const [franchise, subscription] = await Promise.all([
      admin.from("franchises").select("id,name,status,paystack_subaccount_code").eq("id", franchiseId).single(),
      admin.from("subscriptions").select("id,trial_ends_at,current_period_ends_at,paystack_subscription_code,paystack_status,paystack_checkout_url,plan:plans(name,monthly_price)").eq("franchise_id", franchiseId).single(),
    ]);
    if (franchise.error) throw franchise.error;
    if (subscription.error) throw subscription.error;
    return Response.json({
      franchise: { id: franchise.data.id, name: franchise.data.name, status: franchise.data.status, payoutsConnected: Boolean(franchise.data.paystack_subaccount_code) },
      subscription: subscription.data,
      paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      planConfigured: Boolean(process.env.PAYSTACK_STARTER_PLAN_CODE),
    });
  } catch (error) { return jsonError(error); }
}
