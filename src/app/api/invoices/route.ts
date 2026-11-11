import { ApiError, jsonError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import {
  requireAuthenticatedUser,
  requireTenantMembership,
} from "@/server/auth/context";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select("role,franchise_id,shop_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership && !can(membership.role, "invoices"))
      throw new ApiError(403, "Invoice access denied", "FORBIDDEN");
    if (membership)
      await requireTenantMembership(
        membership.franchise_id,
        membership.shop_id ?? undefined,
      );
    let query = admin
      .from("invoices")
      .select(
        "*,shop:shops(name),customer:profiles!invoices_customer_id_fkey(first_name,last_name),lines:invoice_lines(*),payments(amount,provider,paid_at,status)",
      )
      .order("created_at", { ascending: false });
    query = membership
      ? query.eq("franchise_id", membership.franchise_id)
      : query.eq("customer_id", user.id);
    if (membership?.shop_id) query = query.eq("shop_id", membership.shop_id);
    const { data, error } = await query;
    if (error) throw error;
    const invoices = (data ?? []).map((invoice: Record<string, unknown>) => ({
      ...invoice,
      payments: (
        (invoice.payments as Array<Record<string, unknown>>) ?? []
      ).filter((payment) => payment.status === "SUCCEEDED"),
    }));
    return Response.json({ invoices: camelize(invoices) });
  } catch (error) {
    return jsonError(error);
  }
}
