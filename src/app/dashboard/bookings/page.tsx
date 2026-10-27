"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, MapPin } from "lucide-react";
import { toast } from "sonner";

type Booking = { id: string; reference: string; status: string; scheduledAt: string; shop: { name: string; county: string }; vehicle: { registration: string }; service?: { name: string } };
type Vehicle = { id: string; registration: string; make: string; model: string };
type Shop = { id: string; name: string; address: string; county: string; services: Array<{ id: string; name: string; basePrice: string; estimatedMinutes: number }> };

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]); const [vehicles, setVehicles] = useState<Vehicle[]>([]); const [shops, setShops] = useState<Shop[]>([]); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ shopId: "", vehicleId: "", serviceId: "", scheduledAt: "", customerNotes: "" });
  async function load() { const [b, v, g] = await Promise.all([fetch("/api/bookings"), fetch("/api/vehicles"), fetch("/api/garages")]); if (b.ok) setBookings((await b.json()).bookings); if (v.ok) setVehicles((await v.json()).vehicles); if (g.ok) setShops((await g.json()).shops); }
  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/bookings"), fetch("/api/vehicles"), fetch("/api/garages")]).then(async ([bookingsResponse, vehiclesResponse, garagesResponse]) => {
      if (!active) return;
      if (bookingsResponse.ok) setBookings((await bookingsResponse.json()).bookings);
      if (vehiclesResponse.ok) setVehicles((await vehiclesResponse.json()).vehicles);
      if (garagesResponse.ok) setShops((await garagesResponse.json()).shops);
    });
    return () => { active = false; };
  }, []);
  const services = useMemo(() => shops.find((s) => s.id === form.shopId)?.services ?? [], [form.shopId, shops]);
  async function submit(e: React.FormEvent) { e.preventDefault(); setSaving(true); const r = await fetch("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, serviceId: form.serviceId || undefined, scheduledAt: new Date(form.scheduledAt).toISOString() }) }); const body = await r.json(); setSaving(false); if (!r.ok) return toast.error(body.error?.message ?? "Could not create booking"); toast.success(`Booking ${body.booking.reference} created`); setForm({ shopId: "", vehicleId: "", serviceId: "", scheduledAt: "", customerNotes: "" }); load(); }
  return <div className="app-content"><div className="welcome"><div><h2>Bookings</h2><p>Choose a trusted garage and a convenient time.</p></div></div><div className="panel-grid"><section className="panel"><div className="panel-head"><h3>Your bookings</h3><span>{bookings.length} total</span></div><div style={{ padding: 14, display: "grid", gap: 10 }}>{bookings.map((b) => <article className="job-row" key={b.id} style={{ color: "var(--ink)", background: "white", borderColor: "var(--line)" }}><span className="car-icon"><CalendarCheck size={18} /></span><div><strong>{b.reference} · {b.vehicle.registration}</strong><span style={{ color: "var(--muted)" }}>{b.shop.name} · {new Date(b.scheduledAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</span></div><span className="pill">{b.status.replaceAll("_", " ")}</span></article>)}{!bookings.length && <p style={{ padding: 14, color: "var(--muted)" }}>You have no bookings yet.</p>}</div></section><section className="panel"><div className="panel-head"><h3>Book a service</h3></div>{!vehicles.length ? <p style={{ padding: 20, color: "var(--muted)" }}>Add a vehicle before booking a service.</p> : <form onSubmit={submit} className="form-grid" style={{ padding: 20 }}><label className="field field-wide"><span>Garage</span><select required className="input" value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value, serviceId: "" })}><option value="">Select a garage</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.county}</option>)}</select></label><label className="field field-wide"><span>Vehicle</span><select required className="input" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}><option value="">Select your vehicle</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration} — {v.make} {v.model}</option>)}</select></label><label className="field field-wide"><span>Service</span><select className="input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}><option value="">General inspection</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} — KES {Number(s.basePrice).toLocaleString()}</option>)}</select></label><label className="field field-wide"><span>Date and time</span><input required className="input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></label><label className="field field-wide"><span>What should the garage know?</span><textarea className="input" rows={3} value={form.customerNotes} onChange={(e) => setForm({ ...form, customerNotes: e.target.value })} /></label>{form.shopId && <div className="field-wide" style={{ color: "var(--muted)", fontSize: 12 }}><MapPin size={14} style={{ display: "inline", marginRight: 5 }} />{shops.find((s) => s.id === form.shopId)?.address}</div>}<button disabled={saving} className="btn btn-primary field-wide">{saving ? "Booking…" : "Request booking"}</button></form>}</section></div></div>;
}
