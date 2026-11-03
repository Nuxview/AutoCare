"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { can } from "@/lib/permissions";
import { useWorkspace } from "./workspace-context";
type Line = {
  description: string;
  quantity: number;
  unitPrice: number;
  inventoryItemId: string | null;
};
type Quote = {
  id: string;
  version: number;
  status: string;
  total: number;
  note: string;
  decided_at: string | null;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    inventory_item_id: string | null;
  }>;
};
type Item = {
  id: string;
  name: string;
  quantity_on_hand: number;
  selling_price: number;
};
type Movement = {
  id: string;
  quantity: number;
  created_at: string;
  item: { name: string };
  actor: { first_name: string; last_name: string };
};
export function RepairWorkflow({
  jobId,
  closed,
  onChange,
}: {
  jobId: string;
  closed: boolean;
  onChange: () => void;
}) {
  const { garage, role } = useWorkspace();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: 1, unitPrice: 0, inventoryItemId: null },
  ]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const [q, p] = await Promise.all([
      api<{ quotes: Quote[] }>(`/api/jobs/quotes?jobId=${jobId}`),
      api<{ items: Item[]; movements: Movement[] }>(
        `/api/jobs/parts?jobId=${jobId}`,
      ),
    ]);
    setQuotes(q.quotes);
    setItems(p.items);
    setMovements(p.movements);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ quotes: Quote[] }>(`/api/jobs/quotes?jobId=${jobId}`),
      api<{ items: Item[]; movements: Movement[] }>(
        `/api/jobs/parts?jobId=${jobId}`,
      ),
    ])
      .then(([q, p]) => {
        if (active) {
          setQuotes(q.quotes);
          setItems(p.items);
          setMovements(p.movements);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [jobId]);
  async function act(url: string, body: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      await api(url, body, method);
      await load();
      onChange();
      setMessage("Saved successfully.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  function lineChange(index: number, value: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...value } : line)),
    );
  }
  return (
    <section className="workflow-stack">
      <h3>Quotes & approval</h3>
      {message && <p role="status">{message}</p>}
      {quotes.map((q, index) => (
        <article className="workflow-card" key={q.id}>
          <strong>
            Quote {q.version} · {q.status.toLowerCase()}{" "}
            {index > 0 ? "(previous version)" : ""}
          </strong>
          <ul>
            {q.lines.map((l) => (
              <li key={l.id}>
                {l.description} — {l.quantity} × KES {l.unit_price}
              </li>
            ))}
          </ul>
          <strong>Total: KES {q.total}</strong>
          <p>{q.note}</p>
          {q.decided_at && (
            <small>
              Decision recorded {new Date(q.decided_at).toLocaleString("en-KE")}
            </small>
          )}
          {!garage && index === 0 && q.status === "PENDING" && (
            <div className="workflow-actions">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  act(
                    "/api/jobs/quotes",
                    { quoteId: q.id, decision: "APPROVED" },
                    "PATCH",
                  )
                }
              >
                Approve KES {q.total}
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  act(
                    "/api/jobs/quotes",
                    { quoteId: q.id, decision: "DECLINED" },
                    "PATCH",
                  )
                }
              >
                Decline
              </button>
            </div>
          )}
          {garage && can(role, "quotes") && !closed && index === 0 && (
            <button
              className="btn btn-secondary"
              onClick={() =>
                setLines(
                  q.lines.map((l) => ({
                    description: l.description,
                    quantity: Number(l.quantity),
                    unitPrice: Number(l.unit_price),
                    inventoryItemId: l.inventory_item_id,
                  })),
                )
              }
            >
              Copy for revision
            </button>
          )}
        </article>
      ))}
      {!quotes.length && <p>No quote sent yet.</p>}
      {garage && can(role, "quotes") && !closed && (
        <form
          className="workflow-card workflow-stack"
          onSubmit={(e) => {
            e.preventDefault();
            act("/api/jobs/quotes", {
              jobId,
              lines,
              note: String(new FormData(e.currentTarget).get("note") ?? ""),
            });
          }}
        >
          <h4>Send itemized quote</h4>
          <p>
            A revised quote must include all work and parts. It requires fresh
            customer approval.
          </p>
          {lines.map((l, index) => (
            <div className="quote-line" key={index}>
              <label className="field">
                <span>Stock item</span>
                <select
                  className="input"
                  value={l.inventoryItemId ?? ""}
                  onChange={(e) => {
                    const item = items.find((i) => i.id === e.target.value);
                    lineChange(index, {
                      inventoryItemId: item?.id ?? null,
                      ...(item
                        ? {
                            description: item.name,
                            unitPrice: Number(item.selling_price),
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="">Labour / other</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Description</span>
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  className="input"
                  value={l.description}
                  onChange={(e) =>
                    lineChange(index, { description: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Quantity</span>
                <input
                  className="input"
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={l.quantity}
                  onChange={(e) =>
                    lineChange(index, { quantity: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span>Unit price (KES)</span>
                <input
                  className="input"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={l.unitPrice}
                  onChange={(e) =>
                    lineChange(index, { unitPrice: Number(e.target.value) })
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="btn btn-secondary"
            type="button"
            disabled={lines.length >= 50}
            onClick={() =>
              setLines([
                ...lines,
                {
                  description: "",
                  quantity: 1,
                  unitPrice: 0,
                  inventoryItemId: null,
                },
              ])
            }
          >
            Add line
          </button>
          <label className="field">
            <span>Customer notes</span>
            <textarea className="input" name="note" maxLength={500} />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            Send for approval
          </button>
        </form>
      )}
      <h3>Parts used & returned</h3>
      {movements.map((m) => (
        <div key={m.id}>
          {m.item.name} · {Number(m.quantity) > 0 ? "Used" : "Returned"}{" "}
          {Math.abs(Number(m.quantity))} · {m.actor.first_name}{" "}
          {m.actor.last_name} · {new Date(m.created_at).toLocaleString("en-KE")}
        </div>
      ))}
      {!movements.length && <p>No parts recorded.</p>}
      {garage && can(role, "repairs") && !closed && (
        <form
          className="workflow-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act("/api/jobs/parts", {
              jobId,
              itemId: f.get("itemId"),
              quantity: Number(f.get("quantity")),
              direction: f.get("direction"),
              requestId: crypto.randomUUID(),
            });
          }}
        >
          <label className="field">
            <span>Part</span>
            <select className="input" name="itemId" required>
              <option value="">Select stock</option>
              {items.map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name} ({i.quantity_on_hand} in stock)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quantity</span>
            <input
              className="input"
              name="quantity"
              type="number"
              required
              min="0.001"
              step="0.001"
              defaultValue={1}
            />
          </label>
          <label className="field">
            <span>Action</span>
            <select className="input" name="direction">
              <option value="USE">Use parts</option>
              <option value="RETURN">Return parts</option>
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            Record parts
          </button>
        </form>
      )}
    </section>
  );
}
