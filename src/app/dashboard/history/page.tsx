"use client";

import { Suspense, useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import Image from "next/image";

import { api } from "@/lib/client-api";

import { useWorkspace } from "@/components/workspace-context";

type History = {
  owner: boolean;
  vehicle: {
    id: string;
    registration: string;
    make: string;
    model: string;
    mileage_km: number | null;
  };
  jobs: Array<{
    id: string;
    reference: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    odometer_in_km: number | null;
    booking_id: string | null;
    shop: { name: string };
    tasks: Array<{ title: string; status: string }>;
    parts: Array<{ quantity: number; item: { name: string } }>;
    invoices: Array<{
      id: string;
      number: string;
      total_amount: number;
      status: string;
      lines: Array<{
        description: string;
        quantity: number;
        line_total: number;
      }>;
    }>;
  }>;
  photos: Array<{
    id: string;
    booking_id: string;
    caption: string | null;
    url: string;
  }>;
  reminders: Array<{
    id: string;
    title: string;
    due_date: string | null;
    due_mileage: number | null;
    completed_at: string | null;
  }>;
  shares: Array<{ franchise_id: string; garage: { name: string } }>;
};

type Vehicle = { id: string; registration: string };
type Garage = {
  id: string;
  name: string;
  franchise: { id: string; name: string };
};

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="skeleton">Loading history…</div>}>
      <HistoryContent />
    </Suspense>
  );
}

