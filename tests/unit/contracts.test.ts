import { describe, expect, it } from "vitest";
import { waitlistPreferencesSchema, slotSchema, api, apiErrorSchema } from "../../src/lib/contracts";
const id = "11111111-1111-4111-8111-111111111111";
const prefs = { serviceId: id, visitType: "consult", linkedBookingId: null, insurancePlanId: null, allowSelfPay: true, allowedClinicIds: [], allowedCities: [], preferredWeekdays: [1], earliestTimeMinutes: 540, latestTimeMinutes: 1020, earliestDate: "2026-11-01", latestDate: "2026-11-30", maxPriceCents: 10000 };
describe("wire boundary invariants", () => {
 it("rejects inverted date/time bounds and missing payment compatibility", () => {
  expect(waitlistPreferencesSchema.safeParse(prefs).success).toBe(true);
  for (const change of [{ earliestDate: "2026-12-01" }, { latestTimeMinutes: 500 }, { allowSelfPay: false }, { maxPriceCents: 1.5 }, { preferredWeekdays: [7] }]) expect(waitlistPreferencesSchema.safeParse({ ...prefs, ...change }).success).toBe(false);
 });
 it("rejects forged ownership on booking and inverted slot intervals", () => {
  expect(api.book.input.safeParse({ slotId: id, expectedVersion: 0, patientId: id }).success).toBe(false);
  expect(slotSchema.safeParse({ id, clinicId: id, clinicServiceId: id, startsAt: "2026-11-01T12:00:00Z", endsAt: "2026-11-01T11:00:00Z", status: "AVAILABLE", version: 0 }).success).toBe(false);
 });
 it("preserves explicit conflict responses and list pagination defaults", () => {
  expect(api.bookings.input.parse({}).limit).toBe(25);
  expect(apiErrorSchema.parse({ error: { code: "OFFER_EXPIRED", message: "Offer expired", requestId: "test" } }).error.code).toBe("OFFER_EXPIRED");
 });
});
