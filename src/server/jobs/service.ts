import { ApiError } from "@/lib/api";
import { requireAuthenticatedUser, requireTenantMembership } from "@/server/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";

const managementRoles = ["FRANCHISE_OWNER", "FRANCHISE_ADMIN", "SHOP_MANAGER", "SERVICE_ADVISOR"] as const;
function reference() { return `JOB-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }

export async function listVisibleJobs() {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin.from("memberships").select("franchise_id,shop_id").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (membershipError) throw membershipError;
  let query = admin.from("jobs").select("*,shop:shops(name),vehicle:vehicles(registration,make,model),customer:profiles!jobs_customer_id_fkey(first_name,last_name)").order("updated_at", { ascending: false });
  query = membership ? query.eq("franchise_id", membership.franchise_id) : query.eq("customer_id", user.id);
  if (membership?.shop_id) query = query.eq("shop_id", membership.shop_id);
  const { data, error } = await query;
  if (error) throw error;
  return camelize(data);
}

export async function createJobFromBooking(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking, error: bookingError } = await admin.from("bookings").select("franchise_id,shop_id").eq("id", bookingId).maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new ApiError(404, "Booking not found", "BOOKING_NOT_FOUND");
  const { user } = await requireTenantMembership(booking.franchise_id, booking.shop_id, [...managementRoles]);
  const { data: id, error } = await admin.rpc("create_job_from_booking", { p_booking_id: bookingId, p_actor_id: user.id, p_reference: reference() });
  if (error) {
    if (error.message.includes("JOB_EXISTS")) throw new ApiError(409, "A job already exists for this booking", "JOB_EXISTS");
    if (error.message.includes("INVALID_BOOKING_STATUS")) throw new ApiError(409, "Confirm or check in the booking before creating a job", "INVALID_BOOKING_STATUS");
    throw error;
  }
  const result = await admin.from("jobs").select("*").eq("id", id).single();
  if (result.error) throw result.error;
  return camelize(result.data);
}
