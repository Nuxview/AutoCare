import { z } from "zod";
import { ApiError,jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobAccess } from "@/server/garage/scope";

const schema=z.object({jobId:z.uuid(),status:z.enum(["IN_PROGRESS","READY","COMPLETED"])});
export async function PATCH(request:Request){
  try{
    const input=schema.parse(await request.json());
    const {job}=await jobAccess(input.jobId,true);
    if(["COMPLETED","CANCELLED"].includes(job.status)) throw new ApiError(409,"This repair is already closed","JOB_CLOSED");
    if(job.status===input.status) return Response.json({ok:true});
    const admin=createAdminClient();
    if(input.status==="READY"||input.status==="COMPLETED"){
      const {data:tasks,error:taskError}=await admin.from("repair_tasks").select("status").eq("job_id",input.jobId);
      if(taskError) throw taskError;
      if(!tasks?.length||tasks.some(task=>task.status!=="COMPLETED")) throw new ApiError(409,"Complete every repair step first","TASKS_INCOMPLETE");
    }
    const {error}=await admin.from("jobs").update({status:input.status,...(input.status==="COMPLETED"?{completed_at:new Date().toISOString()}:{})}).eq("id",input.jobId);
    if(error) throw error;
    if(job.booking_id){const bookingStatus=input.status==="COMPLETED"?"COMPLETED":input.status==="READY"?"READY_FOR_COLLECTION":"IN_PROGRESS";const {error:bookingError}=await admin.from("bookings").update({status:bookingStatus}).eq("id",job.booking_id);if(bookingError) throw bookingError;}
    if(input.status==="READY"||input.status==="COMPLETED"){
      const {error:noticeError}=await admin.from("notifications").insert({user_id:job.customer_id,title:input.status==="READY"?"Vehicle ready for collection":"Repair completed",body:input.status==="READY"?"Your garage has completed the repair steps and your vehicle is ready.":"Your garage marked the repair as complete.",type:"REPAIR_STATUS",data:{jobId:job.id,status:input.status}});
      if(noticeError) throw noticeError;
    }
    return Response.json({ok:true});
  }catch(error){return jsonError(error);}
}
