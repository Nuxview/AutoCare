"use client";

import { useEffect, useState } from "react";
import { InvoicePayment } from "@/components/invoice-payment";
import { ApprovedInvoices } from "@/components/approved-invoices";

type Invoice = {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  amountPaid: string;
  currency: string;
  createdAt: string;
  customerId: string;
  shop: { name: string };
};

async function fetchInvoiceData() {
  const [invoicesResponse, meResponse] = await Promise.all([
    fetch("/api/invoices"),
    fetch("/api/me"),
  ]);
  return {
    invoices: invoicesResponse.ok
      ? ((await invoicesResponse.json()).invoices as Invoice[])
      : [],
    userId: meResponse.ok
      ? ((await meResponse.json()).user.id as string)
      : null,
  };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await fetchInvoiceData();
    setInvoices(data.invoices);
    setUserId(data.userId);
  }

  useEffect(() => {
    void fetchInvoiceData().then((data) => {
      setInvoices(data.invoices);
      setUserId(data.userId);
    });
    const reference = new URLSearchParams(window.location.search).get(
      "paystack_reference",
    );
    if (reference?.startsWith("PAY-")) {
      void fetch(
        `/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`,
      ).then(async (response) => {
        setMessage(
          response.status === 202
            ? "Payment is still processing."
            : response.ok
              ? "Payment confirmed."
              : "Payment could not be confirmed yet.",
        );
        if (response.ok) await load();
      });
    }
    const stripeReference = new URLSearchParams(window.location.search).get(
      "stripe_reference",
    );
    if (stripeReference?.startsWith("PAY-")) {
      void fetch(
        `/api/payments/status?reference=${encodeURIComponent(stripeReference)}`,
      )
        .then(async (response) => {
          const result = await response.json();
          setMessage(
            response.status === 202
              ? "Payment is still processing. Use Check payment status below."
              : response.ok
                ? `Sandbox payment: ${result.status.toLowerCase()}.`
                : "Payment could not be confirmed yet.",
          );
          if (response.ok) await load();
        })
        .catch(() => setMessage("Payment could not be confirmed yet."));
    }
  }, []);

  return (
    <div className="app-content">
      <div className="welcome">
        <div>
          <h2>Invoices & payments</h2>
          <p>Real-time billing records and reconciled payments.</p>
        </div>
      </div>
      {message && (
        <p role="status" style={{ padding: "12px 0" }}>
          {message}
        </p>
      )}
      <ApprovedInvoices onIssued={() => void load()} />
      <section className="panel">
        <div className="panel-head">
          <h3>Recent invoices</h3>
          <span>{invoices?.length ?? 0} invoices</span>
        </div>
        {invoices === null ? (
          <p style={{ padding: 24, color: "var(--muted)" }}>
            Loading invoices…
          </p>
        ) : invoices.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Garage</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.number}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      {new Date(invoice.createdAt).toLocaleDateString("en-KE")}
                    </span>
                  </td>
                  <td>{invoice.shop.name}</td>
                  <td>
                    {invoice.currency}{" "}
                    {Number(invoice.totalAmount).toLocaleString()}
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      Paid {Number(invoice.amountPaid).toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <span className="pill">
                      {invoice.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    {invoice.customerId === userId &&
                    ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(
                      invoice.status,
                    ) ? (
                      <InvoicePayment
                        invoiceId={invoice.id}
                        onPaid={() => void load()}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: 24, color: "var(--muted)" }}>
            No invoices are currently visible.
          </p>
        )}
      </section>
    </div>
  );
}
