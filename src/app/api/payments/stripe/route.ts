import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { reconcileStripe, stripeClient } from "@/server/payments/stripe";
import { assertSandboxGarage, paymentAppUrl } from "@/server/payments/settings";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { invoiceId } = z
      .object({ invoiceId: z.uuid() })
      .parse(await request.json());
    const stripe = stripeClient();
    const admin = createAdminClient();
    const { data: invoice, error } = await admin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!invoice) throw new ApiError(404, "Invoice not found");
    assertSandboxGarage(invoice.franchise_id);
    const reserved = await admin.rpc("reserve_sandbox_payment", {
      p_invoice_id: invoiceId,
      p_customer_id: user.id,
      p_provider: "STRIPE",
    });
    if (reserved.error) throw reserved.error;
    const payment = reserved.data;
    if (payment.provider_reference) {
      const existing = await stripe.checkout.sessions.retrieve(
        payment.provider_reference,
      );
      const status = await reconcileStripe(existing);
      if (existing.status === "open" && existing.url)
        return Response.json({
          checkoutUrl: existing.url,
          reference: payment.reference,
          test: true,
        });
      throw new ApiError(
        409,
        `Payment is ${status.toLowerCase()}. Refresh the invoice before trying again.`,
      );
    }
    if (Date.now() - Date.parse(payment.created_at) > 23 * 60 * 60 * 1000)
      throw new ApiError(
        409,
        "This checkout needs reconciliation. Contact the garage before trying again.",
      );
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        allowed_payment_method_types: ["card"],
        client_reference_id: payment.reference,
        metadata: { paymentId: payment.id },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "kes",
              unit_amount: Math.round(Number(payment.amount) * 100),
              product_data: {
                name: `AutoCare invoice ${invoice.number} (sandbox)`,
              },
            },
          },
        ],
        success_url: `${paymentAppUrl()}/dashboard/invoices?stripe_reference=${encodeURIComponent(payment.reference)}`,
        cancel_url: `${paymentAppUrl()}/dashboard/invoices?stripe_reference=${encodeURIComponent(payment.reference)}`,
      },
      { idempotencyKey: payment.reference },
    );
    if (!session.url?.startsWith("https://checkout.stripe.com/"))
      throw new ApiError(502, "Invalid checkout URL");
    const saved = await admin
      .from("payments")
      .update({
        provider_reference: session.id,
        checkout_url: session.url,
        status: "PROCESSING",
      })
      .eq("id", payment.id)
      .in("status", ["PENDING", "PROCESSING"]);
    if (saved.error) throw saved.error;
    return Response.json({
      checkoutUrl: session.url,
      reference: payment.reference,
      test: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
