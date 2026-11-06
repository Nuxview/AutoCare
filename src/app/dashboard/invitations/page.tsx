"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { roleLabel } from "@/lib/permissions";
type Invitation = {
  id: string;
  role: string;
  garage: { name: string };
  shop: { name: string } | null;
};
export default function InvitationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Invitation[]>([]);
  const [message, setMessage] = useState("Loading invitations…");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ invitations: Invitation[] }>("/api/invitations")
      .then((d) => {
        if (active) {
          setItems(d.invitations);
          setMessage(
            d.invitations.length
              ? ""
              : "No pending invitations for your email address.",
          );
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function accept(id: string) {
    setBusy(true);
    try {
      await api("/api/invitations", { id });
      window.dispatchEvent(new Event("autocare-workspace-changed"));
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not accept invitation",
      );
      setBusy(false);
    }
  }
  return (
    <div className="app-content workflow-stack">
      <h2>Join a garage</h2>
      <p>
        Accepting joins the garage workspace with the permissions shown. Your
        email must be verified.
      </p>
      {message && <p role="status">{message}</p>}
      {items.map((i) => (
        <article className="workflow-card" key={i.id}>
          <h3>{i.garage.name}</h3>
          <p>
            {i.shop?.name ?? "All branches"} · {roleLabel(i.role)}
          </p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => accept(i.id)}
          >
            Accept invitation
          </button>
        </article>
      ))}
    </div>
  );
}
