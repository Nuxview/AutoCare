import "server-only";
import { ApiError } from "@/lib/api";
export { toPaystackMinorUnits, verifyPaystackSignature } from "@/lib/paystack";

const baseUrl = "https://api.paystack.co";

export function paystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) {
    throw new ApiError(503, "Paystack is not configured", "PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return key;
}

type PaystackResponse<T> = { status: boolean; message: string; data: T };

export async function paystackRequest<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: { Authorization: `Bearer ${paystackSecretKey()}`, "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null) as PaystackResponse<T> | null;
  if (!response.ok || !payload?.status) {
    throw new ApiError(502, payload?.message ?? "Paystack could not complete the request", "PAYMENT_PROVIDER_ERROR");
  }
  return payload.data;
}

export type PaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string | null;
  customer?: { id?: number; customer_code?: string; email?: string } | null;
  plan?: string | { plan_code?: string } | null;
  subaccount?: { subaccount_code?: string } | string | null;
  metadata?: Record<string, unknown> | null;
};

export function verifyTransaction(reference: string) {
  return paystackRequest<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export type PaystackPlan = { plan_code: string; amount: number; currency: string; interval: string };

export function fetchPlan(code: string) {
  return paystackRequest<PaystackPlan>(`/plan/${encodeURIComponent(code)}`);
}

export type PaystackSubscription = {
  subscription_code: string;
  status: string;
  next_payment_date?: string | null;
  customer?: { customer_code?: string } | null;
  plan?: { plan_code?: string } | null;
};

export function fetchSubscription(code: string) {
  return paystackRequest<PaystackSubscription>(`/subscription/${encodeURIComponent(code)}`);
}

export type PaystackBank = { name: string; code: string; active?: boolean; currency?: string };

export async function listKenyanBanks() {
  const banks = await paystackRequest<PaystackBank[]>("/bank?country=kenya&perPage=100");
  return banks.filter((bank) => bank.active !== false && (!bank.currency || bank.currency === "KES"));
}

export function initializeTransaction(input: Record<string, unknown>) {
  return paystackRequest<{ authorization_url: string; reference: string }>("/transaction/initialize", { method: "POST", body: input });
}

export function createSubaccount(input: { business_name: string; bank_code: string; account_number: string; primary_contact_email: string }) {
  return paystackRequest<{ subaccount_code: string; currency: string; active: boolean }>("/subaccount", {
    method: "POST", body: {
      business_name: input.business_name,
      settlement_bank: input.bank_code,
      account_number: input.account_number,
      primary_contact_email: input.primary_contact_email,
      percentage_charge: 0,
    },
  });
}

export function fetchSubaccount(code: string) {
  return paystackRequest<{ subaccount_code: string; currency: string; active: boolean }>(`/subaccount/${encodeURIComponent(code)}`);
}
