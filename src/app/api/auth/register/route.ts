import { registerSchema } from "@/lib/validation";
import { register } from "@/server/auth/service";
import { jsonError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const result = await register(input);
    return Response.json(result, { status: 201 });
  } catch (error) { return jsonError(error); }
}