function HistoryContent() {
  const search = useSearchParams();

  const { garage } = useWorkspace();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [garages, setGarages] = useState<Garage[]>([]);
  const [selectedVehicle, setVehicleId] = useState("");
  const vehicleId = selectedVehicle || search.get("vehicleId") || "";
  const [data, setData] = useState<History | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const id = search.get("vehicleId");
    if (garage) {
      api<{ vehicles: Vehicle[] }>("/api/history")
        .then((v) => {
          if (active) {
            setVehicles(v.vehicles);
            if (!id) setVehicleId(v.vehicles[0]?.id ?? "");
          }
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    } else {
      Promise.all([
        api<{ vehicles: Vehicle[] }>("/api/vehicles"),
        api<{ shops: Garage[] }>("/api/garages"),
      ])
        .then(([v, g]) => {
          if (active) {
            setVehicles(v.vehicles);
            setGarages(g.shops);
            if (!id) setVehicleId(v.vehicles[0]?.id ?? "");
          }
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [garage, search]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    api<History>(`/api/history?vehicleId=${encodeURIComponent(vehicleId)}`)
      .then((d) => {
        if (active) {
          setData(d);
          setMessage("");
        }
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setMessage(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [vehicleId]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api("/api/history", { ...body, vehicleId });
      setData(await api<History>(`/api/history?vehicleId=${vehicleId}`));
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Africa/Nairobi",
  });

  return (
    <div className="app-content workflow-stack">
      <h2>
        {garage ? "Customer-shared service history" : "Vehicle service history"}
      </h2>
      <p>
        Repairs, mileage, parts, photos and invoices together in one timeline.
      </p>
      <label className="field">
        <span>{garage ? "Vehicles shared with your garage" : "Vehicle"}</span>
        <select
          className="input"
          value={vehicleId}
          onChange={(e) => {
            setData(null);
            setVehicleId(e.target.value);
          }}
        >
          <option value="">Choose vehicle</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration}
            </option>
          ))}
        </select>
      </label>
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <div className="workflow-card">
            <h3>
              {data.vehicle.registration} · {data.vehicle.make}{" "}
              {data.vehicle.model}
            </h3>
            <p>Mileage: {data.vehicle.mileage_km ?? "Not recorded"} km</p>
            <a
              className="btn btn-secondary"
              href={`/api/history/report?vehicleId=${vehicleId}`}
            >
              Download printable service report
            </a>
            <p>
              Open the downloaded HTML report in a browser to print or save as
              PDF.
            </p>
          </div>
          {data.owner && (
            <>
              <form
                className="workflow-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  act({
                    action: "mileage",
                    mileage: Number(
                      new FormData(e.currentTarget).get("mileage"),
                    ),
                  });
                }}
              >
                <label className="field">
                  <span>Update current mileage</span>
                  <input
                    className="input"
                    name="mileage"
                    required
                    type="number"
                    min={data.vehicle.mileage_km ?? 0}
                    max={2000000}
                  />
                </label>
                <button className="btn btn-secondary" disabled={busy}>
                  Save mileage
                </button>
              </form>
              <section className="workflow-card workflow-stack">
                <h3>Maintenance reminders</h3>
                <p>
                  Reminders appear here when the date or recorded mileage is
                  reached.
                </p>
                {data.reminders
                  .filter((r) => !r.completed_at)
                  .map((r) => {
                    const due = !!(
                      (r.due_date && r.due_date <= today) ||
                      (r.due_mileage !== null &&
                        (data.vehicle.mileage_km ?? 0) >= r.due_mileage)
                    );
                    return (
                      <div className="section-inline-head" key={r.id}>
                        <span>
                          <strong>
                            {due ? "Due now: " : ""}
                            {r.title}
                          </strong>{" "}
                          · {r.due_date ?? ""}{" "}
                          {r.due_mileage !== null
                            ? `at ${r.due_mileage} km`
                            : ""}
                        </span>
                        <button
                          disabled={busy}
                          className="btn btn-secondary"
                          onClick={() => act({ action: "complete", id: r.id })}
                        >
                          Mark done
                        </button>
                      </div>
                    );
                  })}
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act({
                      action: "reminder",
                      title: f.get("title"),
                      dueDate: f.get("date") || null,
                      dueMileage:
                        f.get("mileage") === ""
                          ? null
                          : Number(f.get("mileage")),
                    });
                  }}
                >
                  <label className="field">
                    <span>Maintenance task</span>
                    <input
                      className="input"
                      name="title"
                      required
                      minLength={2}
                      maxLength={160}
                    />
                  </label>
                  <label className="field">
                    <span>Due date (or set mileage)</span>
                    <input className="input" name="date" type="date" />
                  </label>
                  <label className="field">
                    <span>Due mileage (or set date)</span>
                    <input
                      className="input"
                      name="mileage"
                      type="number"
                      min="0"
                      max="2000000"
                    />
                  </label>
                  <button className="btn btn-primary" disabled={busy}>
                    Add reminder
                  </button>
                </form>
              </section>
              <section className="workflow-card workflow-stack">
                <h3>History sharing</h3>
                <p>
                  Grant a garage read access to this vehicle’s complete service
                  history, including photos and invoices. Revoking stops future
                  access; previously downloaded reports cannot be recalled.
                </p>
                <p>
                  Vehicle ID: <code>{vehicleId}</code>
                </p>
                {data.shares.map((s) => (
                  <div className="section-inline-head" key={s.franchise_id}>
                    <span>{s.garage.name}</span>
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        act({
                          action: "share",
                          franchiseId: s.franchise_id,
                          enabled: false,
                        })
                      }
                    >
                      Revoke access
                    </button>
                  </div>
                ))}
                <form
                  className="workflow-actions"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act({
                      action: "share",
                      franchiseId: new FormData(e.currentTarget).get(
                        "franchiseId",
                      ),
                      enabled: true,
                    });
                  }}
                >
                  <label className="field">
                    <span>Garage to share with</span>
                    <select className="input" required name="franchiseId">
                      <option value="">Choose garage</option>
                      {Array.from(
                        new Map(
                          garages.map((g) => [g.franchise.id, g.franchise]),
                        ).values(),
                      ).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-primary" disabled={busy}>
                    Grant history access
                  </button>
                </form>
              </section>
            </>
          )}
          {!data.jobs.length && <p>No service records yet.</p>}
          {data.jobs.map((j) => (
            <article className="workflow-card workflow-stack" key={j.id}>
              <div>
                <span className="eyebrow">
                  {new Date(j.completed_at ?? j.created_at).toLocaleDateString(
                    "en-KE",
                  )}{" "}
                  · {j.shop.name}
                </span>
                <h3>
                  {j.reference} · {j.status.replaceAll("_", " ").toLowerCase()}
                </h3>
                <p>Mileage at service: {j.odometer_in_km ?? "Not recorded"}</p>
              </div>
              <ul>
                {j.tasks.map((t, i) => (
                  <li key={i}>
                    {t.title} · {t.status.toLowerCase()}
                  </li>
                ))}
              </ul>
              <h4>Parts</h4>
              {j.parts.map((p, i) => (
                <p key={i}>
                  {p.item.name} · {Number(p.quantity) > 0 ? "Used" : "Returned"}{" "}
                  {Math.abs(Number(p.quantity))}
                </p>
              ))}
              {j.invoices.map((i) => (
                <div key={i.id}>
                  <h4>
                    Invoice {i.number} · KES {i.total_amount} ·{" "}
                    {i.status.toLowerCase()}
                  </h4>
                  <ul>
                    {i.lines.map((l, index) => (
                      <li key={index}>
                        {l.description} · {l.quantity} · KES {l.line_total}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="photo-grid">
                {data.photos
                  .filter((p) => p.booking_id === j.booking_id)
                  .map((p) => (
                    <a
                      className="photo-tile"
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Image
                        unoptimized
                        width={160}
                        height={120}
                        src={p.url}
                        alt={p.caption ?? "Repair photo"}
                      />
                      <span>{p.caption}</span>
                    </a>
                  ))}
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
