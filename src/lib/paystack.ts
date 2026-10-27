import { createHmac, timingSafeEqual } from "node:crypto";
import Decimal from "decimal.js";
import { ApiError } from "./api";

export function toPaystackMinorUnits(amount: string | number) {
  const minor = new Decimal(amount).times(100);
  if (!minor.isInteger() || minor.lessThanOrEqualTo(0) || minor.greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new ApiError(400, "Invalid payment amount", "INVALID_AMOUNT");
  }
  return minor.toNumber();
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function nextBillingMonth(date: Date) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString();
}
