"use client";

import { useEffect, useState } from "react";
type Invoice = { id: string; number: string; status: string; totalAmount: string; amountPaid: string; currency: string; createdAt: string; shop: { name: string }; customer: { firstName: string; lastName: string } };
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  useEffect(() => { fetch("/api/invoices").then(async (r) => setInvoices(r.ok ? (await r.json()).invoices : [])); }, []);
  return <div className="app-content"><div className="welcome"><div><h2>Invoices & payments</h2><p>Real-time billing records and reconciled payments.</p></div></div><section className="panel"><div className="panel-head"><h3>Recent invoices</h3><span>{invoices?.length ?? 0} invoices</span></div>{invoices === null ? <p style={{ padding: 24, color: "var(--muted)" }}>Loading invoices…</p> : invoices.length ? <table className="table"><thead><tr><th>Invoice</th><th>Garage</th><th>Total</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.number}</strong><br /><span style={{ color: "var(--muted)" }}>{new Date(invoice.createdAt).toLocaleDateString("en-KE")}</span></td><td>{invoice.shop.name}</td><td>{invoice.currency} {Number(invoice.totalAmount).toLocaleString()}<br /><span style={{ color: "var(--muted)" }}>Paid {Number(invoice.amountPaid).toLocaleString()}</span></td><td><span className="pill">{invoice.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table> : <p style={{ padding: 24, color: "var(--muted)" }}>No invoices are currently visible.</p>}</section></div>;
}
