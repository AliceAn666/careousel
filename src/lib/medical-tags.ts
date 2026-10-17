import { z } from "zod";
const text = z.string().trim().max(4000);
export const medicalTagFields = z
  .object({
    kind: z.enum(["FOLLOW_UP", "SERVICE_REQUIREMENT", "CLINICAL_NOTE"]),
    label: z.string().trim().min(3).max(160),
    clinicalNotes: text,
    followUpRecommendation: text,
    recommendedFrom: z.string().datetime().nullable(),
    recommendedBy: z.string().datetime().nullable(),
    requiresReferral: z.boolean(),
    requiresAuthorization: z.boolean(),
  })
  .strict();
export const medicalTagAction = z
  .discriminatedUnion("type", [
    medicalTagFields
      .extend({
        type: z.literal("create"),
        sourceBookingId: z.string().min(1),
        needTitle: z.string().trim().min(3).max(160),
        needId: z.string().optional(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict(),
    medicalTagFields
      .extend({
        type: z.literal("edit"),
        tagId: z.string(),
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict(),
    z
      .object({
        type: z.enum(["approve", "retire"]),
        tagId: z.string(),
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict(),
  ])
  .superRefine((v, ctx) => {
    if (
      (v.type === "create" || v.type === "edit") &&
      v.recommendedFrom &&
      v.recommendedBy &&
      new Date(v.recommendedFrom).getTime() >
        new Date(v.recommendedBy).getTime()
    )
      ctx.addIssue({
        code: "custom",
        message: "Recommended timeframe ends before it starts.",
        path: ["recommendedBy"],
      });
  });
