"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CarFront, ClipboardPlus, PackageSearch, ReceiptText, WalletCards, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Dashboard = {
  kind: "customer" | "garage";
  user: { firstName: string; lastName: string };
  metrics: Record<string, number>;
  recentBookings?: Array<{ id: string; reference: string; status: string; scheduledAt: string; shop: { name: string }; vehicle: { registration: string }; service?: { name: string } | null }>;
  recentJobs?: Array<{ id: string; reference: string; status: string; updatedAt: string; vehicle: { registration: string; make: string; model: string }; customer: { firstName: string; lastName: string } }>;
  membership?: { franchise: { name: string }; shop?: { name: string } | null };
};

export default function DashboardPage() {
  const router = useRouter(); const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { fetch("/api/dashboard").then(async (r) => { if (r.status === 401) { router.replace("/login"); return; } setData(await r.json()); }); }, [router]);
  if (!data) return <div className="skeleton">Loading your workspace…</div>;
  const customer = data.kind === "customer";
  const metrics: Array<[string, string | number, LucideIcon, string]> = customer ? [
    ["My vehicles", data.metrics.vehicles, CarFront, "Saved to your profile"], ["Active bookings", data.metrics.activeBookings, CalendarDays, "Across all garages"], ["Invoices due", data.metrics.unpaidInvoices, ReceiptText, "Ready for payment"], ["Service history", data.recentBookings?.filter((b) => b.status === "COMPLETED").length ?? 0, Wrench, "Completed services"],
  ] : [
    ["Open jobs", data.metrics.openJobs, Wrench, "Across your scope"], ["Today’s bookings", data.metrics.todayBookings, CalendarDays, "Scheduled arrivals"], ["Low stock items", data.metrics.lowStock, PackageSearch, "Need attention"], ["Receivables", `KES ${Number(data.metrics.receivables).toLocaleString()}`, WalletCards, "Outstanding invoices"],
  ];
  return <div className="app-content">
    <div className="welcome"><div><h2>{customer ? `Welcome back, ${data.user.firstName}` : data.membership?.franchise.name}</h2><p>{customer ? "Here’s what’s happening with your cars." : "A live view of your workshop operations."}</p></div><Link className="btn btn-primary" href={customer ? "/dashboard/bookings" : "/dashboard/jobs"}><ClipboardPlus size={16} /> {customer ? "Book a service" : "View workshop"}</Link></div>
    <section className="metric-grid" aria-label="Key metrics">{metrics.map(([label, value, Icon, note]) => <article className="metric-card" key={String(label)}><div className="metric-head"><span>{String(label)}</span><Icon size={17} /></div><strong>{String(value)}</strong><small>{String(note)}</small></article>)}</section>
    <div className="panel-grid"><section className="panel"><div className="panel-head"><h3>{customer ? "Recent bookings" : "Recent jobs"}</h3><Link href={customer ? "/dashboard/bookings" : "/dashboard/jobs"} style={{ color: "var(--green)", fontSize: 12, fontWeight: 800 }}>View all</Link></div><table className="table"><thead><tr><th>Reference</th><th>Vehicle</th><th>{customer ? "Garage" : "Customer"}</th><th>Status</th></tr></thead><tbody>{customer ? data.recentBookings?.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong><br /><span style={{ color: "var(--muted)" }}>{new Date(item.scheduledAt).toLocaleDateString("en-KE")}</span></td><td>{item.vehicle.registration}</td><td>{item.shop.name}</td><td><span className="pill">{item.status.replaceAll("_", " ")}</span></td></tr>) : data.recentJobs?.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong><br /><span style={{ color: "var(--muted)" }}>{new Date(item.updatedAt).toLocaleDateString("en-KE")}</span></td><td>{item.vehicle.registration}<br /><span style={{ color: "var(--muted)" }}>{item.vehicle.make} {item.vehicle.model}</span></td><td>{item.customer.firstName} {item.customer.lastName}</td><td><span className="pill">{item.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table>{((customer && !data.recentBookings?.length) || (!customer && !data.recentJobs?.length)) && <p style={{ padding: 22, color: "var(--muted)", fontSize: 13 }}>Nothing here yet. Your latest activity will appear here.</p>}</section>
      <aside className="panel"><div className="panel-head"><h3>Quick actions</h3></div><div className="quick-list"><Link className="quick-item" href="/dashboard/bookings"><span className="quick-icon"><CalendarDays size={17} /></span>{customer ? "Book a garage visit" : "Review bookings"}</Link><Link className="quick-item" href="/dashboard/vehicles"><span className="quick-icon"><CarFront size={17} /></span>{customer ? "Add a vehicle" : "Find a vehicle"}</Link><Link className="quick-item" href="/dashboard/invoices"><span className="quick-icon"><ReceiptText size={17} /></span>{customer ? "View invoices" : "Manage invoices"}</Link></div></aside>
    </div>
  </div>;
}
