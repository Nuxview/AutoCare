import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { workshopRpc } from "@/server/workshop";
import { createClient } from "@/lib/supabase/server";
export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const { data, error } = await createAdminClient()
      .from("staff_invitations")
      .select("id,role,expires_at,garage:franchises(name),shop:shops(name)")
      .eq("email", user.email.toLowerCase())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    if (error) throw error;
    return Response.json({ invitations: data });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const session = await createClient();
    const { data, error } = await session.auth.getUser();
    if (error || !data.user?.email_confirmed_at || !data.user.email)
      throw new ApiError(
        403,
        "Verify your email before accepting a staff invitation",
      );
    await workshopRpc("accept_staff_invitation", {
      p_invitation_id: id,
      p_verified_email: data.user.email.toLowerCase(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
