import { z } from "zod";
import { jsonError } from "@/lib/api";
import { partSchema } from "@/lib/workshop-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobAccess } from "@/server/garage/scope";
import { workshopRpc } from "@/server/workshop";
export async function GET(request: Request) {
  try {
    const jobId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("jobId"));
    const { job, user } = await jobAccess(jobId);
    const admin = createAdminClient();
    const movements = await admin
      .from("job_part_movements")
      .select(
        "*,item:inventory_items(name,sku),actor:profiles(first_name,last_name)",
      )
      .eq("job_id", jobId)
      .order("created_at");
    if (movements.error) throw movements.error;
    const items =
      user.id === job.customer_id
        ? { data: [], error: null }
        : await admin
            .from("inventory_items")
            .select("id,name,sku,quantity_on_hand,selling_price")
            .eq("shop_id", job.shop_id)
            .eq("is_active", true)
            .order("name");
    if (items.error) throw items.error;
    return Response.json({ movements: movements.data, items: items.data });
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = partSchema.parse(await request.json());
    await workshopRpc("record_job_parts", {
      p_job_id: input.jobId,
      p_item_id: input.itemId,
      p_quantity: input.quantity,
      p_direction: input.direction,
      p_request_id: input.requestId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
