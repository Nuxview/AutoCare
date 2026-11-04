import { ApiError, jsonError } from "@/lib/api";
import { reconcileStripe, stripeClient } from "@/server/payments/stripe";

export async function POST(request: Request) {
  try {
    const stripe = stripeClient();
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new ApiError(400, "Missing signature");
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        await request.text(),
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      throw new ApiError(400, "Invalid webhook signature");
    }
    if (event.livemode)
      throw new ApiError(400, "Sandbox endpoint rejects live events");
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.expired",
      ].includes(event.type)
    ) {
      const object = event.data.object as {
        id: string;
        metadata?: Record<string, string> | null;
      };
      if (object.metadata?.paymentId)
        await reconcileStripe(
          await stripe.checkout.sessions.retrieve(object.id),
        );
    }
    return Response.json({ received: true });
  } catch (error) {
    return jsonError(error);
  }
}
