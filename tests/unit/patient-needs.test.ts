import { expect, it } from "vitest";
import {
  externalReport,
  needPreferences,
  patientNeedAction,
} from "../../src/lib/patient-needs";
const preferences = {
  plan: "Blue Horizon",
  city: "",
  clinicIds: [],
  maxPrice: 20000,
  earliest: "2030-01-01",
  latest: "2030-03-01",
  startHour: 0,
  endHour: 24,
  weekdays: [1, 2, 3],
};
const appointment = {
  clinicName: "Outside clinic",
  start: "2030-02-01T10:00Z",
  end: "2030-02-01T10:30Z",
  location: "Patient-reported location",
  reference: "",
  reportedConfirmed: false,
};
it("allows symptom-free needs and optional external references without granting verification or priority", () => {
  const valid = {
    type: "createNeed",
    title: "Routine blood test",
    service: "Blood test",
    preferences,
    requiresReferral: false,
    requiresAuthorization: false,
    tagIds: [],
    original: { type: "EXTERNAL", appointment },
  };
  expect(patientNeedAction.safeParse(valid).success).toBe(true);
  for (const extra of [
    { patientId: "other" },
    { level: "P1" },
    { priority: "P1" },
  ])
    expect(patientNeedAction.safeParse({ ...valid, ...extra }).success).toBe(
      false,
    );
  expect(
    externalReport.safeParse({ ...appointment, verification: "VERIFIED" })
      .success,
  ).toBe(false);
});
it("rejects reversed windows, empty weekdays and invalid external durations", () => {
  expect(
    needPreferences.safeParse({ ...preferences, latest: "2029-01-01" }).success,
  ).toBe(false);
  expect(
    needPreferences.safeParse({ ...preferences, weekdays: [] }).success,
  ).toBe(false);
  expect(
    needPreferences.safeParse({ ...preferences, startHour: 20, endHour: 10 })
      .success,
  ).toBe(false);
  expect(
    externalReport.safeParse({ ...appointment, end: appointment.start })
      .success,
  ).toBe(false);
  expect(
    externalReport.safeParse({ ...appointment, end: "2030-02-03T10:30Z" })
      .success,
  ).toBe(false);
});
it("requires optimistic concurrency and preserves source identity on edits", () => {
  expect(
    patientNeedAction.safeParse({
      type: "completeNeed",
      needId: "n",
      expectedVersion: 1,
    }).success,
  ).toBe(true);
  expect(
    patientNeedAction.safeParse({ type: "completeNeed", needId: "n" }).success,
  ).toBe(false);
  expect(
    patientNeedAction.safeParse({
      type: "editExternal",
      needId: "n",
      expectedVersion: 1,
      appointment,
      reportedCancelled: false,
      reason: "Patient correction",
      patientId: "other",
    }).success,
  ).toBe(false);
});
