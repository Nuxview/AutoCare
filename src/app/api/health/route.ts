import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { error } = await createAdminClient().from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return Response.json({ status: "ok", database: "supabase-connected", authentication: "supabase", storage: "not-configured", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
