import { expect, it } from "vitest";
import {
  PRIORITY_LEVELS,
  priorityLabel,
} from "../../src/lib/waitlist-priority";
import { actionSchema } from "../../src/server/services/scheduling";
it("uses exactly four request priority labels; unknown legacy scores are unreviewed", () => {
  expect(PRIORITY_LEVELS.map(priorityLabel)).toEqual([
    "P1 — Time-Sensitive",
    "P2 — High Priority",
    "P3 — Routine",
    "P4 — Flexible",
  ]);
  for (const value of [null, undefined, "7", "P5"])
    expect(priorityLabel(value)).toBe("Awaiting staff review");
});
it("validates explicit staff-review contracts and rejects numeric priorities and extra patient classification", () => {
  const action = {
    type: "setWaitlistPriority",
    waitlistId: "request",
    clinicId: "cedar",
    level: "P3",
    expectedVersion: 0,
    reason: "Synthetic staff review",
  };
  expect(actionSchema.safeParse(action).success).toBe(true);
  for (const patch of [
    { level: 7 },
    { level: "P5" },
    { expectedVersion: -1 },
    { reason: "" },
    { patientId: "patient-2" },
  ])
    expect(actionSchema.safeParse({ ...action, ...patch }).success).toBe(false);
});
