import { z } from "zod";
import { jsonError } from "@/lib/api";
import { quoteSchema } from "@/lib/workshop-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobAccess } from "@/server/garage/scope";
import { workshopRpc } from "@/server/workshop";

export async function GET(request: Request) {
  try {
    const jobId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("jobId"));
    await jobAccess(jobId);
    const { data, error } = await createAdminClient()
      .from("repair_quotes")
      .select("*,lines:repair_quote_lines(*)")
      .eq("job_id", jobId)
      .order("version", { ascending: false });
    if (error) throw error;
    return Response.json({ quotes: data });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = quoteSchema.parse(await request.json());
    const id = await workshopRpc("send_repair_quote", {
      p_job_id: input.jobId,
      p_lines: input.lines,
      p_note: input.note,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const input = z
      .object({ quoteId: z.uuid(), decision: z.enum(["APPROVED", "DECLINED"]) })
      .parse(await request.json());
    await workshopRpc("decide_repair_quote", {
      p_quote_id: input.quoteId,
      p_decision: input.decision,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
