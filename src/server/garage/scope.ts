import { ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser, requireTenantMembership } from "@/server/auth/context";

export async function garageScope(roles?: Array<"FRANCHISE_OWNER" | "FRANCHISE_ADMIN" | "SHOP_MANAGER" | "SERVICE_ADVISOR" | "MECHANIC" | "INVENTORY_CLERK" | "ACCOUNTANT">) {
  const user = await requireAuthenticatedUser();
  const { data, error } = await createAdminClient().from("memberships").select("franchise_id,shop_id,role").eq("user_id", user.id).eq("is_active",true).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || (roles && !roles.includes(data.role))) throw new ApiError(403,"Garage access is required","FORBIDDEN");
  return { user, franchiseId: data.franchise_id as string, shopId: data.shop_id as string | null, role: data.role as string };
}

export async function bookingAccess(bookingId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("bookings").select("id,franchise_id,shop_id,customer_id,status").eq("id",bookingId).maybeSingle();
  if (error) throw error;
  if (!booking) throw new ApiError(404,"Booking not found","NOT_FOUND");
  if (booking.customer_id !== user.id) await requireTenantMembership(booking.franchise_id,booking.shop_id);
  return { user, booking };
}

export async function jobAccess(jobId: string, management = false) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  const { data: job, error } = await admin.from("jobs").select("id,booking_id,franchise_id,shop_id,customer_id,status").eq("id",jobId).maybeSingle();
  if (error) throw error;
  if (!job) throw new ApiError(404,"Repair job not found","NOT_FOUND");
  if (management || job.customer_id !== user.id) await requireTenantMembership(job.franchise_id,job.shop_id,management ? ["FRANCHISE_OWNER","FRANCHISE_ADMIN","SHOP_MANAGER","SERVICE_ADVISOR","MECHANIC"] : undefined);
  return { user, job };
}
