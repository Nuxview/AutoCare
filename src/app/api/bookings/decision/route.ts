import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";

const schema = z.object({bookingId:z.uuid(),decision:z.enum(["CONFIRMED","DECLINED"]),note:z.string().trim().max(500).optional()});
export async function POST(request:Request) {
  try {
    const user=await requireAuthenticatedUser();
    const input=schema.parse(await request.json());
    const {error}=await createAdminClient().rpc("decide_booking",{p_booking_id:input.bookingId,p_actor_id:user.id,p_decision:input.decision,p_note:input.note??null});
    if(error) {
      if(error.message.includes("BOOKING_ALREADY_REVIEWED")) throw new ApiError(409,"This booking has already been reviewed","ALREADY_REVIEWED");
      if(error.message.includes("FORBIDDEN")) throw new ApiError(403,"You cannot review this booking","FORBIDDEN");
      if(error.message.includes("BOOKING_NOT_FOUND")) throw new ApiError(404,"Booking not found","NOT_FOUND");
      throw error;
    }
    return Response.json({status:input.decision});
  } catch(error) {return jsonError(error);}
}
