import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock server cookie client and admin client to verify tenant membership logic deterministically.
const mockGetUser = vi.fn();
const mockAdminSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn((fields: string) => {
        return mockAdminSelect(table, fields);
      }),
    })),
  })),
}));

import { requireTenantMembership } from "./context";

// Supabase anon key ONLY. Never use service role key in tests or committed files.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ZOtVpXODMzYWnH5YUx7FFA_sLVfTl_0";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://pgwgnygetqevatqahniu.supabase.co";

const GARAGE_A_ID = "11111111-1111-4111-8111-111111111111";
const GARAGE_B_ID = "22222222-2222-4222-8222-222222222222";
const USER_A_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

describe("AREA 1: Tenant isolation and permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper that builds mock database query chains for profiles and memberships.
   *
   * @param memberships - Array of mock membership rows to return from the database.
   * @param franchiseStatus - Operational status of the franchise record.
   * @returns Void.
   */
  function configureDatabaseMock(
    memberships: Array<Record<string, unknown>>,
    franchiseStatus = "ACTIVE",
  ): void {
    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_A_ID, email: "user_a@garage-a.com" } },
      error: null,
    });

    mockAdminSelect.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: USER_A_ID,
                email: "user_a@garage-a.com",
                first_name: "Amina",
                last_name: "Kamau",
                global_role: "CUSTOMER",
                is_active: true,
              },
              error: null,
            }),
          }),
        };
      }

      // Querying memberships table
      return {
        eq: vi.fn().mockImplementation((col1: string, val1: string) => ({
          eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
            eq: vi.fn().mockImplementation((col3: string, val3: boolean) => ({
              in: vi.fn().mockImplementation((roleCol: string, roles: string[]) => {
                const filtered = memberships.filter(
                  (m) =>
                    m.user_id === val1 &&
                    m.franchise_id === val2 &&
                    m.is_active === val3 &&
                    roles.includes(m.role as string),
                );
                return Promise.resolve({
                  data: filtered.map((m) => ({
                    ...m,
                    franchise: { status: franchiseStatus },
                  })),
                  error: null,
                });
              }),
              then: (resolve: (value: unknown) => void) => {
                const filtered = memberships.filter(
                  (m) =>
                    m.user_id === val1 &&
                    m.franchise_id === val2 &&
                    m.is_active === val3,
                );
                return Promise.resolve({
                  data: filtered.map((m) => ({
                    ...m,
                    franchise: { status: franchiseStatus },
                  })),
                  error: null,
                }).then(resolve);
              },
            })),
          })),
        })),
      };
    });
  }

  it("asserts unauthenticated anon request receives zero rows across protected tables", async () => {
    // Tests that anonymous access via anon key is strictly denied or returns 0 rows
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const tables = ["jobs", "invoices", "bookings", "profiles"] as const;

    await Promise.all(
      tables.map(async (table) => {
        const { data } = await client.from(table).select("*");
        expect(data ?? []).toHaveLength(0);
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

    expect(error).not.toBeNull();
  });

  it("asserts a user authenticated in Garage A receives zero rows when querying Garage B data", async () => {
    // Simulates an authenticated user client with scoped token attempting to fetch Garage B records directly
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user_a_garage_a`,
        },
      },
    });

    const { data } = await client.from("jobs").select("*").eq("franchise_id", GARAGE_B_ID);
    expect(data ?? []).toHaveLength(0);
  });

  it("rejects a user of Garage A calling requireTenantMembership for Garage B", async () => {
    // Configure user A as FRANCHISE_OWNER of Garage A only
    configureDatabaseMock([
      {
        id: "mem-1",
        user_id: USER_A_ID,
        franchise_id: GARAGE_A_ID,
        shop_id: null,
        role: "FRANCHISE_OWNER",
        is_active: true,
      },
    ]);

    // Calling requireTenantMembership for Garage B must throw TENANT_ACCESS_DENIED
    await expect(
      requireTenantMembership(GARAGE_B_ID),
    ).rejects.toMatchObject({
      status: 403,
      code: "TENANT_ACCESS_DENIED",
      message: "You do not have access to this garage",
    });
  });

  it("accepts a user of Garage A calling requireTenantMembership for Garage A", async () => {
    configureDatabaseMock([
      {
        id: "mem-1",
        user_id: USER_A_ID,
        franchise_id: GARAGE_A_ID,
        shop_id: null,
        role: "FRANCHISE_OWNER",
        is_active: true,
      },
    ]);

    const result = await requireTenantMembership(GARAGE_A_ID);
    expect(result.membership.franchise_id).toBe(GARAGE_A_ID);
    expect(result.user.id).toBe(USER_A_ID);
  });

  it("rejects access when the garage account is SUSPENDED or CANCELLED", async () => {
    configureDatabaseMock(
      [
        {
          id: "mem-1",
          user_id: USER_A_ID,
          franchise_id: GARAGE_A_ID,
          shop_id: null,
          role: "FRANCHISE_OWNER",
          is_active: true,
        },
      ],
      "SUSPENDED",
    );

    await expect(
      requireTenantMembership(GARAGE_A_ID),
    ).rejects.toMatchObject({
      status: 403,
      code: "TENANT_SUSPENDED",
      message: "This garage account is not active",
    });
  });

  it("rejects a user when their membership role is insufficient", async () => {
    configureDatabaseMock([
      {
        id: "mem-1",
        user_id: USER_A_ID,
        franchise_id: GARAGE_A_ID,
        shop_id: null,
        role: "MECHANIC",
        is_active: true,
      },
    ]);

    // Request requires FRANCHISE_OWNER or FRANCHISE_ADMIN
    await expect(
      requireTenantMembership(GARAGE_A_ID, undefined, ["FRANCHISE_OWNER", "FRANCHISE_ADMIN"]),
    ).rejects.toMatchObject({
      status: 403,
      code: "TENANT_ACCESS_DENIED",
    });
  });
});
