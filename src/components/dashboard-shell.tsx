"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CarFront,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  ReceiptText,
  Settings2,
  Wrench,
} from "lucide-react";
import { Brand } from "./brand";
import { canAccessWorkspacePage, roleLabel } from "@/lib/permissions";
import { WorkspaceContext } from "./workspace-context";

const customerLinks = [
  { href: "/dashboard", label: "My overview", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Garage visits", icon: CalendarDays },
  { href: "/dashboard/vehicles", label: "My vehicles", icon: CarFront },
  { href: "/dashboard/history", label: "Service history", icon: CarFront },
  { href: "/dashboard/jobs", label: "Repairs", icon: Wrench },
  { href: "/dashboard/invoices", label: "Invoices", icon: ReceiptText },
];
const garageLinks = [
  { href: "/dashboard", label: "Workshop", icon: LayoutDashboard },
  {
    href: "/dashboard/bookings",
    label: "Booking requests",
    icon: CalendarDays,
  },
  { href: "/dashboard/jobs", label: "Repair jobs", icon: Wrench },
  {
    href: "/dashboard/schedule",
    label: "Workshop calendar",
    icon: CalendarDays,
  },
  {
    href: "/dashboard/history",
    label: "Shared service history",
    icon: CarFront,
  },
  { href: "/dashboard/staff", label: "Staff & invitations", icon: Settings2 },
  { href: "/dashboard/inventory", label: "Stock room", icon: PackageSearch },
  { href: "/dashboard/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  {
    href: "/dashboard/garage-settings",
    label: "Garage settings",
    icon: Settings2,
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [garage, setGarage] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((v) => v + 1);
    window.addEventListener("autocare-workspace-changed", changed);
    return () =>
      window.removeEventListener("autocare-workspace-changed", changed);
  }, []);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [hasInvitation, setHasInvitation] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return;
        }
        if (!r.ok) throw new Error("Could not load workspace");
        const data = await r.json();
        if (active) {
          setGarage(data.memberships.length > 0);
          setRole(data.memberships[0]?.role ?? null);
          setUserId(data.user.id);
          setHasInvitation(data.hasPendingInvitation === true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [router, revision]);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const links =
    garage === null
      ? []
      : garage
        ? garageLinks.filter((link) =>
            canAccessWorkspacePage(true, role, link.href.split("/")[2] ?? ""),
          )
        : customerLinks;
  const section = path.split("/")[2];
  const permitted = canAccessWorkspacePage(
    garage === true,
    role,
    section ?? "",
    hasInvitation,
  );
  return (
    <div
      className={`app-layout ${garage ? "garage-layout" : "customer-layout"}`}
    >
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-brand">
          <Brand light />
        </Link>
        <div className="sidebar-kicker">
          {garage ? roleLabel(role ?? "") : "YOUR AUTOCARE"}
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`side-link${path === href ? " active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-profile">
          <button onClick={logout} className="side-link sign-out">
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">
              {garage ? "AUTOCARE FOR GARAGES" : "AUTOCARE FOR DRIVERS"}
            </span>
            <h1>{garage ? "Workshop" : "My garage"}</h1>
          </div>
          <div className="topbar-right">
            <span className="topbar-date">
              {new Date().toLocaleDateString("en-KE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <div className="topbar-avatar">{garage ? "G" : "C"}</div>
          </div>
        </header>
        {error ? (
          <p role="alert">{error}</p>
        ) : garage === null ? (
          <div className="skeleton">Loading workspace…</div>
        ) : !permitted ? (
          <div className="app-content">
            This page is not available for your role.
          </div>
        ) : (
          <WorkspaceContext.Provider value={{ role, userId, garage }}>
            {!garage && hasInvitation && section !== "invitations" && (
              <div className="app-content" role="status">
                You have an invitation to join a garage.{" "}
                <Link href="/dashboard/invitations">Review invitation</Link>
              </div>
            )}
            {children}
          </WorkspaceContext.Provider>
        )}
      </main>
    </div>
  );
}
