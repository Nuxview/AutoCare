import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestTiming } from "./timing";

afterEach(() => vi.restoreAllMocks());

describe("request timing", () => {
  it("measures authentication and database waits separately without adding parallel spans together", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const timing = new RequestTiming();
    await timing.measure("auth", async () => {
      now = 20;
    });
    let finish!: () => void;
    const database = timing.measure(
      "jobs",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    now = 30;
    await timing.measure("bookings", async () => {
      now = 50;
    });
    now = 80;
    finish();
    await database;
    expect(
      timing.response(Response.json({})).headers.get("Server-Timing"),
    ).toBe("auth;dur=20.0, bookings;dur=20.0, jobs;dur=60.0, total;dur=80.0");
  });

  it("records failed stages and isolates concurrent requests", async () => {
    const one = new RequestTiming();
    const two = new RequestTiming();
    await expect(
      one.measure("profile", () => {
        throw new Error("Database failed");
      }),
    ).rejects.toThrow("Database failed");
    expect(
      one
        .response(Response.json({}, { status: 500 }))
        .headers.get("Server-Timing"),
    ).toContain("profile;dur=");
    expect(
      two.response(Response.json({})).headers.get("Server-Timing"),
    ).not.toContain("profile");
  });
});
