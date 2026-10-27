import Decimal from "decimal.js";
import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhone } from "@/lib/security";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { callbackFingerprint, requestStkPush } from "@/server/payments/mpesa";

const schema = z.object({ invoiceId: z.uuid(), phone: z.string().min(9).max(20), amount: z.number().positive() });
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(); const input = schema.parse(await request.json());
    const admin = createAdminClient();
    const invoiceResult = await admin.from("invoices").select("*").eq("id", input.invoiceId).eq("customer_id", user.id).in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]).maybeSingle();
    if (invoiceResult.error) throw invoiceResult.error;
    const invoice = invoiceResult.data;
    if (!invoice) throw new ApiError(404, "Payable invoice not found", "INVOICE_NOT_FOUND");
    const outstanding = new Decimal(invoice.total_amount.toString()).minus(invoice.amount_paid.toString());
    if (new Decimal(input.amount).greaterThan(outstanding)) throw new ApiError(400, "Payment exceeds the outstanding balance", "INVALID_AMOUNT");
    const paymentResult = await admin.from("payments").insert({ reference: `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, franchise_id: invoice.franchise_id, shop_id: invoice.shop_id, customer_id: user.id, invoice_id: invoice.id, provider: "MPESA", amount: input.amount }).select().single();
    if (paymentResult.error) throw paymentResult.error;
    const payment = paymentResult.data;
    try {
      const requestResult = await requestStkPush({ phone: normalizeKenyanPhone(input.phone), amount: input.amount, accountReference: invoice.number, description: `AutoCare ${invoice.number}` });
      const { error } = await admin.from("payments").update({ status: "PROCESSING", provider_reference: callbackFingerprint(requestResult.checkoutRequestId) }).eq("id", payment.id);
      if (error) throw error;
      return Response.json({ paymentId: payment.id, reference: payment.reference, message: "Check your phone and enter your M-Pesa PIN" }, { status: 202 });
    } catch (error) { await admin.from("payments").update({ status: "FAILED", failure_reason: error instanceof Error ? error.message : "Provider request failed" }).eq("id", payment.id); throw error; }
  } catch (error) { return jsonError(error); }
}
