import Decimal from "decimal.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { callbackFingerprint } from "@/server/payments/mpesa";

type Callback = { Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; ResultDesc?: string; CallbackMetadata?: { Item?: Array<{ Name: string; Value?: string | number }> } } } };
export async function POST(request: Request) {
  const body = await request.json() as Callback; const callback = body.Body?.stkCallback;
  if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== "number") return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  const admin = createAdminClient();
  const paymentResult = await admin.from("payments").select("*,invoice:invoices(*)").eq("provider_reference", callbackFingerprint(callback.CheckoutRequestID)).maybeSingle();
  const payment = paymentResult.data;
  if (!payment || ["SUCCEEDED", "FAILED"].includes(payment.status)) return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  if (callback.ResultCode !== 0) await admin.from("payments").update({ status: "FAILED", failure_reason: callback.ResultDesc ?? "M-Pesa payment failed" }).eq("id", payment.id);
  else {
    const receipt = callback.CallbackMetadata?.Item?.find((item) => item.Name === "MpesaReceiptNumber")?.Value;
    await admin.from("payments").update({ status: "SUCCEEDED", paid_at: new Date().toISOString(), failure_reason: receipt ? `Receipt ${receipt}` : null }).eq("id", payment.id).eq("status", "PROCESSING");
    const invoice = payment.invoice as Record<string, unknown>;
    const amountPaid = new Decimal(invoice.amount_paid as string).plus(payment.amount.toString());
    await admin.from("invoices").update({ amount_paid: amountPaid.toString(), status: amountPaid.greaterThanOrEqualTo(invoice.total_amount as string) ? "PAID" : "PARTIALLY_PAID" }).eq("id", payment.invoice_id);
    await admin.from("notifications").insert({ user_id: payment.customer_id, title: "Payment received", body: `${payment.amount.toString()} ${payment.currency} was received for ${invoice.number}.`, type: "PAYMENT_SUCCEEDED", data: { paymentId: payment.id } });
  }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
