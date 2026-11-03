import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { vehicleHistory } from "@/server/history";
import { garageScope } from "@/server/garage/scope";
import { rolesFor } from "@/lib/permissions";
export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("vehicleId");
    if (!requested) {
      const scope = await garageScope(rolesFor("repairs"));
      const { data, error } = await createAdminClient()
        .from("vehicle_history_shares")
        .select("vehicle:vehicles(id,registration)")
        .eq("franchise_id", scope.franchiseId);
      if (error) throw error;
      return Response.json(
        {
          vehicles: (data ?? [])
            .map((row) =>
              Array.isArray(row.vehicle) ? row.vehicle[0] : row.vehicle,
            )
            .filter(Boolean),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const vehicleId = z.uuid().parse(requested);
    return Response.json(await vehicleHistory(vehicleId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mileage"),
    vehicleId: z.uuid(),
    mileage: z.number().int().min(0).max(2000000),
  }),
  z.object({
    action: z.literal("share"),
    vehicleId: z.uuid(),
    franchiseId: z.uuid(),
    enabled: z.boolean(),
  }),
  z
    .object({
      action: z.literal("reminder"),
      vehicleId: z.uuid(),
      title: z.string().trim().min(2).max(160),
      dueDate: z.iso.date().nullable(),
      dueMileage: z.number().int().nonnegative().max(2000000).nullable(),
    })
    .refine(
      (v) => v.dueDate !== null || v.dueMileage !== null,
      "Set a date or mileage",
    ),
  z.object({
    action: z.literal("complete"),
    vehicleId: z.uuid(),
    id: z.uuid(),
  }),
]);
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();
    const vehicle = await admin
      .from("vehicles")
      .select("id,mileage_km")
      .eq("id", input.vehicleId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (vehicle.error) throw vehicle.error;
    if (!vehicle.data)
      throw new ApiError(
        403,
        "Only the vehicle owner can change these settings",
      );
    if (input.action === "mileage") {
      if (input.mileage < (vehicle.data.mileage_km ?? 0))
        throw new ApiError(400, "Mileage cannot decrease");
      const { error } = await admin
        .from("vehicles")
        .update({ mileage_km: input.mileage })
        .eq("id", input.vehicleId)
        .eq("owner_id", user.id);
      if (error) throw error;
    } else if (input.action === "share") {
      const result = input.enabled
        ? await admin
            .from("vehicle_history_shares")
            .upsert({
              vehicle_id: input.vehicleId,
              owner_id: user.id,
              franchise_id: input.franchiseId,
            })
        : await admin
            .from("vehicle_history_shares")
            .delete()
            .eq("vehicle_id", input.vehicleId)
            .eq("owner_id", user.id)
            .eq("franchise_id", input.franchiseId);
      if (result.error) throw result.error;
    } else if (input.action === "reminder") {
      const { error } = await admin
        .from("maintenance_reminders")
        .insert({
          vehicle_id: input.vehicleId,
          owner_id: user.id,
          title: input.title,
          due_date: input.dueDate,
          due_mileage: input.dueMileage,
        });
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("maintenance_reminders")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("vehicle_id", input.vehicleId)
        .eq("owner_id", user.id);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
