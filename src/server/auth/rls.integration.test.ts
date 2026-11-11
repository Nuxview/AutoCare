import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseTestConfig } from "@/test/supabase-config";

const { url: SUPABASE_URL, publishableKey: SUPABASE_ANON_KEY, secretKey: SERVICE_ROLE_KEY } = supabaseTestConfig();

describe("PART A: Real Row-Level Security (RLS) enforcement", () => {
  const timestamp = Date.now();
  const testUserEmail = `rls_member_${timestamp}@example.com`;
  const testUserPassword = "SecurePassword123!";

  let adminClient: SupabaseClient;
  let authenticatedAnonClient: SupabaseClient;
  let unauthenticatedAnonClient: SupabaseClient;

  let testUserId: string;
  let garageAId: string;
  let garageBId: string;
  let shopAId: string;
  let shopBId: string;
  let vehicleAId: string;
  let vehicleBId: string;
  let bookingAId: string;
  let bookingBId: string;
  let jobAId: string;
  let jobBId: string;
  let invoiceAId: string;
  let invoiceBId: string;

  /**
   * Seeds test tenants, auth user, memberships, and related records via admin client.
   *
   * @returns Promise resolving when setup completes.
   */
  beforeAll(async () => {
    adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create a real auth user via the admin API
    const { data: authUser, error: authError } =
      await adminClient.auth.admin.createUser({
        email: testUserEmail,
        password: testUserPassword,
        email_confirm: true,
      });
    expect(authError).toBeNull();
    testUserId = authUser.user!.id;

    // 2. Insert corresponding profile
    const { error: profileError } = await adminClient.from("profiles").insert({
      id: testUserId,
      email: testUserEmail,
      first_name: "ActiveMember",
      last_name: "GarageA",
    });
    expect(profileError).toBeNull();

    // 3. Seed two separate garages (Garage A and Garage B)
    const { data: garageA, error: garageAError } = await adminClient
      .from("franchises")
      .insert({
        name: `RLS Garage A ${timestamp}`,
        slug: `rls-garage-a-${timestamp}`,
        email: `garage_a_${timestamp}@example.com`,
        owner_id: testUserId,
      })
      .select("id")
      .single();
    expect(garageAError).toBeNull();
    expect(garageA).not.toBeNull();
    garageAId = garageA!.id;

    const { data: garageB, error: garageBError } = await adminClient
      .from("franchises")
      .insert({
        name: `RLS Garage B ${timestamp}`,
        slug: `rls-garage-b-${timestamp}`,
        email: `garage_b_${timestamp}@example.com`,
        owner_id: testUserId,
      })
      .select("id")
      .single();
    expect(garageBError).toBeNull();
    expect(garageB).not.toBeNull();
    garageBId = garageB!.id;

    // 4. Create shops for both garages
    const { data: shopA, error: shopAError } = await adminClient
      .from("shops")
      .insert({
        franchise_id: garageAId,
        name: "Shop A",
        slug: `shop-a-${timestamp}`,
        email: `shop_a_${timestamp}@example.com`,
        address: "100 A Road",
        county: "Nairobi",
      })
      .select("id")
      .single();
    expect(shopAError).toBeNull();
    expect(shopA).not.toBeNull();
    shopAId = shopA!.id;

    const { data: shopB, error: shopBError } = await adminClient
      .from("shops")
      .insert({
        franchise_id: garageBId,
        name: "Shop B",
        slug: `shop-b-${timestamp}`,
        email: `shop_b_${timestamp}@example.com`,
        address: "200 B Road",
        county: "Nairobi",
      })
      .select("id")
      .single();
    expect(shopBError).toBeNull();
    expect(shopB).not.toBeNull();
    shopBId = shopB!.id;

    // 5. Assign user as active member of Garage A ONLY
    const { error: memberError } = await adminClient.from("memberships").insert({
      user_id: testUserId,
      franchise_id: garageAId,
      shop_id: shopAId,
      role: "MECHANIC",
      is_active: true,
    });
    expect(memberError).toBeNull();

    // 6. Seed vehicles, bookings, jobs, and invoices for Garage A and Garage B
    const { data: vehicleA, error: vehicleAError } = await adminClient
      .from("vehicles")
      .insert({
        owner_id: testUserId,
        registration: `KAA${timestamp.toString().slice(-4)}A`,
        make: "Toyota",
        model: "Hilux",
        year: 2022,
      })
      .select("id")
      .single();
    expect(vehicleAError).toBeNull();
    expect(vehicleA).not.toBeNull();
    vehicleAId = vehicleA!.id;

    const { data: vehicleB, error: vehicleBError } = await adminClient
      .from("vehicles")
      .insert({
        owner_id: testUserId,
        registration: `KAB${timestamp.toString().slice(-4)}B`,
        make: "Isuzu",
        model: "D-Max",
        year: 2022,
      })
      .select("id")
      .single();
    expect(vehicleBError).toBeNull();
    expect(vehicleB).not.toBeNull();
    vehicleBId = vehicleB!.id;

    const { data: bookingA, error: bookingAError } = await adminClient
      .from("bookings")
      .insert({
        reference: `BK-A-${timestamp}`,
        franchise_id: garageAId,
        shop_id: shopAId,
        customer_id: testUserId,
        vehicle_id: vehicleAId,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        status: "CONFIRMED",
      })
      .select("id")
      .single();
    expect(bookingAError).toBeNull();
    expect(bookingA).not.toBeNull();
    bookingAId = bookingA!.id;

    const { data: bookingB, error: bookingBError } = await adminClient
      .from("bookings")
      .insert({
        reference: `BK-B-${timestamp}`,
        franchise_id: garageBId,
        shop_id: shopBId,
        customer_id: testUserId,
        vehicle_id: vehicleBId,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        status: "CONFIRMED",
      })
      .select("id")
      .single();
    expect(bookingBError).toBeNull();
    expect(bookingB).not.toBeNull();
    bookingBId = bookingB!.id;

    const { data: jobA, error: jobAError } = await adminClient
      .from("jobs")
      .insert({
        reference: `JB-A-${timestamp}`,
        franchise_id: garageAId,
        shop_id: shopAId,
        booking_id: bookingAId,
        customer_id: testUserId,
        vehicle_id: vehicleAId,
        status: "OPEN",
      })
      .select("id")
      .single();
    expect(jobAError).toBeNull();
    expect(jobA).not.toBeNull();
    jobAId = jobA!.id;

    const { data: jobB, error: jobBError } = await adminClient
      .from("jobs")
      .insert({
        reference: `JB-B-${timestamp}`,
        franchise_id: garageBId,
        shop_id: shopBId,
        booking_id: bookingBId,
        customer_id: testUserId,
        vehicle_id: vehicleBId,
        status: "OPEN",
      })
      .select("id")
      .single();
    expect(jobBError).toBeNull();
    expect(jobB).not.toBeNull();
    jobBId = jobB!.id;

    const { data: invoiceA, error: invoiceAError } = await adminClient
      .from("invoices")
      .insert({
        number: `INV-A-${timestamp}`,
        franchise_id: garageAId,
        shop_id: shopAId,
        customer_id: testUserId,
        job_id: jobAId,
        status: "ISSUED",
        subtotal: 5000,
        tax_amount: 800,
        total_amount: 5800,
      })
      .select("id")
      .single();
    expect(invoiceAError).toBeNull();
    expect(invoiceA).not.toBeNull();
    invoiceAId = invoiceA!.id;

    const { data: invoiceB, error: invoiceBError } = await adminClient
      .from("invoices")
      .insert({
        number: `INV-B-${timestamp}`,
        franchise_id: garageBId,
        shop_id: shopBId,
        customer_id: testUserId,
        job_id: jobBId,
        status: "ISSUED",
        subtotal: 7500,
        tax_amount: 1200,
        total_amount: 8700,
      })
      .select("id")
      .single();
    expect(invoiceBError).toBeNull();
    expect(invoiceB).not.toBeNull();
    invoiceBId = invoiceB!.id;

    // 7. Initialize unauthenticated anon client
    unauthenticatedAnonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 8. Sign in the real auth user with anon client to obtain a genuine session
    authenticatedAnonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sessionData, error: signInError } =
      await authenticatedAnonClient.auth.signInWithPassword({
        email: testUserEmail,
        password: testUserPassword,
      });
    expect(signInError).toBeNull();
    expect(sessionData.session).toBeDefined();
    expect(sessionData.user).not.toBeNull();
    expect(sessionData.user!.id).toBe(testUserId);
  }, 30000);

  /**
   * Removes all seeded records and the test user after tests execute.
   *
   * @returns Promise resolving when teardown completes.
   */
  afterAll(async () => {
    if (adminClient && testUserId) {
      await adminClient.from("invoices").delete().in("id", [invoiceAId, invoiceBId]);
      await adminClient.from("jobs").delete().in("id", [jobAId, jobBId]);
      await adminClient.from("bookings").delete().in("id", [bookingAId, bookingBId]);
      await adminClient.from("vehicles").delete().in("id", [vehicleAId, vehicleBId]);
      await adminClient.from("memberships").delete().eq("user_id", testUserId);
      await adminClient.from("shops").delete().in("id", [shopAId, shopBId]);
      await adminClient.from("franchises").delete().in("id", [garageAId, garageBId]);
      await adminClient.from("profiles").delete().eq("id", testUserId);
      await adminClient.auth.admin.deleteUser(testUserId);
    }
  }, 30000);

  it("asserts a Garage A member can read Garage A rows and receives zero rows for Garage B across jobs, bookings, and invoices", async () => {
    // Query Garage A and Garage B rows as authenticated Garage A member
    const { data: jobsA, error: jobsAError } = await authenticatedAnonClient
      .from("jobs")
      .select("id,franchise_id")
      .eq("franchise_id", garageAId);
    expect(jobsAError).toBeNull();
    expect(jobsA?.length).toBeGreaterThan(0);

    const { data: jobsB } = await authenticatedAnonClient
      .from("jobs")
      .select("id,franchise_id")
      .eq("franchise_id", garageBId);
    expect(jobsB ?? []).toHaveLength(0);

    const { data: bookingsA, error: bookingsAError } = await authenticatedAnonClient
      .from("bookings")
      .select("id,franchise_id")
      .eq("franchise_id", garageAId);
    expect(bookingsAError).toBeNull();
    expect(bookingsA?.length).toBeGreaterThan(0);

    const { data: bookingsB } = await authenticatedAnonClient
      .from("bookings")
      .select("id,franchise_id")
      .eq("franchise_id", garageBId);
    expect(bookingsB ?? []).toHaveLength(0);

    const { data: invoicesA, error: invoicesAError } = await authenticatedAnonClient
      .from("invoices")
      .select("id,franchise_id")
      .eq("franchise_id", garageAId);
    expect(invoicesAError).toBeNull();
    expect(invoicesA?.length).toBeGreaterThan(0);

    const { data: invoicesB } = await authenticatedAnonClient
      .from("invoices")
      .select("id,franchise_id")
      .eq("franchise_id", garageBId);
    expect(invoicesB ?? []).toHaveLength(0);
  });

  it("asserts a write to a Garage B row fails for a user who only belongs to Garage A", async () => {
    // Attempt inserting a job under Garage B using Garage A member session
    const { error: insertError } = await authenticatedAnonClient.from("jobs").insert({
      reference: `EXPLOIT-${timestamp}`,
      franchise_id: garageBId,
      shop_id: shopBId,
      customer_id: testUserId,
      vehicle_id: vehicleBId,
      status: "OPEN",
    });

    expect(insertError).not.toBeNull();
  });

  it("asserts an unauthenticated anon client gets zero rows across jobs, bookings, and invoices", async () => {
    // Verify an unauthenticated client receives zero accessible rows
    const { data: anonJobs } = await unauthenticatedAnonClient
      .from("jobs")
      .select("id,franchise_id");
    expect(anonJobs ?? []).toHaveLength(0);

    const { data: anonBookings } = await unauthenticatedAnonClient
      .from("bookings")
      .select("id,franchise_id");
    expect(anonBookings ?? []).toHaveLength(0);

    const { data: anonInvoices } = await unauthenticatedAnonClient
      .from("invoices")
      .select("id,franchise_id");
    expect(anonInvoices ?? []).toHaveLength(0);
  });
});
