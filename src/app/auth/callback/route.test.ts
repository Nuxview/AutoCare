import { beforeEach, expect, it, vi } from "vitest";

const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ APP_URL: "https://autocare.example" }) }));
import { GET } from "./route";

beforeEach(() => exchange.mockReset());

it("exchanges recovery codes and preserves the flow identifier", async () => {
  exchange.mockResolvedValue({ error: null });
  const response = await GET(new Request("https://untrusted.example/auth/callback?code=test&mode=reset&sb_flow_id=flow"));
  expect(exchange).toHaveBeenCalledWith("test", { flowId: "flow" });
  expect(response.headers.get("location")).toBe("https://autocare.example/login?mode=reset");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("uses a fixed dashboard destination instead of arbitrary next URLs", async () => {
  exchange.mockResolvedValue({ error: null });
  const response = await GET(new Request("https://autocare.example/auth/callback?code=test&next=https://evil.example"));
  expect(response.headers.get("location")).toBe("https://autocare.example/dashboard");
});

it.each([null, "expired"])("rejects a missing or invalid code: %s", async (code) => {
  exchange.mockResolvedValue({ error: { message: "Invalid code" } });
  const response = await GET(new Request(`https://autocare.example/auth/callback${code ? `?code=${code}` : ""}`));
  expect(response.headers.get("location")).toBe("https://autocare.example/login?authError=invalid_link");
  if (!code) expect(exchange).not.toHaveBeenCalled();
});
