import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jar, setCookie } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  setCookie: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    set: setCookie,
  }),
}));
import { createClient } from "./server";

const cookieName = "sb-project-auth-token";
const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated" };
const fetchMock = vi.fn();
function accessToken(expiresAt: number) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, exp: expiresAt })).toString("base64url"),
    "mock-signature",
  ].join(".");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubEnv("FIELD_ENCRYPTION_KEY", "test-field-key");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  const session = {
    access_token: accessToken(Math.floor(Date.now() / 1000) - 3600),
    refresh_token: "old-refresh", expires_at: Math.floor(Date.now() / 1000) - 3600,
    token_type: "bearer", user,
  };
  jar.clear();
  jar.set(cookieName, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`);
  setCookie.mockReset().mockImplementation((name: string, value: string) => {
    if (value) jar.set(name, value); else jar.delete(name);
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API session refresh without proxy", () => {
  it("refreshes an expired session, verifies the user, and writes rotated cookies", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("/token?")
      ? Response.json({
          access_token: accessToken(Math.floor(Date.now() / 1000) + 3600),
          refresh_token: "rotated-refresh", token_type: "bearer", expires_in: 3600, user,
        })
      : Response.json(user));
    const client = await createClient();
    const result = await client.auth.getUser();
    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe(user.id);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/auth/v1/token", "/auth/v1/user",
    ]);
    expect(setCookie).toHaveBeenCalled();
    const saved = JSON.parse(Buffer.from(jar.get(cookieName)!.slice(7), "base64url").toString());
    expect(saved.refresh_token).toBe("rotated-refresh");
  });

  it("rejects a failed refresh and clears the expired session cookie", async () => {
    fetchMock.mockResolvedValue(Response.json({
      code: "refresh_token_not_found", message: "Invalid refresh token",
    }, { status: 400 }));
    const client = await createClient();
    const result = await client.auth.getUser();
    expect(result.error).not.toBeNull();
    expect(result.data.user).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jar.has(cookieName)).toBe(false);
  });
});
