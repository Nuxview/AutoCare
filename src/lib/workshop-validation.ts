import { z } from "zod";
export const quoteLineSchema = z.object({
  description: z.string().trim().min(2).max(200),
  quantity: z.number().positive().max(10000).multipleOf(0.001),
  unitPrice: z.number().nonnegative().max(1000000).multipleOf(0.01),
  inventoryItemId: z.uuid().nullable().optional(),
});
export const quoteSchema = z.object({
  jobId: z.uuid(),
  lines: z.array(quoteLineSchema).min(1).max(50),
  note: z.string().trim().max(500).default(""),
});
export const partSchema = z.object({
  jobId: z.uuid(),
  itemId: z.uuid(),
  quantity: z.number().positive().max(10000).multipleOf(0.001),
  direction: z.enum(["USE", "RETURN"]),
  requestId: z.uuid(),
});
export const scheduleSchema = z
  .object({
    bookingId: z.uuid(),
    mechanicId: z.uuid(),
    bayId: z.uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })
  .refine(
    (v) =>
      Date.parse(v.endsAt) > Date.parse(v.startsAt) &&
      Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 12 * 60 * 60 * 1000,
    "Choose an end time after the start, within 12 hours",
  );
