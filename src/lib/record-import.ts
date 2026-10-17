import { z } from "zod";
import { SERVICES } from "./config";
import { medicalTagFields } from "./medical-tags";
export const SYNTHETIC_SOURCE = "CAREOUSEL_SYNTHETIC_FHIR_V1" as const;
export const importedTagFields = medicalTagFields
  .extend({ service: z.enum(SERVICES) })
  .strict()
  .superRefine((v, c) => {
    if (
      v.recommendedFrom &&
      v.recommendedBy &&
      Date.parse(v.recommendedFrom) > Date.parse(v.recommendedBy)
    )
      c.addIssue({
        code: "custom",
        path: ["recommendedBy"],
        message: "Recommended timeframe ends before it starts.",
      });
  });
export type ImportedTagFields = z.infer<typeof importedTagFields>;
export const recordAction = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("authorizeImport"),
      clinicId: z.string().min(1),
      source: z.literal(SYNTHETIC_SOURCE),
      consent: z.literal(true),
      consentVersion: z.literal("SYNTHETIC_V1"),
      requestId: z.uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("revoke"),
      importId: z.string(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("extract"),
      importId: z.string(),
      mode: z.enum(["LOCAL_RULES", "LOCAL_AI"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("review"),
      suggestionId: z.string(),
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["SAVE", "APPROVE", "REJECT"]),
      fields: importedTagFields,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);
export const recordSearch = z
  .object({
    q: z.string().trim().max(160).default(""),
    mode: z.enum(["fulltext", "keyword"]).default("fulltext"),
  })
  .strict();
