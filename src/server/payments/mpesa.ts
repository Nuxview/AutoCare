import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api";

function config() {
  const env = process.env.MPESA_ENV === "production" ? "production" : "sandbox";
  const consumerKey = process.env.MPESA_CONSUMER_KEY; const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE; const passkey = process.env.MPESA_PASSKEY;
  if (!consumerKey || !consumerSecret || !shortcode || !passkey) throw new ApiError(503, "M-Pesa is not configured", "PAYMENT_PROVIDER_UNAVAILABLE");
  return { baseUrl: env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke", consumerKey, consumerSecret, shortcode, passkey };
}

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

async function accessToken() {
  const { baseUrl, consumerKey, consumerSecret } = config();
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { headers: { authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}` }, cache: "no-store" });
  if (!response.ok) throw new ApiError(502, "M-Pesa authentication failed", "PAYMENT_PROVIDER_ERROR");
  return (await response.json() as { access_token: string }).access_token;
}

export async function requestStkPush(input: { phone: string; amount: number; accountReference: string; description: string }) {
  const { baseUrl, shortcode, passkey } = config(); const stamp = timestamp(); const password = Buffer.from(`${shortcode}${passkey}${stamp}`).toString("base64");
  const callbackBase = process.env.MPESA_CALLBACK_URL ?? `${process.env.APP_URL}/api/payments/mpesa/callback`;
  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, { method: "POST", headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" }, body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: stamp, TransactionType: "CustomerPayBillOnline", Amount: Math.round(input.amount), PartyA: input.phone.replace("+", ""), PartyB: shortcode, PhoneNumber: input.phone.replace("+", ""), CallBackURL: callbackBase, AccountReference: input.accountReference.slice(0, 12), TransactionDesc: input.description.slice(0, 32) }) });
  const data = await response.json() as { MerchantRequestID?: string; CheckoutRequestID?: string; ResponseCode?: string; errorMessage?: string };
  if (!response.ok || data.ResponseCode !== "0" || !data.CheckoutRequestID) throw new ApiError(502, data.errorMessage ?? "M-Pesa could not start the payment", "PAYMENT_PROVIDER_ERROR");
  return { merchantRequestId: data.MerchantRequestID!, checkoutRequestId: data.CheckoutRequestID };
}

export function callbackFingerprint(checkoutRequestId: string) { return createHash("sha256").update(checkoutRequestId).digest("hex"); }
