import "server-only";
import { ApiError } from "@/lib/api";

// Sandbox credentials may only settle invoices belonging to the designated demo garage.
export function assertSandboxGarage(franchiseId: string) {
  if (
    !process.env.PAYMENT_TEST_FRANCHISE_ID ||
    franchiseId !== process.env.PAYMENT_TEST_FRANCHISE_ID
  )
    throw new ApiError(
      403,
      "Sandbox payments are only available for the demo garage",
      "SANDBOX_ONLY",
    );
}

export function paymentAppUrl() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new ApiError(
      503,
      "Payment callback URL must use HTTPS",
      "PAYMENT_CONFIGURATION",
    );
  return url.origin;
}
