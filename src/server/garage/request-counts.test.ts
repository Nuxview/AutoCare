import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getUser, from } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

import { bookingAccess, garageScope, jobAccess } from "./scope";
import { listVisibleJobs } from "@/server/jobs/service";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as invoices } from "@/app/api/invoices/route";
import { GET as workspace } from "@/app/api/me/route";
import { assertTenantActive } from "@/server/auth/context";

const profile = {
  id: "user-a", email: "owner@example.com", first_name: "Test",
  last_name: "Owner", global_role: "CUSTOMER", is_active: true,
};
let membership: {
  id: string; franchise_id: string; shop_id: string | null;
  role: string; franchise: { status: string };
} | null;
let membershipError: { message: string } | null;

function query(table: string) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
    single: async () => ({ data: profile, error: null }),
    maybeSingle: async () => ({
      data: table === "memberships" ? membership : {
        id: "repair-a", franchise_id: "garage-a", shop_id: "branch-a",
        customer_id: "customer-b", assigned_mechanic_id: "member-a",
      },
      error: table === "memberships" ? membershipError : null,
    }),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({
        data: table === "memberships" && membership ? [membership] : [],
        error: table === "memberships" ? membershipError : null,
        count: 0,
      }).then(resolve);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  membership = {
    id: "member-a", franchise_id: "garage-a", shop_id: "branch-a",
    role: "SHOP_MANAGER", franchise: { status: "ACTIVE" },
  };
  membershipError = null;
  getUser.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
  from.mockImplementation(query);
});

function tableQuery(table: string) {
  const index = from.mock.calls.findIndex(([name]) => name === table);
  return from.mock.results[index].value as ReturnType<typeof query>;
}

const paths = [
  { name: "garage scope", run: () => garageScope(["SHOP_MANAGER"]), entity: null },
  { name: "dashboard", run: dashboard, entity: null },
  { name: "invoices", run: invoices, entity: null },
  { name: "jobs", run: listVisibleJobs, entity: null },
  { name: "booking access", run: () => bookingAccess("repair-a"), entity: "bookings" },
  { name: "job access", run: () => jobAccess("repair-a"), entity: "jobs" },
];

describe.each(paths)("$name request budget", ({ run, entity }) => {
  it("verifies identity and active membership once per request", async () => {
    const result = await run();
    if (result instanceof Response) expect(result.status).toBe(200);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(from.mock.calls.filter(([table]) => table === "profiles")).toHaveLength(1);
    expect(from.mock.calls.filter(([table]) => table === "memberships")).toHaveLength(1);
    const members = tableQuery("memberships");
    expect(members.eq).toHaveBeenCalledWith("user_id", profile.id);
    expect(members.eq).toHaveBeenCalledWith("is_active", true);
    expect(members.select.mock.calls[0][0]).toContain("franchise:franchises(");
  });

  it.each(["SUSPENDED", "CANCELLED"])("still rejects %s garages", async status => {
    membership!.franchise.status = status;
    try {
      const response = await run();
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(403);
      expect(await (response as Response).json()).toMatchObject({
        error: { code: "TENANT_SUSPENDED" },
      });
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: "TENANT_SUSPENDED" });
    }
    expect(from.mock.calls.map(([table]) => table)).toEqual(
      entity ? ["profiles", entity, "memberships"] : ["profiles", "memberships"],
    );
  });

  it("does not read workshop data for an unauthenticated request", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    try {
      const response = await run();
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(401);
    } catch (error) {
      expect(error).toMatchObject({ status: 401 });
    }
    expect(from).not.toHaveBeenCalled();
  });
});

