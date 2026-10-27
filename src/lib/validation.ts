import { z } from "zod";

export const loginSchema = z.object({ email: z.email().transform((v) => v.toLowerCase()), password: z.string().min(8).max(128) });

export const registerSchema = z.object({
  accountType: z.enum(["customer", "garage"]),
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.email().transform((v) => v.toLowerCase()),
  phone: z.string().min(9).max(20),
  password: z.string().min(10).max(128).regex(/[A-Z]/, "Add an uppercase letter").regex(/[a-z]/, "Add a lowercase letter").regex(/\d/, "Add a number"),
  businessName: z.string().trim().min(2).max(100).optional(),
  shopName: z.string().trim().min(2).max(100).optional(),
  county: z.string().trim().min(2).max(60).optional(),
  address: z.string().trim().min(3).max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.accountType === "garage") {
    for (const field of ["businessName", "shopName", "county", "address"] as const) {
      if (!value[field]) ctx.addIssue({ code: "custom", path: [field], message: "Required for garage accounts" });
    }
  }
});

export const authFormSchema = z.object({
  mode: z.enum(["login", "register"]),
  accountType: z.enum(["customer", "garage"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().optional(),
  password: z.string().min(8).max(128),
  businessName: z.string().optional(),
  shopName: z.string().optional(),
  county: z.string().optional(),
  address: z.string().optional(),
}).superRefine((value, ctx) => {
  const { mode, ...registration } = value;
  if (mode === "login") return;
  const result = registerSchema.safeParse(registration);
  if (result.success) return;

  for (const issue of result.error.issues) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
});

export const vehicleSchema = z.object({
  registration: z.string().trim().toUpperCase().regex(/^[A-Z0-9 -]{5,12}$/),
  make: z.string().trim().min(2).max(50),
  model: z.string().trim().min(1).max(50),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  color: z.string().trim().max(30).optional(),
  mileageKm: z.number().int().nonnegative().max(2_000_000).optional(),
});

export const bookingSchema = z.object({
  shopId: z.uuid(),
  vehicleId: z.uuid(),
  serviceId: z.uuid().optional(),
  scheduledAt: z.iso.datetime(),
  customerNotes: z.string().trim().max(1000).optional(),
});
