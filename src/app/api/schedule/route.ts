import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { rolesFor } from "@/lib/permissions";
import { scheduleSchema } from "@/lib/workshop-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { garageScope } from "@/server/garage/scope";
import { workshopRpc } from "@/server/workshop";
export async function GET() {
  try {
    const scope = await garageScope(rolesFor("schedule"));
    const admin = createAdminClient();
    let shopsQuery = admin
      .from("shops")
      .select("id,name")
      .eq("franchise_id", scope.franchiseId);
    if (scope.shopId) shopsQuery = shopsQuery.eq("id", scope.shopId);
    const shops = await shopsQuery;
    if (shops.error) throw shops.error;
    const ids = (shops.data ?? []).map((s) => s.id);
    let membersQuery = admin
      .from("memberships")
      .select("id,shop_id,user_id,profile:profiles(first_name,last_name)")
      .eq("franchise_id", scope.franchiseId)
      .eq("role", "MECHANIC")
      .eq("is_active", true);
    if (scope.shopId)
      membersQuery = membersQuery.or(
        `shop_id.is.null,shop_id.eq.${scope.shopId}`,
      );
    const members = await membersQuery;
    if (members.error) throw members.error;
    let slotsQuery = admin
      .from("workshop_slots")
      .select(
        "*,booking:bookings(reference,status,vehicle:vehicles(registration))",
      )
      .in("shop_id", ids)
      .order("starts_at");
    if (scope.role === "MECHANIC")
      slotsQuery = slotsQuery.in(
        "mechanic_id",
        (members.data ?? [])
          .filter((m) => m.user_id === scope.user.id)
          .map((m) => m.id),
      );
    const [slots, bays, bookings] = await Promise.all([
      slotsQuery,
      admin.from("workshop_bays").select("*").in("shop_id", ids),
      scope.role === "MECHANIC"
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from("bookings")
            .select(
              "id,reference,shop_id,scheduled_at,vehicle:vehicles(registration)",
            )
            .in("shop_id", ids)
            .in("status", [
              "CONFIRMED",
              "CHECKED_IN",
              "IN_PROGRESS",
              "AWAITING_APPROVAL",
            ]),
    ]);
    for (const r of [slots, bays, bookings]) if (r.error) throw r.error;
    return Response.json({
      slots: slots.data,
      bays: bays.data,
      bookings: bookings.data,
      mechanics: members.data,
      shops: shops.data,
      readOnly: scope.role === "MECHANIC",
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = scheduleSchema.parse(await request.json());
    await workshopRpc("save_workshop_slot", {
      p_booking_id: input.bookingId,
      p_mechanic_id: input.mechanicId,
      p_bay_id: input.bayId,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const scope = await garageScope(rolesFor("settings"));
    const input = z
      .object({ shopId: z.uuid(), name: z.string().trim().min(2).max(60) })
      .parse(await request.json());
    const admin = createAdminClient();
    const shop = await admin
      .from("shops")
      .select("id")
      .eq("id", input.shopId)
      .eq("franchise_id", scope.franchiseId)
      .maybeSingle();
    if (shop.error) throw shop.error;
    if (!shop.data || (scope.shopId && scope.shopId !== input.shopId))
      throw new ApiError(403, "Branch access denied");
    const { error } = await admin
      .from("workshop_bays")
      .insert({ shop_id: input.shopId, name: input.name });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
