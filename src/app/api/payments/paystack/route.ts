import Decimal from "decimal.js";
import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { fetchSubaccount, initializeTransaction, paystackSecretKey, toPaystackMinorUnits } from "@/server/payments/paystack";

const schema = z.object({ invoiceId: z.uuid() });

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { invoiceId } = schema.parse(await request.json());
    paystackSecretKey();
    const admin = createAdminClient();
    const { data: invoice, error } = await admin.from("invoices").select("*")
      .eq("id", invoiceId).eq("customer_id", user.id)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]).maybeSingle();
    if (error) throw error;
    if (!invoice) throw new ApiError(404, "Payable invoice not found", "INVOICE_NOT_FOUND");
    if (invoice.currency !== "KES") throw new ApiError(400, "Paystack payments require a KES invoice", "UNSUPPORTED_CURRENCY");
    const amount = new Decimal(invoice.total_amount).minus(invoice.amount_paid);
    const minorAmount = toPaystackMinorUnits(amount.toString());
    if (minorAmount < 300) throw new ApiError(400, "Paystack requires at least KES 3", "INVALID_AMOUNT");

    const { data: franchise, error: franchiseError } = await admin.from("franchises")
      .select("paystack_subaccount_code").eq("id", invoice.franchise_id).single();
    if (franchiseError) throw franchiseError;
    if (!franchise.paystack_subaccount_code) throw new ApiError(409, "This garage has not connected payouts", "PAYOUTS_NOT_CONNECTED");
    const subaccount = await fetchSubaccount(franchise.paystack_subaccount_code);
    if (!subaccount.active || subaccount.currency !== "KES") throw new ApiError(409, "This garage's payout account is unavailable", "PAYOUTS_NOT_CONNECTED");

    const { data: existing, error: existingError } = await admin.from("payments")
      .select("reference,checkout_url").eq("invoice_id", invoice.id).eq("provider", "PAYSTACK")
      .in("status", ["PENDING", "PROCESSING"]).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.checkout_url) return Response.json({ checkoutUrl: existing.checkout_url, reference: existing.reference });
    if (existing) throw new ApiError(409, "Checkout is starting. Please try again shortly", "CHECKOUT_STARTING");

    const reference = `PAY-${crypto.randomUUID().replaceAll("-", "")}`;
    const inserted = await admin.from("payments").insert({
      reference, franchise_id: invoice.franchise_id, shop_id: invoice.shop_id,
      customer_id: user.id, invoice_id: invoice.id, provider: "PAYSTACK",
      amount: amount.toString(), currency: "KES",
    }).select("id").single();
    if (inserted.error?.code === "23505") throw new ApiError(409, "A checkout is already open for this invoice", "CHECKOUT_OPEN");
    if (inserted.error) throw inserted.error;

    let checkoutReady = false;
    try {
      const callbackUrl = new URL("/dashboard/invoices", process.env.APP_URL ?? "http://localhost:3000");
      callbackUrl.searchParams.set("paystack_reference", reference);
      const checkout = await initializeTransaction({
        email: user.email, amount: minorAmount, currency: "KES", reference,
        subaccount: franchise.paystack_subaccount_code, bearer: "subaccount",
        callback_url: callbackUrl.toString(),
        metadata: JSON.stringify({ kind: "invoice", paymentId: inserted.data.id }),
      });
      if (checkout.reference !== reference || !checkout.authorization_url.startsWith("https://checkout.paystack.com/")) {
        throw new ApiError(502, "Paystack returned an invalid checkout", "PAYMENT_PROVIDER_ERROR");
      }
      checkoutReady = true;
      const saved = await admin.from("payments").update({ status: "PROCESSING", checkout_url: checkout.authorization_url })
        .eq("id", inserted.data.id);
      if (saved.error) throw saved.error;
      return Response.json({ checkoutUrl: checkout.authorization_url, reference });
    } catch (checkoutError) {
      if (!checkoutReady) {
        await admin.from("payments").update({ status: "FAILED", failure_reason: "Checkout could not be started" })
          .eq("id", inserted.data.id).eq("status", "PENDING");
      }
      throw checkoutError;
    }
  } catch (error) { return jsonError(error); }
}
