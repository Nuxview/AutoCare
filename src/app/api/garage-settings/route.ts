import { z } from "zod";
import { ApiError,jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { garageScope } from "@/server/garage/scope";

const hour=z.object({open:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),close:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).nullable();
const hours=z.object({mon:hour,tue:hour,wed:hour,thu:hour,fri:hour,sat:hour,sun:hour}).refine(v=>Object.values(v).every(h=>!h||h.open<h.close),"Closing time must follow opening time");
const schema=z.object({shopId:z.uuid(),name:z.string().trim().min(2).max(100),franchiseName:z.string().trim().min(2).max(100).optional(),acceptsBookings:z.boolean(),openingHours:hours});
export async function GET() {
  try {
    const scope=await garageScope();
    let query=createAdminClient().from("shops").select("id,name,address,county,accepts_bookings,opening_hours,franchise:franchises(id,name,logo_url)").eq("franchise_id",scope.franchiseId).order("name");
    if(scope.shopId) query=query.eq("id",scope.shopId);
    const {data,error}=await query;
    if(error) throw error;
    return Response.json({shops:camelize(data)});
  } catch(error){return jsonError(error);}
}
export async function PATCH(request:Request) {
  try {
    const scope=await garageScope(["FRANCHISE_OWNER","FRANCHISE_ADMIN","SHOP_MANAGER"]);
    const input=schema.parse(await request.json());
    if(scope.shopId&&scope.shopId!==input.shopId) throw new ApiError(403,"This shop is outside your scope","FORBIDDEN");
    const admin=createAdminClient();
    const {data:shop,error:lookupError}=await admin.from("shops").select("id").eq("id",input.shopId).eq("franchise_id",scope.franchiseId).maybeSingle();
    if(lookupError) throw lookupError;
    if(!shop) throw new ApiError(404,"Shop not found","NOT_FOUND");
    if(input.franchiseName&&scope.role!=="FRANCHISE_OWNER"&&scope.role!=="FRANCHISE_ADMIN") throw new ApiError(403,"Only the garage owner can change the business name","FORBIDDEN");
    const {error}=await admin.from("shops").update({name:input.name,accepts_bookings:input.acceptsBookings,opening_hours:input.openingHours}).eq("id",input.shopId);
    if(error) throw error;
    if(input.franchiseName) {
      const {error:nameError}=await admin.from("franchises").update({name:input.franchiseName}).eq("id",scope.franchiseId);
      if(nameError) throw nameError;
    }
    return Response.json({ok:true});
  } catch(error){return jsonError(error);}
}
