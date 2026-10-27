"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarDays, CarFront, CreditCard, LayoutDashboard, LogOut, Menu, ReceiptText, Settings, Wrench } from "lucide-react";
import { Brand } from "./brand";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/dashboard/vehicles", label: "Vehicles", icon: CarFront },
  { href: "/dashboard/jobs", label: "Jobs", icon: Wrench },
  { href: "/dashboard/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  return <div className="app-layout">
    <aside className="sidebar"><Link href="/dashboard"><Brand light /></Link><nav className="side-nav" aria-label="Workspace navigation">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`side-link${path === href ? " active" : ""}`}><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="side-profile"><button onClick={logout} className="side-link" style={{ border: 0, background: "transparent", cursor: "pointer", width: "100%" }}><LogOut size={17} /><span>Sign out</span></button></div></aside>
    <main className="app-main"><header className="topbar"><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Menu size={19} /><h1>Workspace</h1></div><div style={{ display: "flex", gap: 9 }}><button className="btn btn-secondary" aria-label="Notifications" style={{ padding: 9 }}><Bell size={17} /></button><button className="btn btn-secondary" aria-label="Settings" style={{ padding: 9 }}><Settings size={17} /></button></div></header>{children}</main>
  </div>;
}
