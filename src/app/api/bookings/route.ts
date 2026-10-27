import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { bookingSchema } from "@/lib/validation";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { garageScope } from "@/server/garage/scope";
import { createBooking } from "@/server/bookings/service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const { data, error } = await createAdminClient().from("bookings").select("*,shop:shops(id,name,county),vehicle:vehicles(registration,make,model),service:service_catalog(name,base_price),job:jobs(id,reference,status)").eq("customer_id", user.id).order("scheduled_at", { ascending: false });
    if (error) throw error;
    return Response.json({ bookings: camelize(data) });
  } catch (error) { return jsonError(error); }
}

export async function PUT() {
  try {
    const scope = await garageScope();
    let query = createAdminClient().from("bookings").select("*,shop:shops(id,name),vehicle:vehicles(registration,make,model),customer:profiles!bookings_customer_id_fkey(first_name,last_name),service:service_catalog(name),job:jobs(id,reference,status)").eq("franchise_id",scope.franchiseId).order("scheduled_at",{ascending:false});
    if (scope.shopId) query = query.eq("shop_id",scope.shopId);
    const { data,error } = await query;
    if (error) throw error;
    return Response.json({bookings:camelize(data)});
  } catch(error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    return Response.json({ booking: await createBooking(user.id, bookingSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
