"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
export function ServiceMileage({ jobId }: { jobId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="workflow-actions"
      onSubmit={async (e) => {
        e.preventDefault();
        const mileage = Number(new FormData(e.currentTarget).get("mileage"));
        setBusy(true);
        try {
          await api("/api/jobs/mileage", { jobId, mileage }, "PATCH");
          setMessage("Service mileage saved.");
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Could not save mileage",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>Mileage at this service (km)</span>
        <input
          className="input"
          name="mileage"
          required
          type="number"
          min="0"
          max="2000000"
        />
      </label>
      <button className="btn btn-secondary" disabled={busy}>
        Save reading
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
