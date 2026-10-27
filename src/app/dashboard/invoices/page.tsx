"use client";

import { useEffect, useState } from "react";
type Invoice = { id: string; number: string; status: string; totalAmount: string; amountPaid: string; currency: string; createdAt: string; customerId: string; shop: { name: string } };

async function fetchInvoiceData() {
  const [invoicesResponse, meResponse] = await Promise.all([fetch("/api/invoices"), fetch("/api/me")]);
  return {
    invoices: invoicesResponse.ok ? (await invoicesResponse.json()).invoices as Invoice[] : [],
    userId: meResponse.ok ? (await meResponse.json()).user.id as string : null,
  };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await fetchInvoiceData();
    setInvoices(data.invoices);
    setUserId(data.userId);
  }

  useEffect(() => {
    void fetchInvoiceData().then((data) => { setInvoices(data.invoices); setUserId(data.userId); });
    const reference = new URLSearchParams(window.location.search).get("paystack_reference");
    if (reference?.startsWith("PAY-")) {
      void fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`).then(async (response) => {
        setMessage(response.ok ? "Payment confirmed." : response.status === 202 ? "Payment is still processing." : "Payment could not be confirmed yet.");
        if (response.ok) await load();
      });
    }
  }, []);

  async function pay(invoiceId: string) {
    setBusyId(invoiceId); setMessage("");
    try {
      const response = await fetch("/api/payments/paystack", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Checkout could not be started");
      window.location.assign(result.checkoutUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Checkout could not be started"); setBusyId(null); }
  }

  return <div className="app-content">
    <div className="welcome"><div><h2>Invoices & payments</h2><p>Real-time billing records and reconciled payments.</p></div></div>
    {message && <p role="status" style={{ padding: "12px 0" }}>{message}</p>}
    <section className="panel"><div className="panel-head"><h3>Recent invoices</h3><span>{invoices?.length ?? 0} invoices</span></div>
      {invoices === null ? <p style={{ padding: 24, color: "var(--muted)" }}>Loading invoices…</p> : invoices.length ?
        <table className="table"><thead><tr><th>Invoice</th><th>Garage</th><th>Total</th><th>Status</th><th>Payment</th></tr></thead><tbody>
          {invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.number}</strong><br /><span style={{ color: "var(--muted)" }}>{new Date(invoice.createdAt).toLocaleDateString("en-KE")}</span></td><td>{invoice.shop.name}</td><td>{invoice.currency} {Number(invoice.totalAmount).toLocaleString()}<br /><span style={{ color: "var(--muted)" }}>Paid {Number(invoice.amountPaid).toLocaleString()}</span></td><td><span className="pill">{invoice.status.replaceAll("_", " ")}</span></td><td>{invoice.customerId === userId && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) ? <button className="btn btn-primary" disabled={busyId === invoice.id} onClick={() => void pay(invoice.id)}>{busyId === invoice.id ? "Opening…" : "Pay with Paystack"}</button> : null}</td></tr>)}
        </tbody></table> : <p style={{ padding: 24, color: "var(--muted)" }}>No invoices are currently visible.</p>}
    </section>
  </div>;
}
