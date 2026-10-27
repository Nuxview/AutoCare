import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();
    const membershipResult = await admin.from("memberships").select("*,franchise:franchises(id,name,status),shop:shops(id,name)").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (membershipResult.error) throw membershipResult.error;
    const membership = membershipResult.data;
    if (!membership) {
      const [vehiclesResult, bookingsResult, invoicesResult, recentResult, jobsResult] = await Promise.all([
        admin.from("vehicles").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", user.id).not("status", "in", '("COMPLETED","CANCELLED","DECLINED")'),
        admin.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", user.id).in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
        admin.from("bookings").select("id,reference,status,scheduled_at,shop:shops(name),vehicle:vehicles(registration),service:service_catalog(name)").eq("customer_id", user.id).order("scheduled_at", { ascending: false }).limit(5),
        admin.from("jobs").select("id,reference,status,estimate_amount,updated_at,shop:shops(name),vehicle:vehicles(registration,make,model),tasks:repair_tasks(id,title,status,position)").eq("customer_id",user.id).order("updated_at",{ascending:false}).limit(4),
      ]);
      const firstError = vehiclesResult.error ?? bookingsResult.error ?? invoicesResult.error ?? recentResult.error ?? jobsResult.error;
      if (firstError) throw firstError;
      return Response.json({ kind: "customer", user, metrics: { vehicles: vehiclesResult.count ?? 0, activeBookings: bookingsResult.count ?? 0, unpaidInvoices: invoicesResult.count ?? 0 }, recentBookings: camelize(recentResult.data),recentJobs:camelize(jobsResult.data) });
    }
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    let jobsQuery = admin.from("jobs").select("id", { count: "exact", head: true }).eq("franchise_id", membership.franchise_id).not("status", "in", '("COMPLETED","CANCELLED")');
    let bookingsQuery = admin.from("bookings").select("id", { count: "exact", head: true }).eq("franchise_id", membership.franchise_id).gte("scheduled_at", dayStart.toISOString()).lt("scheduled_at", dayEnd.toISOString());
    let stockQuery = admin.from("inventory_items").select("quantity_on_hand,reorder_level").eq("franchise_id", membership.franchise_id).eq("is_active", true);
    let receivablesQuery = admin.from("invoices").select("total_amount,amount_paid").eq("franchise_id", membership.franchise_id).in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);
    let recentQuery = admin.from("jobs").select("id,reference,status,updated_at,vehicle:vehicles(registration,make,model),customer:profiles!jobs_customer_id_fkey(first_name,last_name)").eq("franchise_id", membership.franchise_id).order("updated_at", { ascending: false }).limit(6);
    if (membership.shop_id) {
      jobsQuery = jobsQuery.eq("shop_id", membership.shop_id);
      bookingsQuery = bookingsQuery.eq("shop_id", membership.shop_id);
      stockQuery = stockQuery.eq("shop_id", membership.shop_id);
      receivablesQuery = receivablesQuery.eq("shop_id", membership.shop_id);
      recentQuery = recentQuery.eq("shop_id", membership.shop_id);
    }
    let pendingQuery=admin.from("bookings").select("id,reference,status,scheduled_at,shop:shops(name),vehicle:vehicles(registration,make,model),customer:profiles!bookings_customer_id_fkey(first_name,last_name)",{count:"exact"}).eq("franchise_id",membership.franchise_id).eq("status","REQUESTED").order("created_at",{ascending:false}).limit(5);
    if(membership.shop_id) pendingQuery=pendingQuery.eq("shop_id",membership.shop_id);
    const [jobsResult, bookingsResult, stockResult, receivablesResult, recentResult,pendingResult] = await Promise.all([
      jobsQuery, bookingsQuery, stockQuery, receivablesQuery, recentQuery,pendingQuery,
    ]);
    const firstError = jobsResult.error ?? bookingsResult.error ?? stockResult.error ?? receivablesResult.error ?? recentResult.error ?? pendingResult.error;
    if (firstError) throw firstError;
    const lowStock = (stockResult.data ?? []).filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)).length;
    const receivables = (receivablesResult.data ?? []).reduce((sum, invoice) => sum + Number(invoice.total_amount) - Number(invoice.amount_paid), 0);
    return Response.json({ kind: "garage", user, membership: camelize(membership), metrics: { openJobs: jobsResult.count ?? 0, todayBookings: bookingsResult.count ?? 0, lowStock, receivables, pendingBookings:pendingResult.count??0 }, recentJobs: camelize(recentResult.data),pendingBookings:camelize(pendingResult.data) });
  } catch (error) { return jsonError(error); }
}
