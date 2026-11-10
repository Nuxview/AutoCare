"use client";

import { request } from "@/lib/client-cache";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock3, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { RepairPhotoGallery } from "@/components/repair-photo-gallery";

import { ServiceMileage } from "@/components/service-mileage";
import { RepairWorkflow } from "@/components/repair-workflow";
import { useWorkspace } from "@/components/workspace-context";
import { can } from "@/lib/permissions";
import { api } from "@/lib/client-api";

type Task = {
  id: string;
  title: string;
  note?: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  position: number;
};
type Job = {
  id: string;
  vehicleId: string;
  reference: string;
  bookingId: string | null;
  status: string;
  estimateAmount: number | null;
  estimateNote?: string | null;
  shop: { name: string };
  vehicle: { registration: string; make: string; model: string };
  customer: { firstName: string; lastName: string };
  tasks: Task[];
  invoice?: { id: string; number: string; status: string } | null;
};
const label = (s: string) => s.replaceAll("_", " ").toLowerCase();

export default function JobsPage() {
  const { role, garage } = useWorkspace();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  async function load() {
    try {
      const data = await api<{ jobs: Job[] }>("/api/jobs");
      setJobs(data.jobs);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load repairs");
    }
  }
  useEffect(() => {
    let active = true;
    api<{ jobs: Job[] }>("/api/jobs")
      .then((data) => {
        if (active) setJobs(data.jobs);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setJobs([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function addTask(e: React.FormEvent, jobId: string) {
    e.preventDefault();
    const r = await request("/api/jobs/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, title }),
    });
    const body = await r.json();
    if (!r.ok) return toast.error(body.error?.message ?? "Could not add step");
    setTitle("");
    toast.success("Repair step added");
    load();
  }
  async function setTask(taskId: string, status: Task["status"]) {
    const r = await request("/api/jobs/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, status }),
    });
    const body = await r.json();
    if (!r.ok)
      return toast.error(body.error?.message ?? "Could not update step");
    toast.success("Progress updated");
    load();
  }
  async function issueInvoice(jobId: string) {
    const r = await request("/api/jobs/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const body = await r.json();
    if (!r.ok)
      return toast.error(body.error?.message ?? "Could not issue invoice");
    toast.success("Invoice issued to client");
    load();
  }
  async function setJobStatus(
    jobId: string,
    status: "IN_PROGRESS" | "READY" | "COMPLETED",
  ) {
    const r = await request("/api/jobs/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, status }),
    });
    const body = await r.json();
    if (!r.ok)
      return toast.error(body.error?.message ?? "Could not update job");
    toast.success(
      status === "READY"
        ? "Vehicle ready for collection"
        : "Repair status updated",
    );
    load();
  }
  return (
    <div className="app-content portal-detail">
      {error && <p role="alert">{error}</p>}
      <div className="detail-heading">
        <div>
          <span className="eyebrow">
            {garage ? "WORKSHOP / REPAIRS" : "YOUR VEHICLE / REPAIRS"}
          </span>
          <h2>{garage ? "Repair jobs" : "Repair progress"}</h2>
          <p>
            {garage
              ? "Build a clear repair plan and keep customers informed at every step."
              : "See exactly what is finished, in progress and still ahead."}
          </p>
        </div>
        <span className="count-badge">{jobs?.length ?? 0} jobs</span>
      </div>
      <div className="job-card-list">
        {jobs?.map((job) => {
          const steps = [...(job.tasks ?? [])].sort(
            (a, b) => a.position - b.position,
          );
          const done = steps.filter((t) => t.status === "COMPLETED").length;
          const open = selected === job.id;
          return (
            <article className="premium-panel repair-job-card" key={job.id}>
              <div className="repair-card-head">
                <div className="journey-icon">
                  <Wrench size={22} />
                </div>
                <div>
                  <span className="eyebrow">
                    {job.reference} · {job.shop.name}
                  </span>
                  <h3>
                    {job.vehicle.make} {job.vehicle.model}{" "}
                    <small>{job.vehicle.registration}</small>
                  </h3>
                  <span>
                    {garage
                      ? `${job.customer.firstName} ${job.customer.lastName}`
                      : "Your vehicle"}
                  </span>
                </div>
                <span className="status-chip">{label(job.status)}</span>
              </div>
              <div className="repair-summary">
                <div>
                  <strong>
                    {steps.length ? `${done}/${steps.length}` : "—"}
                  </strong>
                  <span>steps complete</span>
                </div>
                <div>
                  <strong>
                    {job.estimateAmount !== null
                      ? `KES ${Number(job.estimateAmount).toLocaleString()}`
                      : "Pending"}
                  </strong>
                  <span>garage estimate</span>
                </div>
                <div className="repair-bar">
                  <span
                    style={{
                      width: `${steps.length ? (done / steps.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <button
                className="text-action"
                onClick={() => {
                  setSelected(open ? null : job.id);
                }}
              >
                {open ? "Close details" : "View repair plan"}
              </button>
              {open && (
                <div className="repair-expanded">
                  <Link href={`/dashboard/history?vehicleId=${job.vehicleId}`}>
                    View service history{" "}
                    {garage ? "(customer sharing required)" : ""}
                  </Link>
                  <div className="repair-timeline">
                    <div className="section-inline-head">
                      <div>
                        <Wrench size={18} />
                        <strong>Repair steps</strong>
                      </div>
                      <span>{done} completed</span>
                    </div>
                    {steps.map((task) => (
                      <div className="timeline-row" key={task.id}>
                        <div
                          className={`timeline-marker ${task.status.toLowerCase()}`}
                        >
                          {task.status === "COMPLETED" ? (
                            <CheckCircle2 size={18} />
                          ) : task.status === "IN_PROGRESS" ? (
                            <Clock3 size={18} />
                          ) : (
                            <Circle size={18} />
                          )}
                        </div>
                        <div>
                          <strong>{task.title}</strong>
                          {task.note && <p>{task.note}</p>}
                          <small>{label(task.status)}</small>
                        </div>
                        {garage && (
                          <select
                            aria-label={`Status for ${task.title}`}
                            className="input task-select"
                            value={task.status}
                            onChange={(e) =>
                              setTask(task.id, e.target.value as Task["status"])
                            }
                          >
                            <option value="PENDING">Pending</option>
                            <option value="IN_PROGRESS">In progress</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                        )}
                      </div>
                    ))}
                    {!steps.length && (
                      <p className="muted-copy">
                        The garage has not added repair steps yet.
                      </p>
                    )}
                    {garage && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => addTask(e, job.id)}
                      >
                        <input
                          className="input"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          minLength={2}
                          maxLength={120}
                          placeholder="e.g. Install windscreen"
                          required
                        />
                        <button className="btn btn-secondary">
                          <Plus size={16} /> Add step
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="repair-side">
                    <div className="estimate-box">
                      <span className="eyebrow">CURRENT QUOTE</span>
                      <h4>Repair estimate</h4>
                      <strong>
                        {job.estimateAmount !== null
                          ? `KES ${Number(job.estimateAmount).toLocaleString()}`
                          : "Awaiting quote"}
                      </strong>
                      <p>
                        {job.estimateNote || "Review the itemized quote below."}
                      </p>
                      {job.invoice ? (
                        <Link href="/dashboard/invoices">
                          Invoice {job.invoice.number}
                        </Link>
                      ) : (
                        garage &&
                        can(role, "invoices") && (
                          <button
                            className="btn btn-primary"
                            onClick={() => issueInvoice(job.id)}
                          >
                            Issue approved invoice
                          </button>
                        )
                      )}
                    </div>
                    {garage && (
                      <div className="job-status-actions">
                        <strong>Vehicle handover</strong>
                        <p>Mark ready after every step is completed.</p>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setJobStatus(job.id, "READY")}
                        >
                          Ready for collection
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setJobStatus(job.id, "COMPLETED")}
                        >
                          Mark collected & complete
                        </button>
                      </div>
                    )}
                  </div>
                  {garage &&
                    !["COMPLETED", "CANCELLED"].includes(job.status) && (
                      <ServiceMileage jobId={job.id} />
                    )}
                  <RepairWorkflow
                    jobId={job.id}
                    closed={
                      !!job.invoice ||
                      ["COMPLETED", "CANCELLED"].includes(job.status)
                    }
                    onChange={() => void load()}
                  />
                  {job.bookingId && (
                    <RepairPhotoGallery bookingId={job.bookingId} />
                  )}
                </div>
              )}
            </article>
          );
        })}
        {jobs?.length === 0 && (
          <div className="empty-premium">
            <Wrench size={28} />
            <strong>No repair jobs yet</strong>
            <p>
              {garage
                ? "Approve a booking and check in the car to start a repair."
                : "Your garage will create a repair plan after check-in."}
            </p>
          </div>
        )}
        {jobs === null && <div className="skeleton">Loading repairs…</div>}
      </div>
    </div>
  );
}
