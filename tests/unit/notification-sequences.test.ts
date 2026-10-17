import { expect, it } from "vitest";
import {
  GROUP_INTERVAL_MS,
  requirementsMet,
  sequenceActionSchema,
} from "../../src/server/services/notification-sequences";
it("keeps the real minimum interval fixed at 180 minutes", () => {
  expect(GROUP_INTERVAL_MS).toBe(180 * 60_000);
  expect(
    sequenceActionSchema.safeParse({
      operation: "start",
      slotId: "s",
      previewToken: "p",
      firstGroup: 1,
      approvedWaitlistIds: ["w"],
      reason: "Reviewed",
      interval: 1,
    }).success,
  ).toBe(false);
});
it("requires explicit approved referral/authorization when configured", () => {
  expect(requirementsMet({ requiresReferral: true }, null)).toBe(false);
  expect(
    requirementsMet(
      { requiresAuthorization: true },
      {
        reviewState: "UNREVIEWED",
        referralApproved: true,
        authorizationApproved: true,
      },
    ),
  ).toBe(false);
  expect(
    requirementsMet(
      { requiresAuthorization: true },
      {
        reviewState: "APPROVED",
        referralApproved: false,
        authorizationApproved: true,
      },
    ),
  ).toBe(true);
});
