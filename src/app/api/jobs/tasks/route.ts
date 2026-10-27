import { z } from "zod";
import { ApiError,jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { jobAccess } from "@/server/garage/scope";

const createSchema=z.object({jobId:z.uuid(),title:z.string().trim().min(2).max(120),note:z.string().trim().max(500).optional()});
const updateSchema=z.object({taskId:z.uuid(),status:z.enum(["PENDING","IN_PROGRESS","COMPLETED"]),note:z.string().trim().max(500).optional()});
export async function GET(request:Request) {
  try {
    const jobId=z.uuid().parse(new URL(request.url).searchParams.get("jobId"));
    await jobAccess(jobId);
    const {data,error}=await createAdminClient().from("repair_tasks").select("*").eq("job_id",jobId).order("position").order("created_at");
    if(error) throw error;
    return Response.json({tasks:camelize(data)});
  } catch(error){return jsonError(error);}
}
export async function POST(request:Request) {
  try {
    const input=createSchema.parse(await request.json());
    await jobAccess(input.jobId,true);
    const admin=createAdminClient();
    const {count,error:countError}=await admin.from("repair_tasks").select("id",{count:"exact",head:true}).eq("job_id",input.jobId);
    if(countError) throw countError;
    if((count??0)>=50) throw new ApiError(400,"A repair job can have up to 50 steps","TASK_LIMIT");
    const {data,error}=await admin.from("repair_tasks").insert({job_id:input.jobId,title:input.title,note:input.note??null,position:count??0}).select().single();
    if(error) throw error;
    return Response.json({task:camelize(data)},{status:201});
  } catch(error){return jsonError(error);}
}
export async function PATCH(request:Request) {
  try {
    const input=updateSchema.parse(await request.json());
    const admin=createAdminClient();
    const {data:existing,error:lookupError}=await admin.from("repair_tasks").select("job_id").eq("id",input.taskId).maybeSingle();
    if(lookupError) throw lookupError;
    if(!existing) throw new ApiError(404,"Repair step not found","NOT_FOUND");
    const {job}=await jobAccess(existing.job_id,true);
    const {data,error}=await admin.from("repair_tasks").update({status:input.status,...(input.note!==undefined?{note:input.note}:{})}).eq("id",input.taskId).select().single();
    if(error) throw error;
    const {error:touchError}=await admin.from("jobs").update({updated_at:new Date().toISOString(),...(input.status==="IN_PROGRESS"&&job.status==="OPEN"?{status:"IN_PROGRESS"}:{})}).eq("id",existing.job_id);
    if(touchError) throw touchError;
    return Response.json({task:camelize(data)});
  } catch(error){return jsonError(error);}
}
