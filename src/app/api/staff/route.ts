import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { garageScope } from "@/server/garage/scope";
import { rolesFor } from "@/lib/permissions";
const schema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum([
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "SERVICE_ADVISOR",
    "MECHANIC",
    "INVENTORY_CLERK",
    "ACCOUNTANT",
  ]),
  shopId: z.uuid().nullable(),
});
export async function GET() {
  try {
    const scope = await garageScope(rolesFor("staff"));
    const admin = createAdminClient();
    const results = await Promise.all([
      admin
        .from("memberships")
        .select(
          "id,role,shop_id,is_active,profile:profiles(first_name,last_name,email)",
        )
        .eq("franchise_id", scope.franchiseId),
      admin
        .from("staff_invitations")
        .select("*")
        .eq("franchise_id", scope.franchiseId)
        .order("created_at", { ascending: false }),
      admin
        .from("shops")
        .select("id,name")
        .eq("franchise_id", scope.franchiseId),
    ]);
    for (const result of results) if (result.error) throw result.error;
    return Response.json({
      members: results[0].data,
      invitations: results[1].data,
      shops: results[2].data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const scope = await garageScope(rolesFor("staff"));
    const input = schema.parse(await request.json());
    if (scope.shopId)
      throw new ApiError(
        403,
        "Franchise-wide staff management access is required",
      );
    if (input.role === "FRANCHISE_ADMIN" && scope.role !== "FRANCHISE_OWNER")
      throw new ApiError(403, "Only the owner can invite an administrator");
    if (input.role === "FRANCHISE_ADMIN" && input.shopId)
      throw new ApiError(
        400,
        "Administrators must be assigned to all branches",
      );
    if (input.role !== "FRANCHISE_ADMIN" && !input.shopId)
      throw new ApiError(400, "Select a branch for this staff member");
    const admin = createAdminClient();
    if (input.shopId) {
      const shop = await admin
        .from("shops")
        .select("id")
        .eq("id", input.shopId)
        .eq("franchise_id", scope.franchiseId)
        .maybeSingle();
      if (shop.error) throw shop.error;
      if (!shop.data) throw new ApiError(403, "Select a branch in your garage");
    }
    const { data, error } = await admin
      .from("staff_invitations")
      .insert({
        franchise_id: scope.franchiseId,
        shop_id: input.shopId,
        email: input.email,
        role: input.role,
        invited_by: scope.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ invitation: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const scope = await garageScope(rolesFor("staff"));
    const input = z
      .object({ id: z.uuid(), kind: z.enum(["invitation", "member"]) })
      .parse(await request.json());
    const admin = createAdminClient();
    if (input.kind === "member") {
      const member = await admin
        .from("memberships")
        .select("role,user_id")
        .eq("id", input.id)
        .eq("franchise_id", scope.franchiseId)
        .single();
      if (member.error) throw member.error;
      if (
        member.data.role === "FRANCHISE_OWNER" ||
        member.data.user_id === scope.user.id ||
        (member.data.role === "FRANCHISE_ADMIN" &&
          scope.role !== "FRANCHISE_OWNER")
      )
        throw new ApiError(403, "You cannot deactivate this member");
      const { error } = await admin
        .from("memberships")
        .update({ is_active: false })
        .eq("id", input.id)
        .eq("franchise_id", scope.franchiseId);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("staff_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("franchise_id", scope.franchiseId)
        .is("accepted_at", null);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
