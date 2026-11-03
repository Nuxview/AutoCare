"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { roleLabel } from "@/lib/permissions";
import { useWorkspace } from "@/components/workspace-context";
type StaffData = {
  members: Array<{
    id: string;
    role: string;
    is_active: boolean;
    profile: { first_name: string; last_name: string; email: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }>;
  shops: Array<{ id: string; name: string }>;
};
export default function StaffPage() {
  const { role } = useWorkspace();
  const [data, setData] = useState<StaffData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<StaffData>("/api/staff"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load staff");
    }
  }, []);
  useEffect(() => {
    let active = true;
    api<StaffData>("/api/staff")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(body: unknown, method = "POST") {
    setBusy(true);
    try {
      await api("/api/staff", body, method);
      await load();
      setMessage(
        "Saved. Invitations appear when the invited person signs in with their verified email.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-content workflow-stack">
      <h2>Staff & invitations</h2>
      <p>
        Invite staff into your garage workspace. Each person uses their own
        verified account. Share the sign-in address with them; no email is sent
        automatically.
      </p>
      {message && <p role="status">{message}</p>}
      <form
        className="workflow-card form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit({
            email: f.get("email"),
            role: f.get("role"),
            shopId: f.get("shopId") || null,
          });
        }}
      >
        <label className="field">
          <span>Email</span>
          <input className="input" required type="email" name="email" />
        </label>
        <label className="field">
          <span>Role</span>
          <select className="input" name="role" defaultValue="MECHANIC">
            {[
              ...(role === "FRANCHISE_OWNER" ? ["FRANCHISE_ADMIN"] : []),
              "SHOP_MANAGER",
              "SERVICE_ADVISOR",
              "MECHANIC",
              "INVENTORY_CLERK",
              "ACCOUNTANT",
            ].map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Branch</span>
          <select className="input" name="shopId">
            <option value="">All branches (administrators only)</option>
            {data?.shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy || !data}>
          Create invitation
        </button>
      </form>
      <h3>Team members</h3>
      {data?.members.map((m) => (
        <article className="workflow-card section-inline-head" key={m.id}>
          <div>
            <strong>
              {m.profile.first_name} {m.profile.last_name}
            </strong>
            <p>
              {m.profile.email} · {roleLabel(m.role)} ·{" "}
              {m.is_active ? "Active" : "Inactive"}
            </p>
          </div>
          {m.role !== "FRANCHISE_OWNER" && m.is_active && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => submit({ id: m.id, kind: "member" }, "PATCH")}
            >
              Deactivate access
            </button>
          )}
        </article>
      ))}
      <h3>Invitations</h3>
      {data?.invitations.map((i) => (
        <article className="workflow-card" key={i.id}>
          <strong>{i.email}</strong>
          <p>
            {roleLabel(i.role)} ·{" "}
            {i.accepted_at
              ? "Accepted"
              : i.revoked_at
                ? "Revoked"
                : new Date(i.expires_at) < new Date()
                  ? "Expired"
                  : "Pending"}
          </p>
          {!i.accepted_at && !i.revoked_at && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => submit({ id: i.id, kind: "invitation" }, "PATCH")}
            >
              Revoke invitation
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
