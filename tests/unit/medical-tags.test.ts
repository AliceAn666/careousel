import { expect, it } from "vitest";
import { medicalTagAction } from "../../src/lib/medical-tags";
const input = {
  type: "create",
  sourceBookingId: "visit",
  needTitle: "Follow-up need",
  kind: "FOLLOW_UP",
  label: "Follow-up advised",
  clinicalNotes: "",
  followUpRecommendation: "",
  recommendedFrom: null,
  recommendedBy: null,
  requiresReferral: false,
  requiresAuthorization: false,
  reason: "Visit review",
};
it("accepts clinical evidence without symptom scores or urgency", () => {
  expect(medicalTagAction.parse(input)).toEqual(input);
});
it.each(["patientId", "clinicId", "authorId", "priority", "state", "score"])(
  "rejects client-controlled %s",
  (key) => {
    expect(
      medicalTagAction.safeParse({ ...input, [key]: "forged" }).success,
    ).toBe(false);
  },
);
it("rejects inverted timeframes and stale-version-free edits", () => {
  expect(
    medicalTagAction.safeParse({
      ...input,
      recommendedFrom: "2026-12-20T00:00:00Z",
      recommendedBy: "2026-12-01T00:00:00Z",
    }).success,
  ).toBe(false);
  expect(
    medicalTagAction.safeParse({
      type: "approve",
      tagId: "x",
      reason: "Reviewed",
    }).success,
  ).toBe(false);
});
