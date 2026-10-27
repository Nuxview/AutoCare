import { describe, expect, it } from "vitest";
import { authFormSchema, bookingSchema, registerSchema, vehicleSchema } from "./validation";

describe("domain validation", () => {
  it("requires garage onboarding fields", () => { const result = registerSchema.safeParse({ accountType: "garage", firstName: "Amina", lastName: "Kamau", email: "owner@example.com", phone: "0712345678", password: "SecurePass1" }); expect(result.success).toBe(false); });
  it("shows the registration password rules before submitting", () => {
    const result = authFormSchema.safeParse({
      mode: "register", accountType: "garage", firstName: "Amina", lastName: "Kamau",
      email: "owner@example.com", phone: "0712345678", password: "weakpassword",
      businessName: "Amina Auto", shopName: "Westlands", county: "Nairobi", address: "Waiyaki Way",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.password).toContain("Add an uppercase letter");
  });
  it("accepts a complete garage registration form", () => {
    expect(authFormSchema.safeParse({
      mode: "register", accountType: "garage", firstName: "Amina", lastName: "Kamau",
      email: "owner@example.com", phone: "0712345678", password: "SecurePass1",
      businessName: "Amina Auto", shopName: "Westlands", county: "Nairobi", address: "Waiyaki Way",
    }).success).toBe(true);
  });
  it("accepts a Kenyan registration-style vehicle record", () => { expect(vehicleSchema.safeParse({ registration: "KDA 247M", make: "Toyota", model: "Harrier", year: 2018 }).success).toBe(true); });
  it("rejects malformed booking identifiers", () => { expect(bookingSchema.safeParse({ shopId: "bad", vehicleId: "bad", scheduledAt: new Date().toISOString() }).success).toBe(false); });
});
