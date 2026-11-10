import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../../../proxy";

describe("session refresh proxy coverage", () => {
  it.each(["/api", "/api/me", "/api/bookings", "/api/auth/refresh", "/api/payments/stripe/webhook"])(
    "leaves %s session handling to the API handler", url => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    },
  );

  it.each(["/dashboard", "/dashboard/bookings", "/login", "/auth/callback", "/apiary"])(
    "keeps page session refresh for %s", url => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );

  it.each(["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/logo.png"])(
    "continues to skip static assets at %s", url => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    },
  );
});
