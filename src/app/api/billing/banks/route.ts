import { jsonError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { listKenyanBanks } from "@/server/payments/paystack";

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const banks = await listKenyanBanks();
    return Response.json({ banks: banks.map(({ name, code }) => ({ name, code })) });
  } catch (error) { return jsonError(error); }
}
