import { z } from "zod";
import { jsonError } from "@/lib/api";
import { workshopRpc } from "@/server/workshop";
export async function PATCH(request: Request) {
  try {
    const input = z
      .object({
        jobId: z.uuid(),
        mileage: z.number().int().min(0).max(2000000),
      })
      .parse(await request.json());
    await workshopRpc("record_service_mileage", {
      p_job_id: input.jobId,
      p_mileage: input.mileage,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
