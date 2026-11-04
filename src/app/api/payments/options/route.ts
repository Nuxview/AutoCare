import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const invoiceId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("invoiceId"));
    const admin = createAdminClient();
    const found = await admin
      .from("invoices")
      .select("franchise_id")
      .eq("id", invoiceId)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new ApiError(404, "Invoice not found");
    const test = Boolean(
      process.env.PAYMENT_TEST_FRANCHISE_ID &&
        found.data.franchise_id === process.env.PAYMENT_TEST_FRANCHISE_ID,
    );
    const pending = await admin
      .from("payments")
      .select("reference,provider,checkout_url")
      .eq("invoice_id", invoiceId)
      .in("status", ["PENDING", "PROCESSING"])
      .in("provider", ["MPESA", "STRIPE", "PAYSTACK"])
      .maybeSingle();
    if (pending.error) throw pending.error;
    return Response.json({
      test,
      stripe:
        test &&
        Boolean(
          process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
            process.env.STRIPE_WEBHOOK_SECRET,
        ),
      mpesa:
        test &&
        process.env.MPESA_ENV === "sandbox" &&
        Boolean(
          process.env.MPESA_CONSUMER_KEY &&
            process.env.MPESA_CONSUMER_SECRET &&
            process.env.MPESA_SHORTCODE &&
            process.env.MPESA_PASSKEY,
        ),
      paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
      pending: pending.data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
