"use client";

import { request } from "@/lib/client-cache";
import { useEffect, useState } from "react";

type Options = {
  test: boolean;
  stripe: boolean;
  mpesa: boolean;
  paystack: boolean;
  pending: {
    reference: string;
    provider: string;
    checkout_url?: string;
  } | null;
};
export function InvoicePayment({
  invoiceId,
  onPaid,
}: {
  invoiceId: string;
  onPaid: () => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void request(`/api/payments/options?invoiceId=${invoiceId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Payment options could not be loaded.");
        const data = await r.json();
        if (active) setOptions(data);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [invoiceId]);

  async function pay(provider: "stripe" | "mpesa" | "paystack") {
    setBusy(true);
    setMessage("");
    try {
      const r = await request(`/api/payments/${provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId, phone }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error?.message || "Payment could not be started.");
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setOptions((current) =>
        current
          ? {
              ...current,
              pending: { reference: data.reference, provider: "MPESA" },
            }
          : current,
      );
      setMessage(data.message);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Payment could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!options?.pending) return;
    setBusy(true);
    try {
      const endpoint =
        options.pending.provider === "PAYSTACK" ? "paystack/verify" : "status";
      const r = await request(
        `/api/payments/${endpoint}?reference=${encodeURIComponent(options.pending.reference)}`,
      );
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          data.error?.message || "Payment status is unavailable.",
        );
      if (r.status === 202)
        setMessage(
          "Payment is still processing. Check again shortly. If it stays pending, contact the garage before starting another payment.",
        );
      else {
        setMessage(
          `Payment ${String(data.status || "confirmed").toLowerCase()}.`,
        );
        setOptions((current) =>
          current ? { ...current, pending: null } : current,
        );
        onPaid();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not check payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 190 }}>
      {options?.test && <small>Sandbox — test payments only</small>}
      {options?.pending ? (
        <>
          {options.pending.checkout_url && (
            <a className="btn btn-primary" href={options.pending.checkout_url}>
              Resume checkout
            </a>
          )}
          {options.pending.provider === "STRIPE" &&
            !options.pending.checkout_url && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => void pay("stripe")}
              >
                Resume checkout
              </button>
            )}
          <button className="btn" disabled={busy} onClick={() => void check()}>
            Check payment status
          </button>
        </>
      ) : (
        <>
          {options?.stripe && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void pay("stripe")}
            >
              Pay with Stripe
            </button>
          )}
          {options?.mpesa && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pay("mpesa");
              }}
              style={{ display: "grid", gap: 8 }}
            >
              <label htmlFor={`phone-${invoiceId}`}>M-Pesa sandbox phone</label>
              <input
                id={`phone-${invoiceId}`}
                type="tel"
                autoComplete="tel"
                placeholder="2547…"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button className="btn btn-primary" disabled={busy}>
                Pay with M-Pesa
              </button>
            </form>
          )}
          {options?.paystack && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void pay("paystack")}
            >
              Pay with Paystack
            </button>
          )}
          {options &&
            !options.stripe &&
            !options.mpesa &&
            !options.paystack && (
              <small>Online payments are not configured for this garage.</small>
            )}
        </>
      )}
      {busy && <small role="status">Please wait…</small>}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
