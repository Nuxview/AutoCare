"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { can } from "@/lib/permissions";
import { useWorkspace } from "@/components/workspace-context";
type Schedule = {
  readOnly: boolean;
  shops: Array<{ id: string; name: string }>;
  bays: Array<{ id: string; name: string; shop_id: string }>;
  mechanics: Array<{
    id: string;
    shop_id: string | null;
    profile: { first_name: string; last_name: string };
  }>;
  bookings: Array<{
    id: string;
    reference: string;
    shop_id: string;
    vehicle: { registration: string };
  }>;
  slots: Array<{
    id: string;
    booking_id: string;
    bay_id: string;
    mechanic_id: string;
    starts_at: string;
    ends_at: string;
    booking: {
      reference: string;
      status: string;
      vehicle: { registration: string };
    };
  }>;
};
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
export default function SchedulePage() {
  const { role } = useWorkspace();
  const [data, setData] = useState<Schedule | null>(null);
  const [date, setDate] = useState(today);
  const [bookingId, setBookingId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<Schedule>("/api/schedule"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load calendar");
    }
  }, []);
  useEffect(() => {
    let active = true;
    api<Schedule>("/api/schedule")
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
  async function save(body: unknown, method = "POST") {
    setBusy(true);
    try {
      await api("/api/schedule", body, method);
      await load();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  const shopId = data?.bookings.find((b) => b.id === bookingId)?.shop_id;
  const slots =
    data?.slots.filter(
      (s) =>
        new Date(s.starts_at).toLocaleDateString("en-CA", {
          timeZone: "Africa/Nairobi",
        }) === date &&
        !["CANCELLED", "DECLINED", "COMPLETED"].includes(s.booking.status),
    ) ?? [];
  return (
    <div className="app-content workflow-stack">
      <h2>{data?.readOnly ? "My schedule" : "Workshop calendar"}</h2>
      <p>
        Times are shown in East Africa Time (UTC+3). Overlapping mechanic and
        bay assignments are blocked.
      </p>
      {message && <p role="status">{message}</p>}
      <label className="field">
        <span>Calendar day</span>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="calendar-grid">
        {data?.bays.map((bay) => (
          <section className="workflow-card" key={bay.id}>
            <h3>{bay.name}</h3>
            {slots
              .filter((s) => s.bay_id === bay.id)
              .map((s) => (
                <article className="calendar-slot" key={s.id}>
                  <strong>{s.booking.vehicle.registration}</strong>
                  <p>
                    {new Date(s.starts_at).toLocaleTimeString("en-KE", {
                      timeZone: "Africa/Nairobi",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    –
                    {new Date(s.ends_at).toLocaleTimeString("en-KE", {
                      timeZone: "Africa/Nairobi",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p>
                    {
                      data.mechanics.find((m) => m.id === s.mechanic_id)
                        ?.profile.first_name
                    }{" "}
                    · {s.booking.reference}
                  </p>
                </article>
              ))}
            {!slots.some((s) => s.bay_id === bay.id) && (
              <p>No appointments for this day.</p>
            )}
          </section>
        ))}
      </div>
      {!data?.bays.length && <p>No repair bays configured.</p>}
      {data && !data.readOnly && (
        <form
          className="workflow-card form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save({
              bookingId,
              mechanicId: f.get("mechanicId"),
              bayId: f.get("bayId"),
              startsAt: new Date(`${f.get("startsAt")}:00+03:00`).toISOString(),
              endsAt: new Date(`${f.get("endsAt")}:00+03:00`).toISOString(),
            });
          }}
        >
          <h3 className="field-wide">
            Schedule or reschedule a confirmed visit
          </h3>
          <label className="field">
            <span>Booking</span>
            <select
              className="input"
              required
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
            >
              <option value="">Choose booking</option>
              {data.bookings.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.reference} · {b.vehicle.registration}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mechanic</span>
            <select
              className="input"
              name="mechanicId"
              required
              key={`mechanic-${shopId}`}
            >
              <option value="">Choose mechanic</option>
              {data.mechanics
                .filter((m) => !m.shop_id || m.shop_id === shopId)
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.profile.first_name} {m.profile.last_name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Bay</span>
            <select
              className="input"
              name="bayId"
              required
              key={`bay-${shopId}`}
            >
              <option value="">Choose bay</option>
              {data.bays
                .filter((b) => b.shop_id === shopId)
                .map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Start (EAT)</span>
            <input
              className="input"
              name="startsAt"
              type="datetime-local"
              required
            />
          </label>
          <label className="field">
            <span>End (EAT)</span>
            <input
              className="input"
              name="endsAt"
              type="datetime-local"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            Save appointment
          </button>
        </form>
      )}
      {can(role, "settings") && (
        <form
          className="workflow-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save({ shopId: f.get("shopId"), name: f.get("name") }, "PUT");
          }}
        >
          <label className="field">
            <span>Branch</span>
            <select className="input" name="shopId" required>
              {data?.shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>New repair bay</span>
            <input
              className="input"
              name="name"
              required
              minLength={2}
              maxLength={60}
            />
          </label>
          <button className="btn btn-secondary" disabled={busy}>
            Add bay
          </button>
        </form>
      )}
    </div>
  );
}
