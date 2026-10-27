"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

type Job = { id: string; reference: string; status: string; updatedAt: string; shop: { name: string }; vehicle: { registration: string; make: string; model: string }; customer: { firstName: string; lastName: string } };
export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => { fetch("/api/jobs").then(async (r) => setJobs(r.ok ? (await r.json()).jobs : [])); }, []);
  return <div className="app-content"><div className="welcome"><div><h2>Repair jobs</h2><p>Live repair progress from check-in through quality control.</p></div></div><section className="panel"><div className="panel-head"><h3>Workshop queue</h3><span>{jobs?.length ?? 0} jobs</span></div>{jobs === null ? <p style={{ padding: 24, color: "var(--muted)" }}>Loading jobs…</p> : jobs.length ? <table className="table"><thead><tr><th>Reference</th><th>Vehicle</th><th>Customer</th><th>Status</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.reference}</strong><br /><span style={{ color: "var(--muted)" }}>{job.shop.name}</span></td><td>{job.vehicle.registration}<br /><span style={{ color: "var(--muted)" }}>{job.vehicle.make} {job.vehicle.model}</span></td><td>{job.customer.firstName} {job.customer.lastName}</td><td><span className="pill"><Wrench size={10} style={{ marginRight: 4 }} />{job.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table> : <p style={{ padding: 24, color: "var(--muted)" }}>No repair jobs are visible in your current scope.</p>}</section></div>;
}