describe("garage access boundaries", () => {
  it("returns workspace identity and dashboard data together with separate server timings", async () => {
    const response = await dashboard();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "garage",
      workspace: {
        user: { id: profile.id },
        memberships: [{ franchiseId: "garage-a", role: "SHOP_MANAGER" }],
        hasPendingInvitation: false,
      },
      metrics: { openJobs: 0, todayBookings: 0 },
    });
    const timing = response.headers.get("Server-Timing")!;
    for (const span of ["auth", "profile", "memberships", "open_jobs", "today_bookings", "receivables", "recent_jobs", "pending_bookings", "total"]) {
      expect(timing).toMatch(new RegExp(`(?:^|, )${span};dur=\\d+\\.\\d`));
    }
    expect(timing).not.toContain(profile.id);
    expect(timing).not.toContain(profile.email);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(from.mock.calls.filter(([table]) => table === "memberships")).toHaveLength(1);
  });

  it("keeps the lighter workspace endpoint for direct visits to other pages", async () => {
    const response = await workspace();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: profile.id }, memberships: [{ role: "SHOP_MANAGER" }] });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["profiles", "memberships"]);
    expect(response.headers.get("Server-Timing")).toContain("memberships;dur=");
  });

  it("keeps workspace navigation available for a suspended garage without returning workshop data", async () => {
    membership!.franchise.status = "SUSPENDED";
    const response = await dashboard();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.workspace.user.id).toBe(profile.id);
    expect(body.error.code).toBe("TENANT_SUSPENDED");
    expect(body.metrics).toBeUndefined();
    expect(response.headers.get("Server-Timing")).toContain("memberships;dur=");
    expect(from.mock.calls.map(([table]) => table)).toEqual(["profiles", "memberships"]);
  });

  it("provides the customer bootstrap and times the invitation check and customer queries", async () => {
    membership = null;
    const response = await dashboard();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "customer", workspace: { memberships: [], hasPendingInvitation: false } });
    expect(tableQuery("vehicles").eq).toHaveBeenCalledWith("owner_id", profile.id);
    expect(tableQuery("jobs").eq).toHaveBeenCalledWith("customer_id", profile.id);
    expect(response.headers.get("Server-Timing")).toContain("invitations;dur=");
    expect(response.headers.get("Server-Timing")).toContain("vehicles;dur=");
  });

  it("returns a timed authentication failure without workspace or private data", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await dashboard();
    expect(response.status).toBe(401);
    expect((await response.json()).workspace).toBeUndefined();
    expect(response.headers.get("Server-Timing")).toMatch(/^auth;dur=\d+\.\d, total;dur=/);
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps branch and assignment checks when reusing the verified user", async () => {
    membership!.shop_id = "another-branch";
    await expect(jobAccess("repair-a")).rejects.toMatchObject({ status: 403 });
    membership!.shop_id = "branch-a";
    membership!.role = "MECHANIC";
    membership!.id = "another-mechanic";
    await expect(jobAccess("repair-a")).rejects.toMatchObject({ status: 403 });
  });

  it("keeps branch scope and rejects a role without the requested capability", async () => {
    expect(await garageScope(["SHOP_MANAGER"])).toMatchObject({
      franchiseId: "garage-a", shopId: "branch-a", role: "SHOP_MANAGER",
    });
    membership!.role = "MECHANIC";
    await expect(garageScope(["SHOP_MANAGER"])).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing memberships and lookup failures", async () => {
    membership = null;
    await expect(garageScope()).rejects.toMatchObject({ status: 403 });
    membershipError = { message: "Database unavailable" };
    await expect(garageScope()).rejects.toEqual(membershipError);
  });

  it("keeps mechanic job reads restricted to their assigned branch and jobs", async () => {
    membership!.role = "MECHANIC";
    await listVisibleJobs();
    const jobs = tableQuery("jobs");
    expect(jobs.eq).toHaveBeenCalledWith("franchise_id", "garage-a");
    expect(jobs.eq).toHaveBeenCalledWith("shop_id", "branch-a");
    expect(jobs.eq).toHaveBeenCalledWith("assigned_mechanic_id", "member-a");
  });

  it("keeps invoice reads restricted to their branch and capability", async () => {
    expect((await invoices()).status).toBe(200);
    expect(tableQuery("invoices").eq).toHaveBeenCalledWith("franchise_id", "garage-a");
    expect(tableQuery("invoices").eq).toHaveBeenCalledWith("shop_id", "branch-a");
    from.mockClear();
    membership!.role = "MECHANIC";
    expect((await invoices()).status).toBe(403);
    expect(from).not.toHaveBeenCalledWith("invoices");
  });

  it("keeps customer reads restricted to their own jobs and invoices", async () => {
    membership = null;
    await listVisibleJobs();
    expect(tableQuery("jobs").eq).toHaveBeenCalledWith("customer_id", profile.id);
    expect((await invoices()).status).toBe(200);
    expect(tableQuery("invoices").eq).toHaveBeenCalledWith("customer_id", profile.id);
  });

  it("checks tenant status for object and array relationship responses", () => {
    expect(() => assertTenantActive({ status: "SUSPENDED" })).toThrow();
    expect(() => assertTenantActive([{ status: "CANCELLED" }])).toThrow();
    expect(() => assertTenantActive({ status: "ACTIVE" })).not.toThrow();
  });
});
