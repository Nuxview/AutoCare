import { jsonError } from "@/lib/api";
import { camelize } from "@/lib/supabase/format";
import { loadWorkspace } from "@/server/auth/workspace";
import { RequestTiming } from "@/server/timing";

export async function GET() {
  const timing = new RequestTiming();
  try {
    const workspace = await loadWorkspace(timing);
    return timing.response(
      Response.json({
        ...workspace,
        memberships: camelize(workspace.memberships),
      }),
    );
  } catch (error) {
    return timing.response(jsonError(error));
  }
}
