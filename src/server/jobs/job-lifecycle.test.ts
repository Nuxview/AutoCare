import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Variables referenced in hoisted vi.mock factories must be declared with vi.hoisted()
const { mockJobAccess, mockRpc, mockAdminFrom } = vi.hoisted(() => ({
  mockJobAccess: vi.fn(),
  mockRpc: vi.fn(),
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "advisor@garage.com",
    firstName: "Juma",
    lastName: "Ochieng",
    globalRole: "CUSTOMER",
  })),
  requireTenantMembership: vi.fn(async () => ({
    user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    membership: { franchise_id: "11111111-1111-4111-8111-111111111111", role: "SERVICE_ADVISOR" },
  })),
}));

vi.mock("@/server/garage/scope", () => ({
  jobAccess: mockJobAccess,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockAdminFrom,
  })),
}));

import { createJobFromBooking } from "./service";
import { PATCH as updateJobStatusRoute } from "@/app/api/jobs/status/route";
import { isValidJobTransition } from "@/server/jobs/transitions";

const VALID_BOOKING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VALID_JOB_ID = "77777777-7777-4777-8777-777777777777";

describe("AREA 3: Job lifecycle transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial transition from Booking to Job (createJobFromBooking)", () => {
    it("refuses job creation when booking status is not confirmed or checked-in", async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: VALID_BOOKING_ID,
                    franchise_id: "11111111-1111-4111-8111-111111111111",
                    shop_id: "22222222-2222-4222-8222-222222222222",
                    status: "REQUESTED",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // RPC checks booking status and raises INVALID_BOOKING_STATUS
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "INVALID_BOOKING_STATUS: Booking must be confirmed" },
      });

      await expect(
        createJobFromBooking(VALID_BOOKING_ID),
      ).rejects.toMatchObject({
        status: 409,
        code: "INVALID_BOOKING_STATUS",
        message: "Confirm or check in the booking before creating a job",
      });
    });

    it("refuses job creation when a job already exists for the booking", async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: VALID_BOOKING_ID,
                    franchise_id: "11111111-1111-4111-8111-111111111111",
                    shop_id: "22222222-2222-4222-8222-222222222222",
                    status: "CONFIRMED",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "JOB_EXISTS: A job already exists for this booking" },
      });

      await expect(
        createJobFromBooking(VALID_BOOKING_ID),
      ).rejects.toMatchObject({
        status: 409,
        code: "JOB_EXISTS",
        message: "A job already exists for this booking",
      });
    });

    it("successfully creates an OPEN job from a confirmed booking (happy path)", async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: VALID_BOOKING_ID,
                    franchise_id: "11111111-1111-4111-8111-111111111111",
                    shop_id: "22222222-2222-4222-8222-222222222222",
                    status: "CONFIRMED",
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
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: VALID_JOB_ID,
                    reference: "JOB-261101-ABC123",
                    status: "OPEN",
                    franchise_id: "11111111-1111-4111-8111-111111111111",
                    shop_id: "22222222-2222-4222-8222-222222222222",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      mockRpc.mockResolvedValue({
        data: VALID_JOB_ID,
        error: null,
      });

      const job = await createJobFromBooking(VALID_BOOKING_ID);
      expect(job).toMatchObject({
        id: VALID_JOB_ID,
        status: "OPEN",
        reference: "JOB-261101-ABC123",
      });
    });
  });

  describe("Subsequent Job Stage Transitions", () => {
    /**
     * Helper to invoke the PATCH status route handler with mock request payload.
     *
     * @param jobId - Identifier of the job to update.
     * @param status - Target status string.
     * @returns Promise resolving to the HTTP Response.
     */
    function callStatusPatch(jobId: string, status: string): Promise<Response> {
      const request = new Request("http://localhost:3000/api/jobs/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status }),
      });
      return updateJobStatusRoute(request);
    }

    it("allows legal happy-path transitions: OPEN -> IN_PROGRESS -> READY -> COMPLETED", async () => {
      // Step 1: Transition OPEN -> IN_PROGRESS
      mockJobAccess.mockResolvedValue({
        job: { id: VALID_JOB_ID, status: "OPEN", booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      });
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "jobs" || table === "bookings") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      });

      const res1 = await callStatusPatch(VALID_JOB_ID, "IN_PROGRESS");
      const json1 = await res1.json();
      expect(res1.status).toBe(200);
      expect(json1.ok).toBe(true);

      // Step 2: Transition IN_PROGRESS -> READY (with tasks complete)
      mockJobAccess.mockResolvedValue({
        job: {
          id: VALID_JOB_ID,
          status: "IN_PROGRESS",
          customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      });
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "repair_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ status: "COMPLETED" }, { status: "COMPLETED" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "jobs" || table === "bookings") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "notifications") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const res2 = await callStatusPatch(VALID_JOB_ID, "READY");
      const json2 = await res2.json();
      expect(res2.status).toBe(200);
      expect(json2.ok).toBe(true);

      // Step 3: Transition READY -> COMPLETED
      mockJobAccess.mockResolvedValue({
        job: {
          id: VALID_JOB_ID,
          status: "READY",
          customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      });
      const res3 = await callStatusPatch(VALID_JOB_ID, "COMPLETED");
      const json3 = await res3.json();
      expect(res3.status).toBe(200);
      expect(json3.ok).toBe(true);
    });

    it("rejects illegal transition 1: cannot transition a COMPLETED job back to IN_PROGRESS", async () => {
      mockJobAccess.mockResolvedValue({
        job: { id: VALID_JOB_ID, status: "COMPLETED", booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      });

      const res = await callStatusPatch(VALID_JOB_ID, "IN_PROGRESS");
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("JOB_CLOSED");
      expect(json.error.message).toBe("This repair is already closed");
    });

    it("rejects illegal transition 2: cannot transition a CANCELLED job to READY", async () => {
      mockJobAccess.mockResolvedValue({
        job: { id: VALID_JOB_ID, status: "CANCELLED", booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      });

      const res = await callStatusPatch(VALID_JOB_ID, "READY");
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("JOB_CLOSED");
      expect(json.error.message).toBe("This repair is already closed");
    });

    it("rejects illegal transition 3: cannot transition to READY or COMPLETED while repair steps are incomplete", async () => {
      mockJobAccess.mockResolvedValue({
        job: {
          id: VALID_JOB_ID,
          status: "IN_PROGRESS",
          customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        },
      });
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "repair_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                // One task is completed, but another is still pending
                data: [{ status: "COMPLETED" }, { status: "PENDING" }],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      const res = await callStatusPatch(VALID_JOB_ID, "READY");
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("TASKS_INCOMPLETE");
      expect(json.error.message).toBe("Complete every repair step first");
    });

    it("rejects illegal stage skip: cannot jump OPEN -> COMPLETED via the status route", async () => {
      mockJobAccess.mockResolvedValue({
        job: { id: VALID_JOB_ID, status: "OPEN", booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      });
      const res = await callStatusPatch(VALID_JOB_ID, "COMPLETED");
      const json = await res.json();
      expect(res.status).toBe(409);
      expect(json.error.code).toBe("INVALID_STAGE_TRANSITION");
    });

    it("evaluates pure lifecycle transition matrix to detect illegal intermediate skips", () => {
      // Happy path sequential transitions
      expect(isValidJobTransition("OPEN", "IN_PROGRESS")).toBe(true);
      expect(isValidJobTransition("IN_PROGRESS", "READY")).toBe(true);
      expect(isValidJobTransition("READY", "COMPLETED")).toBe(true);

      // Illegal jumps: jumping from OPEN directly to COMPLETED skipping diagnostic and progress stages
      expect(isValidJobTransition("OPEN", "COMPLETED")).toBe(false);
      // Illegal jumps: jumping from DIAGNOSING directly to READY
      expect(isValidJobTransition("DIAGNOSING", "READY")).toBe(false);
      // Illegal backward transition: COMPLETED back to IN_PROGRESS
      expect(isValidJobTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
      // Illegal backward transition: CANCELLED back to OPEN
      expect(isValidJobTransition("CANCELLED", "OPEN")).toBe(false);
    });
  });
});
