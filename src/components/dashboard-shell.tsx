"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CarFront, CreditCard, LayoutDashboard, LogOut, PackageSearch, ReceiptText, Settings2, Wrench } from "lucide-react";
import { Brand } from "./brand";

const customerLinks = [
  { href: "/dashboard", label: "My overview", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Garage visits", icon: CalendarDays },
  { href: "/dashboard/vehicles", label: "My vehicles", icon: CarFront },
  { href: "/dashboard/jobs", label: "Repairs", icon: Wrench },
  { href: "/dashboard/invoices", label: "Invoices", icon: ReceiptText },
];
const garageLinks = [
  { href: "/dashboard", label: "Workshop", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Booking requests", icon: CalendarDays },
  { href: "/dashboard/jobs", label: "Repair jobs", icon: Wrench },
  { href: "/dashboard/inventory", label: "Stock room", icon: PackageSearch },
  { href: "/dashboard/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/garage-settings", label: "Garage settings", icon: Settings2 },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter(); const [garage, setGarage] = useState<boolean | null>(null);
  useEffect(() => { let active = true; fetch("/api/me").then(async r => { if (r.status === 401) { router.replace("/login"); return; } if (r.ok && active) setGarage((await r.json()).memberships.length > 0); }).catch(() => {}); return () => { active = false; }; }, [router]);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  const links = garage === null ? [] : garage ? garageLinks : customerLinks;
  return <div className={`app-layout ${garage ? "garage-layout" : "customer-layout"}`}>
    <aside className="sidebar"><Link href="/dashboard" className="sidebar-brand"><Brand light /></Link><div className="sidebar-kicker">{garage ? "GARAGE WORKSPACE" : "YOUR AUTOCARE"}</div><nav className="side-nav" aria-label="Workspace navigation">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`side-link${path === href ? " active" : ""}`}><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="side-profile"><button onClick={logout} className="side-link sign-out"><LogOut size={17} /><span>Sign out</span></button></div></aside>
    <main className="app-main"><header className="topbar"><div><span className="topbar-kicker">{garage ? "AUTOCARE FOR GARAGES" : "AUTOCARE FOR DRIVERS"}</span><h1>{garage ? "Workshop" : "My garage"}</h1></div><div className="topbar-right"><span className="topbar-date">{new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}</span><div className="topbar-avatar">{garage ? "G" : "C"}</div></div></header>{children}</main>
  </div>;
}
