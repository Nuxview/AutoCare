import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const { data, error } = await createAdminClient().from("memberships").select("id,role,shop_id,franchise:franchises(id,name,slug,status),shop:shops(id,name)").eq("user_id", user.id).eq("is_active", true);
    if (error) throw error;
    return Response.json({ user, memberships: camelize(data) });
  } catch (error) { return jsonError(error); }
}
