import { z } from "zod";
import { ApiError,jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function POST(request:Request){
  try{
    const user=await requireAuthenticatedUser();
    const {jobId}=z.object({jobId:z.uuid()}).parse(await request.json());
    const admin=createAdminClient();
    const number=`INV-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const {data:id,error}=await admin.rpc("issue_repair_invoice",{p_job_id:jobId,p_actor_id:user.id,p_number:number});
    if(error){
      if(error.message.includes("ESTIMATE_REQUIRED")) throw new ApiError(400,"Save a positive repair amount before issuing an invoice","ESTIMATE_REQUIRED");
      if(error.message.includes("JOB_NOT_FOUND")) throw new ApiError(404,"Repair job not found","NOT_FOUND");
      if(error.message.includes("FORBIDDEN")) throw new ApiError(403,"You cannot issue an invoice for this job","FORBIDDEN");
      throw error;
    }
    const {data:invoice,error:lookupError}=await admin.from("invoices").select("id,number,status,total_amount").eq("id",id).single();
    if(lookupError) throw lookupError;
    return Response.json({invoice:camelize(invoice)});
  }catch(error){return jsonError(error);}
}
