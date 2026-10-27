import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin=createAdminClient();
    const [{error},{data:photoBucket,error:photoError},{data:logoBucket,error:logoError}]=await Promise.all([
      admin.from("profiles").select("id",{head:true,count:"exact"}).limit(1),
      admin.storage.getBucket("repair-photos"),admin.storage.getBucket("garage-logos"),
    ]);
    if (error) throw error;
    if(photoError||logoError||!photoBucket||!logoBucket) throw new Error("Storage buckets unavailable");
    return Response.json({ status: "ok", database: "supabase-connected", authentication: "supabase", storage: "supabase-configured", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
