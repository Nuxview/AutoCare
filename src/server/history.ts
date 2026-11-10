import { ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireAuthenticatedUser,
  requireTenantMembership,
} from "@/server/auth/context";
import { can } from "@/lib/permissions";
// PostgREST returns one-to-one embeds as objects (notably jobs → invoices).
function list<T>(value: T | T[] | null): T[] {
  return value === null ? [] : Array.isArray(value) ? value : [value];
}
function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
export async function vehicleHistory(vehicleId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  const vehicle = await admin
    .from("vehicles")
    .select("id,owner_id,registration,make,model,year,mileage_km")
    .eq("id", vehicleId)
    .maybeSingle();
  if (vehicle.error) throw vehicle.error;
  if (!vehicle.data) throw new ApiError(404, "Vehicle not found");
  const owner = vehicle.data.owner_id === user.id;
  if (!owner) {
    const members = await admin
      .from("memberships")
      .select("franchise_id,role,franchise:franchises(status)")
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (members.error) throw members.error;
    const allowed = (members.data ?? []).filter((m) => can(m.role, "repairs"));
    const shares = await admin
      .from("vehicle_history_shares")
      .select("franchise_id")
      .eq("vehicle_id", vehicleId)
      .eq("owner_id", vehicle.data.owner_id)
      .in(
        "franchise_id",
        allowed.map((m) => m.franchise_id),
      );
    if (shares.error) throw shares.error;
    if (!shares.data?.length)
      throw new ApiError(
        403,
        "The vehicle owner has not shared this history with your garage",
      );
    await requireTenantMembership(shares.data[0].franchise_id, undefined, [
      "FRANCHISE_OWNER",
      "FRANCHISE_ADMIN",
      "SHOP_MANAGER",
      "SERVICE_ADVISOR",
      "MECHANIC",
    ], false, user);
  }
  // Explicit customer-facing fields only: never include another garage's internal notes.
  const jobs = await admin
    .from("jobs")
    .select(
      "id,reference,status,created_at,completed_at,odometer_in_km,booking_id,shop:shops(name),tasks:repair_tasks(title,status),parts:job_part_movements(quantity,item:inventory_items(name,sku)),invoices(id,number,total_amount,amount_paid,status,lines:invoice_lines(description,quantity,unit_price,line_total))",
    )
    .eq("vehicle_id", vehicleId)
    .eq("customer_id", vehicle.data.owner_id)
    .order("created_at", { ascending: false });
  if (jobs.error) throw jobs.error;
  const bookings = (jobs.data ?? []).map((j) => j.booking_id).filter(Boolean);
  const photos = bookings.length
    ? await admin
        .from("repair_photos")
        .select("id,booking_id,caption,storage_path,created_at")
        .in("booking_id", bookings)
    : { data: [], error: null };
  if (photos.error) throw photos.error;
  const signedPhotos = await Promise.all(
    (photos.data ?? []).map(async (photo) => {
      const signed = await admin.storage
        .from("repair-photos")
        .createSignedUrl(photo.storage_path, 300);
      if (signed.error) throw signed.error;
      return {
        id: photo.id,
        booking_id: photo.booking_id,
        caption: photo.caption,
        url: signed.data.signedUrl,
      };
    }),
  );
  const reminders = owner
    ? await admin
        .from("maintenance_reminders")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  const shares = owner
    ? await admin
        .from("vehicle_history_shares")
        .select("franchise_id,garage:franchises(name)")
        .eq("vehicle_id", vehicleId)
        .eq("owner_id", user.id)
    : { data: [], error: null };
  if (reminders.error) throw reminders.error;
  if (shares.error) throw shares.error;
  const timeline = (jobs.data ?? []).map((job) => ({
    ...job,
    shop: one(job.shop),
    invoices: list(job.invoices),
    parts: (job.parts ?? []).map((part) => ({ ...part, item: one(part.item) })),
  }));
  return {
    vehicle: vehicle.data,
    owner,
    jobs: timeline,
    photos: signedPhotos,
    reminders: reminders.data,
    shares: shares.data,
  };
}
