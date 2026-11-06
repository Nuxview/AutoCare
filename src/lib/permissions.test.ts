import { describe, expect, it } from "vitest";
import { can, canAccessWorkspacePage } from "./permissions";
import { partSchema, quoteSchema, scheduleSchema } from "./workshop-validation";
describe("workspace permission boundaries", () => {
  it("allows driver pages and only shows invitation acceptance when invited", () => {
    for (const page of [
      "",
      "vehicles",
      "bookings",
      "jobs",
      "history",
      "invoices",
    ])
      expect(canAccessWorkspacePage(false, null, page)).toBe(true);
    for (const page of [
      "staff",
      "schedule",
      "inventory",
      "billing",
      "garage-settings",
      "invitations",
      "unknown",
    ])
      expect(canAccessWorkspacePage(false, null, page)).toBe(false);
    expect(canAccessWorkspacePage(false, null, "invitations", true)).toBe(true);
  });
  it("keeps role-specific routes separate even when opened directly", () => {
    expect(canAccessWorkspacePage(true, "MECHANIC", "jobs")).toBe(true);
    expect(canAccessWorkspacePage(true, "MECHANIC", "invoices")).toBe(false);
    expect(canAccessWorkspacePage(true, "ACCOUNTANT", "invoices")).toBe(true);
    expect(canAccessWorkspacePage(true, "ACCOUNTANT", "jobs")).toBe(false);
    expect(
      canAccessWorkspacePage(true, "SERVICE_ADVISOR", "garage-settings"),
    ).toBe(false);
    expect(canAccessWorkspacePage(true, "INVENTORY_CLERK", "inventory")).toBe(
      true,
    );
    expect(canAccessWorkspacePage(true, "FRANCHISE_OWNER", "staff")).toBe(true);
    expect(canAccessWorkspacePage(true, "FRANCHISE_OWNER", "vehicles")).toBe(
      false,
    );
    expect(canAccessWorkspacePage(true, "unknown", "staff")).toBe(false);
  });
  it("keeps mechanic, inventory and accounting actions separate", () => {
    expect(can("MECHANIC", "repairs")).toBe(true);
    expect(can("MECHANIC", "invoices")).toBe(false);
    expect(can("MECHANIC", "staff")).toBe(false);
    expect(can("ACCOUNTANT", "invoices")).toBe(true);
    expect(can("ACCOUNTANT", "repairs")).toBe(false);
    expect(can("INVENTORY_CLERK", "inventory")).toBe(true);
    expect(can("INVENTORY_CLERK", "quotes")).toBe(false);
    expect(can(null, "staff")).toBe(false);
    expect(can("PLATFORM_ADMIN", "staff")).toBe(false);
  });
  it("rejects empty quotes, negative parts and reversed appointments", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(quoteSchema.safeParse({ jobId: id, lines: [] }).success).toBe(false);
    expect(
      partSchema.safeParse({
        jobId: id,
        itemId: id,
        quantity: -4,
        direction: "USE",
        requestId: id,
      }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        bookingId: id,
        mechanicId: id,
        bayId: id,
        startsAt: "2030-01-01T10:00:00Z",
        endsAt: "2030-01-01T09:00:00Z",
      }).success,
    ).toBe(false);
  });
});
