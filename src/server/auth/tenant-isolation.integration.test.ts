import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { supabaseTestConfig } from "@/test/supabase-config";

const { url: SUPABASE_URL, publishableKey: SUPABASE_ANON_KEY } =
  supabaseTestConfig();
const GARAGE_B_ID = "22222222-2222-4222-8222-222222222222";
const USER_A_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

describe("Supabase anonymous access and invalid sessions", () => {
  it("asserts unauthenticated anon request receives zero rows across protected tables", async () => {
    // Tests that anonymous access via anon key is strictly denied or returns 0 rows
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const tables = ["jobs", "invoices", "bookings", "profiles"] as const;

    await Promise.all(
      tables.map(async (table) => {
        const { data, error } = await client.from(table).select("*");
        expect(error).toBeNull();
        expect(data).toHaveLength(0);
      }),
    );
  });

  it("asserts unauthenticated anon request cannot write to Garage B records", async () => {
    // Verifies write attempts with anon key fail at the database boundary
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.from("jobs").insert({
      id: "99999999-9999-4999-8999-999999999999",
      franchise_id: GARAGE_B_ID,
      shop_id: "88888888-8888-4888-8888-888888888888",
      reference: "JOB-EXPLOIT",
      customer_id: USER_A_ID,
      vehicle_id: "77777777-7777-4777-8777-777777777777",
    });

    expect(error).toMatchObject({ code: "42501" });
  });

  it("rejects a malformed authentication token without returning garage data", async () => {
    // Simulates an authenticated user client with scoped token attempting to fetch Garage B records directly
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user_a_garage_a`,
        },
      },
    });

    const { data, error, status } = await client
      .from("jobs")
      .select("*")
      .eq("franchise_id", GARAGE_B_ID);
    expect(status).toBe(401);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
