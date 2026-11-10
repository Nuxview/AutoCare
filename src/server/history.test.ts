import { beforeEach, describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  calls: [] as Array<[string, string, unknown[]]>,
  tenant: vi.fn(),
}));
vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedUser: async () => ({
    id: "viewer",
    email: "viewer@example.com",
  }),
  requireTenantMembership: fixtures.tenant,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "maybeSingle"]) {
        chain[method] = (...args: unknown[]) => {
          fixtures.calls.push([table, method, args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => void) =>
        resolve({ data: fixtures.tables[table] ?? [], error: null });
      return chain;
    },
  }),
}));
import { vehicleHistory } from "./history";
describe("customer-controlled vehicle history", () => {
  beforeEach(() => {
    fixtures.calls = [];
    fixtures.tenant.mockReset();
    fixtures.tables = {
      vehicles: { id: "vehicle", owner_id: "owner", registration: "KDA 123A" },
      memberships: [{ franchise_id: "garage", role: "MECHANIC" }],
      vehicle_history_shares: [],
      jobs: [],
    };
  });
  it("denies a garage when the owner has not shared the history", async () => {
    await expect(vehicleHistory("vehicle")).rejects.toMatchObject({
      status: 403,
    });
    expect(fixtures.calls.some(([table]) => table === "jobs")).toBe(false);
  });
  it("checks membership and exposes only customer-facing records after a grant", async () => {
    fixtures.tables.vehicle_history_shares = [{ franchise_id: "garage" }];
    await expect(vehicleHistory("vehicle")).resolves.toMatchObject({
      owner: false,
      jobs: [],
    });
    expect(fixtures.tenant).toHaveBeenCalledWith(
      "garage",
      undefined,
      expect.arrayContaining(["MECHANIC"]),
      false,
      { id: "viewer", email: "viewer@example.com" },
    );
    const selection = fixtures.calls.find(
      ([table, method]) => table === "jobs" && method === "select",
    )?.[2][0];
    expect(selection).not.toContain("internal_notes");
    expect(fixtures.calls).toContainEqual([
      "jobs",
      "eq",
      ["customer_id", "owner"],
    ]);
  });
  it("enforces revocation on the next history request", async () => {
    fixtures.tables.vehicle_history_shares = [{ franchise_id: "garage" }];
    await vehicleHistory("vehicle");
    fixtures.tables.vehicle_history_shares = [];
    await expect(vehicleHistory("vehicle")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("lets owners view their history without a garage grant", async () => {
    fixtures.tables.vehicles = {
      id: "vehicle",
      owner_id: "viewer",
      registration: "KDA 123A",
    };
    await expect(vehicleHistory("vehicle")).resolves.toMatchObject({
      owner: true,
    });
    expect(fixtures.tenant).not.toHaveBeenCalled();
  });
  it("normalizes PostgREST one-to-one invoice embeds for the timeline and report", async () => {
    fixtures.tables.vehicles = { id: "vehicle", owner_id: "viewer" };
    fixtures.tables.jobs = [
      {
        id: "job",
        booking_id: null,
        shop: { name: "Garage" },
        invoices: {
          id: "invoice",
          number: "INV-1",
          total_amount: 3000,
          lines: [],
        },
        parts: [{ quantity: 4, item: { name: "Spark plug" } }],
      },
    ];
    const result = await vehicleHistory("vehicle");
    expect(result.jobs[0].invoices).toEqual([
      expect.objectContaining({ number: "INV-1" }),
    ]);
    expect(result.jobs[0].shop).toEqual({ name: "Garage" });
  });
});
