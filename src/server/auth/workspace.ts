import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "./context";
import { RequestTiming } from "@/server/timing";

export async function loadWorkspace(timing: RequestTiming) {
  const user = await requireAuthenticatedUser(timing);
  const admin = createAdminClient();
  const { data, error } = await timing.measure("memberships", () =>
    admin
      .from("memberships")
      .select("id,role,franchise_id,shop_id,franchise:franchises(id,name,slug,status),shop:shops(id,name)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at")
      .limit(1),
  );
  if (error) throw error;
  let hasPendingInvitation = false;
  if (!data?.length) {
    const pending = await timing.measure("invitations", () =>
      admin
        .from("staff_invitations")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1),
    );
    if (pending.error) throw pending.error;
    hasPendingInvitation = !!pending.data?.length;
  }
  return { user, memberships: data ?? [], hasPendingInvitation };
}
