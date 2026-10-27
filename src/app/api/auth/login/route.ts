import { loginSchema } from "@/lib/validation";
import { login } from "@/server/auth/service";
import { jsonError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const result = await login(loginSchema.parse(await request.json()));
    return Response.json({ user: { id: result.user.id, email: result.user.email, firstName: result.user.firstName, lastName: result.user.lastName, globalRole: result.user.globalRole } });
  } catch (error) { return jsonError(error); }
}
