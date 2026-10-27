import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { vehicleSchema } from "@/lib/validation";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const { data, error } = await createAdminClient().from("vehicles").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ vehicles: camelize(data) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const input = vehicleSchema.parse(await request.json());
    const { data, error } = await createAdminClient().from("vehicles").insert({ owner_id: user.id, registration: input.registration, make: input.make, model: input.model, year: input.year, color: input.color ?? null, mileage_km: input.mileageKm ?? null }).select().single();
    if (error) throw error;
    return Response.json({ vehicle: camelize(data) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
