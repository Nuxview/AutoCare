import { z } from "zod";
import { jsonError } from "@/lib/api";
import { vehicleHistory } from "@/server/history";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function GET(request: Request) {
  try {
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("vehicleId"));
    const data = await vehicleHistory(id);
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>AutoCare service report</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:20px;color:#16332c}article{border-top:1px solid #ccc;padding:20px 0}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}small{color:#555}@media print{article{break-inside:avoid}}</style><h1>Vehicle service report</h1><h2>${escape(data.vehicle.registration)} · ${escape(data.vehicle.make)} ${escape(data.vehicle.model)}</h2><p>Recorded mileage: ${escape(data.vehicle.mileage_km ?? "Not recorded")} km</p><small>Generated ${escape(new Date().toISOString())}. Contains personal service information.</small>${(data.jobs ?? []).map((j) => `<article><h2>${escape(j.reference)} · ${escape(j.status)}</h2><p>${escape((Array.isArray(j.shop) ? j.shop[0] : j.shop)?.name)} · ${escape(j.completed_at ?? j.created_at)} · Mileage: ${escape(j.odometer_in_km ?? "Not recorded")}</p><ul>${(j.tasks ?? []).map((t) => `<li>${escape(t.title)} — ${escape(t.status)}</li>`).join("")}</ul><h3>Parts movements</h3><ul>${(j.parts ?? []).map((p) => `<li>${escape((Array.isArray(p.item) ? p.item[0] : p.item)?.name)}: ${escape(p.quantity)} (negative means returned)</li>`).join("")}</ul>${(j.invoices ?? []).map((i) => `<h3>Invoice ${escape(i.number)}</h3><table><thead><tr><th>Description</th><th>Quantity</th><th>KES</th></tr></thead><tbody>${(i.lines ?? []).map((l) => `<tr><td>${escape(l.description)}</td><td>${escape(l.quantity)}</td><td>${escape(l.line_total)}</td></tr>`).join("")}</tbody></table><p>Total: KES ${escape(i.total_amount)} · ${escape(i.status)}</p>`).join("")}</article>`).join("")}</html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="autocare-service-${id}.html"`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
