import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// External boundary mocks for Supabase server cookie client and admin client
const { mockGetUser, mockAdminRpc, mockAdminFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockAdminRpc,
    from: mockAdminFrom,
  })),
}));

import { POST as createBookingRoute } from "@/app/api/bookings/route";
import { PATCH as updateJobStatusRoute } from "@/app/api/jobs/status/route";
import { POST as issueInvoiceRoute } from "@/app/api/jobs/invoice/route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_SHOP_ID = "22222222-2222-4222-8222-222222222222";
const TEST_VEHICLE_ID = "33333333-3333-4333-8333-333333333333";
const TEST_BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const TEST_JOB_ID = "55555555-5555-4555-8555-555555555555";
const TEST_INVOICE_ID = "66666666-6666-4666-8666-666666666666";
const TEST_FRANCHISE_ID = "77777777-7777-4777-8777-777777777777";

describe("PART B: Real API route integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Configures default authenticated user session and profile boundary response.
   *
   * @param userId - ID of the authenticated user to return.
   * @returns Void.
   */
  function configureAuthenticatedUser(userId = TEST_USER_ID): void {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: userId,
          email: "customer@example.com",
        },
      },
      error: null,
    });
  }

  describe("Route 1: POST /api/bookings (Create booking)", () => {
    it("handles successful booking creation and returns 201 with created booking payload", async () => {
      configureAuthenticatedUser();

      // Configure Supabase boundary responses
      mockAdminRpc.mockResolvedValue({
        data: TEST_BOOKING_ID,
        error: null,
      });

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: TEST_USER_ID,
                    email: "customer@example.com",
                    first_name: "John",
                    last_name: "Doe",
                    global_role: "CUSTOMER",
                    is_active: true,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: TEST_BOOKING_ID,
                    reference: "BK-20261106-0001",
                    shop_id: TEST_SHOP_ID,
                    vehicle_id: TEST_VEHICLE_ID,
                    customer_id: TEST_USER_ID,
                    status: "REQUESTED",
                    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
                    customer_notes: "Brake inspection",
                    shop: { name: "Downtown Garage" },
                    vehicle: { registration: "KDA 123A", make: "Toyota", model: "Vitz" },
                    service: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        return {};
      });

      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const request = new Request("http://localhost:3000/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: TEST_SHOP_ID,
          vehicleId: TEST_VEHICLE_ID,
          scheduledAt: futureDate,
          customerNotes: "Brake inspection",
        }),
      });

      const response = await createBookingRoute(request);
      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body).toHaveProperty("booking");
      expect(body.booking.id).toBe(TEST_BOOKING_ID);
      expect(body.booking.reference).toBe("BK-20261106-0001");
    });

    it("rejects invalid input schema with HTTP 400 and validation error details", async () => {
      configureAuthenticatedUser();

      // Send malformed payload violating Zod bookingSchema
      const request = new Request("http://localhost:3000/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: "not-a-valid-uuid",
          scheduledAt: "invalid-date",
        }),
      });

      const response = await createBookingRoute(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details).toBeDefined();
    });
  });

  describe("Route 2: PATCH /api/jobs/status (Update job status)", () => {
    it("handles valid status update and returns 200 with ok flag", async () => {
      configureAuthenticatedUser();

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: TEST_USER_ID,
                    email: "advisor@garage.com",
                    first_name: "Jane",
                    last_name: "Staff",
                    global_role: "CUSTOMER",
                    is_active: true,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "jobs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: TEST_JOB_ID,
                    booking_id: TEST_BOOKING_ID,
                    franchise_id: TEST_FRANCHISE_ID,
                    shop_id: TEST_SHOP_ID,
                    customer_id: "99999999-9999-4999-8999-999999999999",
                    status: "OPEN",
                    assigned_mechanic_id: null,
                    current_quote_id: null,
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "mem-1",
                          user_id: TEST_USER_ID,
                          franchise_id: TEST_FRANCHISE_ID,
                          shop_id: TEST_SHOP_ID,
                          role: "FRANCHISE_ADMIN",
                          is_active: true,
                          franchise: { status: "ACTIVE" },
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "bookings") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        return {};
      });

      const request = new Request("http://localhost:3000/api/jobs/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: TEST_JOB_ID,
          status: "IN_PROGRESS",
        }),
      });

      const response = await updateJobStatusRoute(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({ ok: true });
    });

    it("rejects invalid status payload with HTTP 400 and validation error", async () => {
      configureAuthenticatedUser();

      const request = new Request("http://localhost:3000/api/jobs/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "not-a-uuid",
          status: "NON_EXISTENT_STATUS",
        }),
      });

      const response = await updateJobStatusRoute(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Route 3: POST /api/jobs/invoice (Issue repair invoice)", () => {
    it("handles successful invoice issuance and returns 200 with generated invoice payload", async () => {
      configureAuthenticatedUser();

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: TEST_USER_ID,
                    email: "admin@garage.com",
                    first_name: "Admin",
                    last_name: "User",
                    global_role: "CUSTOMER",
                    is_active: true,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "invoices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: TEST_INVOICE_ID,
                    number: "INV-20261106-0001",
                    status: "ISSUED",
                    total_amount: 5800,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        return {};
      });

      mockAdminRpc.mockResolvedValue({
        data: TEST_INVOICE_ID,
        error: null,
      });

      const request = new Request("http://localhost:3000/api/jobs/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: TEST_JOB_ID,
        }),
      });

      const response = await issueInvoiceRoute(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("invoice");
      expect(body.invoice.id).toBe(TEST_INVOICE_ID);
      expect(body.invoice.number).toBe("INV-20261106-0001");
    });

    it("rejects unauthenticated request with HTTP 401 when session is absent", async () => {
      // Configure unauthenticated boundary condition
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Auth session missing"),
      });

      const request = new Request("http://localhost:3000/api/jobs/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: TEST_JOB_ID,
        }),
      });

      const response = await issueInvoiceRoute(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error.code).toBe("UNAUTHENTICATED");
    });
  });
});
