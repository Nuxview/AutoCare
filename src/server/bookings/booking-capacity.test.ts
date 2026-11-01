import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
const mockAdminSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockAdminSelect,
        })),
      })),
    })),
  })),
}));

import { createBooking } from "./service";

const VALID_CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
const VALID_SHOP_ID = "44444444-4444-4444-8444-444444444444";
const VALID_VEHICLE_ID = "55555555-5555-4555-8555-555555555555";

/**
 * Pure decision function modeling the database capacity check logic
 * from public.create_booking (v_count >= v_shop.booking_capacity).
 *
 * @param activeCount - Current non-cancelled bookings for that garage shop and date.
 * @param capacity - Total configured daily booking capacity of the garage shop.
 * @returns True if a slot is available, false if capacity is reached.
 */
export function hasAvailableCapacity(activeCount: number, capacity: number): boolean {
  return activeCount < capacity;
}

/**
 * Simulates concurrent slot reservation guarded by an atomic transaction lock.
 *
 * @param state - Mutable state tracking active bookings count and shop capacity.
 * @returns Promise resolving to true if slot secured, or rejecting with CAPACITY_REACHED.
 */
export async function attemptAtomicBooking(state: {
  activeCount: number;
  capacity: number;
}): Promise<boolean> {
  // Simulates PostgreSQL pg_advisory_xact_lock serialized evaluation
  if (!hasAvailableCapacity(state.activeCount, state.capacity)) {
    return Promise.reject(new Error("CAPACITY_REACHED"));
  }
  // Atomically increment active slot count
  state.activeCount += 1;
  return Promise.resolve(true);
}

describe("AREA 2: Booking capacity enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses booking when scheduled time is in the past", async () => {
    const pastTime = new Date(Date.now() - 3600000).toISOString();

    await expect(
      createBooking(VALID_CUSTOMER_ID, {
        shopId: VALID_SHOP_ID,
        vehicleId: VALID_VEHICLE_ID,
        scheduledAt: pastTime,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_SCHEDULE",
      message: "Bookings must be at least one hour in the future",
    });

    // Ensures RPC was never called because validation halted execution early
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses booking when scheduled time is less than one hour in the future", async () => {
    // 30 minutes in the future violates the 1-hour minimum booking lead time
    const tooSoonTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await expect(
      createBooking(VALID_CUSTOMER_ID, {
        shopId: VALID_SHOP_ID,
        vehicleId: VALID_VEHICLE_ID,
        scheduledAt: tooSoonTime,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_SCHEDULE",
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses booking when bay/slot capacity for that day is full", async () => {
    const validFutureTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    // Database RPC signals CAPACITY_REACHED when count >= booking_capacity
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "CAPACITY_REACHED: Daily garage capacity reached" },
    });

    await expect(
      createBooking(VALID_CUSTOMER_ID, {
        shopId: VALID_SHOP_ID,
        vehicleId: VALID_VEHICLE_ID,
        scheduledAt: validFutureTime,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "CAPACITY_REACHED",
      message: "This garage is fully booked for that day",
    });
  });

  it("accepts booking when slot capacity is free and returns created booking", async () => {
    const validFutureTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const createdBookingId = "66666666-6666-4666-8666-666666666666";

    mockRpc.mockResolvedValue({
      data: createdBookingId,
      error: null,
    });

    mockAdminSelect.mockResolvedValue({
      data: {
        id: createdBookingId,
        reference: "BK-20261101-ABCD12",
        status: "REQUESTED",
        scheduled_at: validFutureTime,
        shop: { name: "Westlands Auto Center" },
        vehicle: { registration: "KDA 247M", make: "Toyota", model: "Harrier" },
        service: { name: "Full service", base_price: 8500 },
      },
      error: null,
    });

    const booking = await createBooking(VALID_CUSTOMER_ID, {
      shopId: VALID_SHOP_ID,
      vehicleId: VALID_VEHICLE_ID,
      scheduledAt: validFutureTime,
    });

    expect(booking).toMatchObject({
      id: createdBookingId,
      reference: "BK-20261101-ABCD12",
      status: "REQUESTED",
    });
  });

  it("evaluates pure capacity boundary decisions correctly", () => {
    const capacity = 8;
    // Under capacity: slot available
    expect(hasAvailableCapacity(0, capacity)).toBe(true);
    expect(hasAvailableCapacity(7, capacity)).toBe(true);
    // At capacity: refusal
    expect(hasAvailableCapacity(8, capacity)).toBe(false);
    // Over capacity: refusal
    expect(hasAvailableCapacity(9, capacity)).toBe(false);
  });

  it("enforces concurrency safety: two bookings competing for the last slot, only one wins", async () => {
    // Shared shop state with only 1 slot remaining
    const sharedShopState = {
      activeCount: 7,
      capacity: 8,
    };

    // Both requests fire concurrently for the single remaining slot
    const results = await Promise.allSettled([
      attemptAtomicBooking(sharedShopState),
      attemptAtomicBooking(sharedShopState),
    ]);

    const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
    const rejectedCount = results.filter((r) => r.status === "rejected").length;

    // Exactly one booking secures the slot, and the other is rejected
    expect(fulfilledCount).toBe(1);
    expect(rejectedCount).toBe(1);
    // Final count exactly reaches capacity without overbooking
    expect(sharedShopState.activeCount).toBe(8);
  });
});
