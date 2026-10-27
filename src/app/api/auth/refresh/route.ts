import { jsonError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function POST() {
  try {
    await requireAuthenticatedUser();
    return Response.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
