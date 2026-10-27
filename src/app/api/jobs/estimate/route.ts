import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobAccess } from "@/server/garage/scope";
import { requireTenantMembership } from "@/server/auth/context";

const schema=z.object({jobId:z.uuid(),amount:z.number().finite().nonnegative().max(100000000),note:z.string().trim().max(500).optional()});
export async function PATCH(request:Request) {
  try {
    const input=schema.parse(await request.json());
    const {job}=await jobAccess(input.jobId,true);
    await requireTenantMembership(job.franchise_id,job.shop_id,["FRANCHISE_OWNER","FRANCHISE_ADMIN","SHOP_MANAGER","SERVICE_ADVISOR"]);
    const {error}=await createAdminClient().from("jobs").update({estimate_amount:input.amount,estimate_note:input.note??null}).eq("id",input.jobId);
    if(error) throw error;
    return Response.json({ok:true});
  } catch(error){return jsonError(error);}
}
