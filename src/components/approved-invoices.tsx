"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useWorkspace } from "./workspace-context";
type ReadyJob = {
  id: string;
  reference: string;
  estimate_amount: number;
  vehicle: { registration: string };
};
export function ApprovedInvoices({ onIssued }: { onIssued: () => void }) {
  const { garage } = useWorkspace();
  const [jobs, setJobs] = useState<ReadyJob[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!garage) return;
    let active = true;
    api<{ jobs: ReadyJob[] }>("/api/jobs/invoice")
      .then((d) => {
        if (active) setJobs(d.jobs);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [garage]);
  if (!garage) return null;
  async function issue(id: string) {
    setBusy(true);
    try {
      await api("/api/jobs/invoice", { jobId: id });
      setJobs((current) => current.filter((j) => j.id !== id));
      onIssued();
      setMessage("Invoice issued from the approved quote.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not issue invoice");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workflow-card workflow-stack">
      <h3>Approved repairs awaiting invoices</h3>
      {message && <p role="status">{message}</p>}
      {jobs.map((j) => (
        <div className="section-inline-head" key={j.id}>
          <span>
            {j.reference} · {j.vehicle.registration} · KES {j.estimate_amount}
          </span>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => issue(j.id)}
          >
            Issue invoice
          </button>
        </div>
      ))}
      {!jobs.length && <p>No approved repairs awaiting invoicing.</p>}
    </section>
  );
}
