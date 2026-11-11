import { describe, expect, it } from "vitest";
import { supabaseTestConfig } from "./supabase-config";

const config = {
  TEST_SUPABASE_URL: "http://127.0.0.1:54321",
  TEST_SUPABASE_PUBLISHABLE_KEY: "local-publishable",
  TEST_SUPABASE_SECRET_KEY: "local-secret",
};

describe("Supabase integration configuration", () => {
  it("does not use application credentials as test credentials", () => {
    expect(() =>
      supabaseTestConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
        SUPABASE_SECRET_KEY: "production-secret",
      }),
    ).toThrow("Integration tests require TEST_SUPABASE_URL");
  });

  it.each(Object.keys(config))(
    "rejects an empty %s before a test can connect",
    (key) => {
      expect(() => supabaseTestConfig({ ...config, [key]: " " })).toThrow(
        "Integration tests require",
      );
    },
  );

  it.each([
    "https://production.supabase.co",
    "https://localhost.example.com",
    "file://localhost/tmp/supabase",
  ])("rejects nonlocal or non-HTTP targets: %s", (url) => {
    expect(() =>
      supabaseTestConfig({ ...config, TEST_SUPABASE_URL: url }),
    ).toThrow("only support a local");
  });

  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
  ])("accepts explicitly configured local instances: %s", (url) => {
    expect(supabaseTestConfig({ ...config, TEST_SUPABASE_URL: url })).toEqual({
      url,
      publishableKey: "local-publishable",
      secretKey: "local-secret",
    });
  });
});
