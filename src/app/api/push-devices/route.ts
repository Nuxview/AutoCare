import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";

const schema = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["web", "android", "ios"]) });
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(); const input = schema.parse(await request.json());
    const { data, error } = await createAdminClient().from("push_devices").upsert({ user_id: user.id, token: input.token, platform: input.platform, last_seen_at: new Date().toISOString() }, { onConflict: "token" }).select("id,platform").single();
    if (error) throw error;
    return Response.json({ device: data }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
