import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { callbackFingerprint, reconcileMpesa } from "@/server/payments/mpesa";

export async function POST(request: Request) {
  try {
    const body = z
      .object({
        Body: z.object({
          stkCallback: z.object({
            CheckoutRequestID: z.string().min(1).max(200),
          }),
        }),
      })
      .parse(await request.json());
    const admin = createAdminClient();
    const found = await admin
      .from("payments")
      .select("reference")
      .eq("provider", "MPESA")
      .eq(
        "provider_reference",
        callbackFingerprint(body.Body.stkCallback.CheckoutRequestID),
      )
      .maybeSingle();
    if (found.error) throw found.error;
    if (found.data) await reconcileMpesa(found.data.reference);
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    return jsonError(error);
  }
}
