import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nextBillingMonth, toPaystackMinorUnits, verifyPaystackSignature } from "./paystack";

describe("Paystack payment boundaries", () => {
  it("converts KES amounts to exact minor units", () => {
    expect(toPaystackMinorUnits("3500.00")).toBe(350000);
    expect(toPaystackMinorUnits("123.45")).toBe(12345);
    expect(() => toPaystackMinorUnits("0.001")).toThrow();
    expect(() => toPaystackMinorUnits("-1")).toThrow();
  });

  it("requires an exact HMAC over the raw webhook body", () => {
    const raw = '{"event":"charge.success","data":{"reference":"PAY-123"}}';
    const secret = "sk_test_sample";
    const signature = createHmac("sha512", secret).update(raw).digest("hex");
    expect(verifyPaystackSignature(raw, signature, secret)).toBe(true);
    expect(verifyPaystackSignature(`${raw} `, signature, secret)).toBe(false);
    expect(verifyPaystackSignature(raw, "bad", secret)).toBe(false);
  });

  it("clamps month-end renewals", () => {
    expect(nextBillingMonth(new Date("2026-01-31T12:00:00.000Z"))).toBe("2026-02-28T12:00:00.000Z");
  });
});
