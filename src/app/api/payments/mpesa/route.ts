import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhone } from "@/lib/security";
import { requireAuthenticatedUser } from "@/server/auth/context";
import {
  callbackFingerprint,
  requestStkPush,
  requireMpesaConfig,
} from "@/server/payments/mpesa";
import { assertSandboxGarage } from "@/server/payments/settings";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const input = z
      .object({ invoiceId: z.uuid(), phone: z.string().min(9).max(20) })
      .parse(await request.json());
    let phone: string;
    try {
      phone = normalizeKenyanPhone(input.phone);
    } catch {
      throw new ApiError(
        400,
        "Enter a valid Kenyan mobile number",
        "INVALID_PHONE",
      );
    }
    requireMpesaConfig();
    const admin = createAdminClient();
    const found = await admin
      .from("invoices")
      .select("*")
      .eq("id", input.invoiceId)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new ApiError(404, "Invoice not found");
    assertSandboxGarage(found.data.franchise_id);
    const reserved = await admin.rpc("reserve_sandbox_payment", {
      p_invoice_id: input.invoiceId,
      p_customer_id: user.id,
      p_provider: "MPESA",
    });
    if (reserved.error) throw reserved.error;
    const payment = reserved.data;
    // Claim initiation once: an ambiguous network timeout must not send another STK push.
    const claim = await admin
      .from("payments")
      .update({ status: "PROCESSING" })
      .eq("id", payment.id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();
    if (claim.error) throw claim.error;
    if (claim.data) {
      const checkoutId = await requestStkPush({
        phone,
        amount: Number(payment.amount),
        accountReference: found.data.number,
      });
      const saved = await admin
        .from("payments")
        .update({
          provider_reference: callbackFingerprint(checkoutId),
          mpesa_checkout_id: checkoutId,
        })
        .eq("id", payment.id);
      if (saved.error) throw saved.error;
    }
    return Response.json(
      {
        reference: payment.reference,
        test: true,
        message:
          "Sandbox request sent. Check payment status to confirm the result.",
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
