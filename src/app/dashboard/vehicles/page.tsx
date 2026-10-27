"use client";

import { useEffect, useState } from "react";
import { CarFront, Plus } from "lucide-react";
import { toast } from "sonner";

type Vehicle = { id: string; registration: string; make: string; model: string; year: number; color?: string; mileageKm?: number };
const empty = { registration: "", make: "", model: "", year: new Date().getFullYear(), color: "", mileageKm: 0 };

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]); const [form, setForm] = useState(empty); const [saving, setSaving] = useState(false);
  async function load() { const r = await fetch("/api/vehicles"); if (r.ok) setVehicles((await r.json()).vehicles); }
  useEffect(() => {
    let active = true;
    fetch("/api/vehicles").then(async (response) => {
      if (active && response.ok) setVehicles((await response.json()).vehicles);
    });
    return () => { active = false; };
  }, []);
  async function submit(e: React.FormEvent) { e.preventDefault(); setSaving(true); const r = await fetch("/api/vehicles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, mileageKm: Number(form.mileageKm), year: Number(form.year) }) }); const body = await r.json(); setSaving(false); if (!r.ok) return toast.error(body.error?.message ?? "Could not save vehicle"); toast.success("Vehicle added"); setForm(empty); load(); }
  return <div className="app-content"><div className="welcome"><div><h2>Vehicles</h2><p>Keep the cars you own and their service history in one place.</p></div></div><div className="panel-grid"><section className="panel"><div className="panel-head"><h3>Your garage</h3><span>{vehicles.length} vehicles</span></div><div style={{ padding: 14, display: "grid", gap: 10 }}>{vehicles.map((v) => <article key={v.id} className="job-row" style={{ color: "var(--ink)", borderColor: "var(--line)", background: "white" }}><span className="car-icon"><CarFront size={19} /></span><div><strong>{v.registration}</strong><span style={{ color: "var(--muted)" }}>{v.year} {v.make} {v.model}</span></div><span style={{ color: "var(--muted)", fontSize: 12 }}>{v.mileageKm?.toLocaleString() ?? "—"} km</span></article>)}{!vehicles.length && <p style={{ color: "var(--muted)", padding: 14 }}>Add your first vehicle to book a service.</p>}</div></section><section className="panel"><div className="panel-head"><h3><Plus size={16} style={{ display: "inline", marginRight: 7 }} />Add vehicle</h3></div><form onSubmit={submit} className="form-grid" style={{ padding: 20 }}><Field label="Registration"><input required className="input" value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value.toUpperCase() })} placeholder="KDA 123A" /></Field><Field label="Year"><input required className="input" type="number" min="1950" max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></Field><Field label="Make"><input required className="input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Toyota" /></Field><Field label="Model"><input required className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Fielder" /></Field><Field label="Colour"><input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field><Field label="Mileage (km)"><input className="input" type="number" min="0" value={form.mileageKm} onChange={(e) => setForm({ ...form, mileageKm: Number(e.target.value) })} /></Field><button disabled={saving} className="btn btn-primary field-wide">{saving ? "Saving…" : "Add vehicle"}</button></form></section></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
