import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";

export async function GET(request: Request) {
  const county = new URL(request.url).searchParams.get("county")?.trim();
  let query = createAdminClient().from("shops").select("id,name,address,county,booking_capacity,franchise:franchises!inner(name,slug,logo_url,status),services:service_catalog(id,name,description,base_price,estimated_minutes,is_active)").eq("is_active", true).in("franchise.status", ["ACTIVE", "TRIAL"]).order("name");
  if (county) query = query.ilike("county", county);
  const { data, error } = await query;
  if (error) return Response.json({ error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  const shops = (data ?? []).map((shop: Record<string, unknown>) => ({ ...shop, services: (shop.services as Array<Record<string, unknown>> ?? []).filter((service) => service.is_active) }));
  return Response.json({ shops: camelize(shops) });
}
