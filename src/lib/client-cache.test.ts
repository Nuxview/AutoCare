import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearApiCache,
  primeApiCache,
  request,
  setApiCacheScope,
} from "./client-cache";
import { api } from "./client-api";

const network = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  vi.stubGlobal("window", { localStorage: { setItem: vi.fn() } });
  vi.stubGlobal("fetch", network);
  network
    .mockReset()
    .mockImplementation(async () =>
      Response.json({ version: network.mock.calls.length }),
    );
  clearApiCache();
  setApiCacheScope("user-a", "garage-a", "FRANCHISE_OWNER");
});
afterEach(() => {
  clearApiCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("private client data cache", () => {
  it("deduplicates concurrent reads, returns independently readable responses, and expires after 30 seconds", async () => {
    const [one, two] = await Promise.all([
      request("/api/jobs"),
      request("/api/jobs"),
    ]);
    expect(await one.json()).toEqual(await two.json());
    await request("/api/jobs");
    expect(network).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 30_001);
    expect(await (await request("/api/jobs")).json()).toEqual({ version: 2 });
  });

  it.each(["POST", "PATCH", "DELETE"])(
    "invalidates related pages after a successful %s",
    async (method) => {
      await api("/api/jobs");
      await api("/api/dashboard");
      await api("/api/jobs/status", { jobId: "job-a" }, method);
      expect(await api("/api/jobs")).toEqual({ version: 4 });
      expect(await api("/api/dashboard")).toEqual({ version: 5 });
    },
  );

  it("invalidates after multipart uploads, but keeps fresh data after a failed write", async () => {
    await request("/api/history?vehicleId=a");
    network.mockResolvedValueOnce(
      Response.json({ error: { message: "Invalid photo" } }, { status: 400 }),
    );
    await request("/api/repair-photos", {
      method: "POST",
      body: new FormData(),
    });
    await request("/api/history?vehicleId=a");
    expect(network).toHaveBeenCalledTimes(2);
    await request("/api/repair-photos", {
      method: "POST",
      body: new FormData(),
    });
    await request("/api/history?vehicleId=a");
    expect(network).toHaveBeenCalledTimes(4);
  });

  it("treats the existing garage booking PUT as a cacheable read", async () => {
    await request("/api/jobs");
    await request("/api/bookings", { method: "PUT" });
    await request("/api/bookings", { method: "PUT" });
    await request("/api/jobs");
    expect(network).toHaveBeenCalledTimes(2);
    await request("/api/bookings");
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("separates query parameters, accounts, garages, and roles", async () => {
    await request("/api/history?vehicleId=a");
    await request("/api/history?vehicleId=b");
    setApiCacheScope("user-b", "garage-a", "FRANCHISE_OWNER");
    await request("/api/history?vehicleId=a");
    setApiCacheScope("user-b", "garage-b", "FRANCHISE_OWNER");
    await request("/api/history?vehicleId=a");
    setApiCacheScope("user-b", "garage-b", "MECHANIC");
    await request("/api/history?vehicleId=a");
    expect(network).toHaveBeenCalledTimes(5);
  });

  it.each(["/api/auth/login", "/api/auth/logout"])(
    "clears private data at %s and notifies other tabs",
    async (url) => {
      await request("/api/jobs");
      await request(url, { method: "POST" });
      setApiCacheScope("user-a", "garage-a", "FRANCHISE_OWNER");
      await request("/api/jobs");
      expect(network).toHaveBeenCalledTimes(3);
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "autocare-session-changed",
        expect.any(String),
      );
    },
  );

  it.each([401, 403, 500])(
    "does not cache HTTP %s errors or change their bodies",
    async (status) => {
      network.mockResolvedValueOnce(
        Response.json({ error: { message: "Denied" } }, { status }),
      );
      const response = await request("/api/jobs");
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: { message: "Denied" } });
      expect(await (await request("/api/jobs")).json()).toEqual({ version: 2 });
    },
  );

  it("never caches payment checks or workspace authentication and invalidates data after reconciliation", async () => {
    await request("/api/invoices");
    for (const url of [
      "/api/me",
      "/api/payments/options?invoiceId=a",
      "/api/payments/status?reference=a",
      "/api/payments/paystack/verify?reference=a",
    ]) {
      await request(url);
      await request(url);
    }
    await request("/api/invoices");
    expect(network).toHaveBeenCalledTimes(10);
  });

  it("uses the bootstrap payload without a second dashboard request", async () => {
    primeApiCache("/api/dashboard", { metrics: { openJobs: 4 } });
    expect(await api("/api/dashboard")).toEqual({ metrics: { openJobs: 4 } });
    expect(network).not.toHaveBeenCalled();
  });

  it("never reuses private data during server rendering", async () => {
    await request("/api/jobs");
    vi.stubGlobal("window", undefined);
    await request("/api/jobs");
    await request("/api/jobs");
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("prevents an older in-flight read from repopulating the cache after a write", async () => {
    let finish!: (response: Response) => void;
    network.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const oldRead = request("/api/jobs");
    await request("/api/jobs/status", { method: "PATCH" });
    finish(Response.json({ version: "old" }));
    expect(await (await oldRead).json()).toEqual({ version: 3 });
    expect(await (await request("/api/jobs")).json()).toEqual({ version: 3 });
  });

  it("does not expose an older pending response after the account changes", async () => {
    let finish!: (response: Response) => void;
    network.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const oldRead = request("/api/jobs");
    setApiCacheScope("user-b", "garage-b", "FRANCHISE_OWNER");
    finish(Response.json({ private: "user-a" }));
    const response = await oldRead;
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("private");
    expect(await (await request("/api/jobs")).json()).toEqual({ version: 2 });
  });
});
