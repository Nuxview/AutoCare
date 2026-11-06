import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const { data, error } = await createAdminClient()
      .from("memberships")
      .select(
        "id,role,shop_id,franchise:franchises(id,name,slug,status),shop:shops(id,name)",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at");
    if (error) throw error;
    let hasPendingInvitation = false;
    if (!data?.length) {
      const pending = await createAdminClient()
        .from("staff_invitations")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (pending.error) throw pending.error;
      hasPendingInvitation = !!pending.data?.length;
    }
    return Response.json({
      user,
      memberships: camelize(data),
      hasPendingInvitation,
    });
  } catch (error) {
    return jsonError(error);
  }
}
