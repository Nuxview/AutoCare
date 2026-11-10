import { createElement, type ComponentType, type EffectCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { effects } = vi.hoisted(() => ({ effects: [] as EffectCallback[] }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));
// Run mount effects explicitly to count page requests without a browser or live backend.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: EffectCallback) => {
    effects.push(effect);
  },
}));
vi.mock("@/components/approved-invoices", () => ({
  ApprovedInvoices: () => null,
}));

import {
  WorkspaceContext,
  type Workspace,
} from "@/components/workspace-context";
import BookingsPage from "./bookings/page";
import InvoicesPage from "./invoices/page";
import GarageSettingsPage from "./garage-settings/page";
import BillingPage from "./billing/page";
import DashboardPage from "./page";
import { DashboardShell } from "@/components/dashboard-shell";
import * as clientCache from "@/lib/client-cache";
import { clearApiCache, setApiCacheScope } from "@/lib/client-cache";

const customer: Workspace = {
  garage: false,
  role: null,
  userId: "customer-a",
  franchiseId: null,
};
const owner: Workspace = {
  garage: true,
  role: "FRANCHISE_OWNER",
  userId: "owner-a",
  franchiseId: "garage-a",
};
const fetchMock = vi.fn();
let cleanups: ReturnType<EffectCallback>[];

beforeEach(() => {
  clearApiCache();
  effects.length = 0;
  cleanups = [];
  fetchMock.mockReset().mockImplementation(async () =>
    Response.json({
      bookings: [],
      vehicles: [],
      shops: [],
      invoices: [],
      banks: [],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    location: { search: "", pathname: "/dashboard" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  for (const cleanup of cleanups) if (cleanup) cleanup();
  vi.unstubAllGlobals();
  clearApiCache();
});

function mount(Page: ComponentType, workspace: Workspace) {
  effects.length = 0;
  setApiCacheScope(workspace.userId, workspace.franchiseId, workspace.role);
  renderToStaticMarkup(
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(Page),
    ),
  );
  cleanups = effects.map((effect) => effect());
}

describe("pages reuse the dashboard workspace", () => {
  it("boots the shell and dashboard from one combined request", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        kind: "garage",
        metrics: {},
        workspace: {
          user: { id: owner.userId },
          memberships: [
            { role: owner.role, franchise: { id: owner.franchiseId } },
          ],
          hasPendingInvitation: false,
        },
      }),
    );
    const scoped = vi.spyOn(clientCache, "setApiCacheScope");
    mount(() => createElement(DashboardShell, null, null), owner);
    await vi.waitFor(() => expect(scoped).toHaveBeenCalledTimes(2));
    for (const cleanup of cleanups) if (cleanup) cleanup();
    mount(DashboardPage, owner);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/dashboard",
    ]);
    scoped.mockRestore();
  });

  it("keeps deep-link bootstrap light instead of loading an unused dashboard", async () => {
    window.location.pathname = "/dashboard/bookings";
    fetchMock.mockResolvedValueOnce(
      Response.json({
        user: { id: owner.userId },
        memberships: [
          { role: owner.role, franchise: { id: owner.franchiseId } },
        ],
      }),
    );
    const scoped = vi.spyOn(clientCache, "setApiCacheScope");
    mount(() => createElement(DashboardShell, null, null), owner);
    await vi.waitFor(() => expect(scoped).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/me"]);
    scoped.mockRestore();
  });

  it.each([
    {
      name: "customer bookings",
      Page: BookingsPage,
      workspace: customer,
      urls: ["/api/bookings", "/api/vehicles", "/api/garages"],
    },
    {
      name: "garage bookings",
      Page: BookingsPage,
      workspace: owner,
      urls: ["/api/bookings"],
    },
    {
      name: "invoices",
      Page: InvoicesPage,
      workspace: customer,
      urls: ["/api/invoices"],
    },
    {
      name: "garage settings",
      Page: GarageSettingsPage,
      workspace: owner,
      urls: ["/api/garage-settings"],
    },
    {
      name: "billing",
      Page: BillingPage,
      workspace: owner,
      urls: ["/api/billing/summary?franchiseId=garage-a", "/api/billing/banks"],
    },
  ])(
    "$name loads its data without another identity request",
    async ({ Page, workspace, urls }) => {
      mount(Page, workspace);
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls),
      );
      if (Page === BookingsPage && workspace.garage) {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/bookings",
          expect.objectContaining({ method: "PUT" }),
        );
      }
    },
  );

  it("reuses page data on return and reloads it after a vehicle mutation", async () => {
    mount(BookingsPage, customer);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    for (const cleanup of cleanups) if (cleanup) cleanup();
    mount(BookingsPage, customer);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const { api } = await import("@/lib/client-api");
    await api("/api/vehicles", { registration: "KDA 123A" });
    for (const cleanup of cleanups) if (cleanup) cleanup();
    mount(BookingsPage, customer);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
  });

  it("starts the bank request while the billing summary is still pending", async () => {
    let finishSummary!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishSummary = resolve;
        }),
    );
    mount(BillingPage, owner);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/billing/summary?franchiseId=garage-a",
      "/api/billing/banks",
    ]);
    finishSummary(Response.json({}));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
