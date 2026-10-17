import { z } from "zod";
import { PLANS, SERVICES } from "./config";
export const needPreferences = z
  .object({
    plan: z.enum(PLANS),
    city: z.string().trim().max(80),
    clinicIds: z.array(z.string().min(1)).max(50),
    maxPrice: z.number().int().min(0).max(1000000),
    earliest: z.coerce.date(),
    latest: z.coerce.date(),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  })
  .strict()
  .refine(
    (p) => p.earliest < p.latest && p.startHour < p.endHour,
    "Choose a valid date/time window.",
  );
export const externalReport = z
  .object({
    clinicName: z.string().trim().min(2).max(160),
    start: z.coerce.date(),
    end: z.coerce.date(),
    location: z.string().trim().min(2).max(240),
    reference: z.string().trim().max(160),
    reportedConfirmed: z.boolean(),
  })
  .strict()
  .refine(
    (e) => e.end > e.start && +e.end - +e.start <= 86400000,
    "Choose an appointment duration of at most 24 hours.",
  );
const fields = {
  title: z.string().trim().min(3).max(160),
  preferences: needPreferences,
  requiresReferral: z.boolean(),
  requiresAuthorization: z.boolean(),
  tagIds: z.array(z.string()).max(30),
};
export const patientNeedActions = [
  z
    .object({
      type: z.literal("createNeed"),
      ...fields,
      service: z.enum(SERVICES),
      original: z.discriminatedUnion("type", [
        z.object({ type: z.literal("NONE") }).strict(),
        z
          .object({ type: z.literal("INTERNAL"), bookingId: z.string() })
          .strict(),
        z
          .object({ type: z.literal("EXTERNAL"), appointment: externalReport })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("editNeed"),
      needId: z.string(),
      expectedVersion: z.number().int().positive(),
      ...fields,
    })
    .strict(),
  z
    .object({
      type: z.enum(["requestNeed", "completeNeed", "closeNeed", "reopenNeed"]),
      needId: z.string(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("editExternal"),
      needId: z.string(),
      expectedVersion: z.number().int().positive(),
      appointment: externalReport,
      reportedCancelled: z.boolean(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
] as const;
export const patientNeedAction = z.discriminatedUnion(
  "type",
  patientNeedActions,
);
export type PatientNeedAction = z.infer<typeof patientNeedAction>;
