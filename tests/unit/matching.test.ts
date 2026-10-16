import { describe, it, expect } from "vitest";
import { eligibility, overlaps } from "../../src/server/services/matching";
import type { RequestWithBooking } from "../../src/server/services/matching";
import type { Slot } from "@prisma/client";
const now = new Date("2030-01-01T00:00:00Z");
const slot: Slot & { clinic: { city: string; timezone: string } } = {
  id: "s",
  clinicId: "c",
  service: "Dermatology",
  provider: "Dr. Demo",
  start: new Date("2030-01-07T18:00:00Z"),
  end: new Date("2030-01-07T18:30:00Z"),
  price: 12000,
  plans: ["Blue Horizon"],
  status: "AVAILABLE",
  clinic: { city: "San Francisco", timezone: "America/Los_Angeles" },
};
const req: RequestWithBooking = {
  id: "w",
  patientId: "p",
  service: "Dermatology",
  plan: "Blue Horizon",
  city: "",
  clinicIds: [],
  maxPrice: 20000,
  earliest: now,
  latest: new Date("2030-02-01Z"),
  startHour: 8,
  endHour: 18,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  bookingId: null,
  booking: null,
  status: "ACTIVE",
  createdAt: now,
};
describe("eligibility", () => {
  it("explains a compatible match", () =>
    expect(eligibility(req, slot, [], now)).toContain(
      "No appointment conflict",
    ));
  it.each([
    { service: "Cardiology" },
    { plan: "Unknown" },
    { maxPrice: 100 },
    { city: "Oakland" },
    { clinicIds: ["other"] },
    { weekdays: [] },
    { startHour: 12 },
    { endHour: 9 },
    { status: "WITHDRAWN" },
    { earliest: new Date("2031-01-01") },
    { latest: new Date("2030-01-07T18:15:00Z") },
  ])("excludes incompatible preferences %j", (patch) =>
    expect(eligibility({ ...req, ...patch }, slot, [], now)).toBeNull(),
  );
  it("excludes past openings", () =>
    expect(eligibility(req, slot, [], new Date("2031-01-01"))).toBeNull());
  it("requires a replacement to be strictly earlier", () => {
    const b = {
      id: "b",
      slotId: "s",
      patientId: "p",
      replacementId: null,
      createdAt: now,
      status: "CONFIRMED",
      slot,
    };
    expect(
      eligibility({ ...req, bookingId: "b", booking: b }, slot, [], now),
    ).toBeNull();
  });
  it("allows adjacent but excludes overlapping intervals", () => {
    expect(
      overlaps(slot, { start: slot.end, end: new Date(+slot.end + 1800000) }),
    ).toBe(false);
    expect(
      overlaps(slot, { start: new Date(+slot.start + 1), end: slot.end }),
    ).toBe(true);
  });
  it("excludes a conflicting confirmed patient booking", () => {
    expect(
      eligibility(
        req,
        slot,
        [
          {
            id: "b",
            patientId: "p",
            slotId: "x",
            replacementId: null,
            status: "CONFIRMED",
            createdAt: now,
            slot,
          },
        ],
        now,
      ),
    ).toBeNull();
  });
});

import { pacificDateBoundary } from "../../src/lib/config";
it("converts Pacific date boundaries across daylight-saving changes", () => {
  expect(pacificDateBoundary("2030-01-10")).toBe("2030-01-10T08:00:00.000Z");
  expect(pacificDateBoundary("2030-07-10")).toBe("2030-07-10T07:00:00.000Z");
  expect(pacificDateBoundary("2030-07-10", true)).toBe(
    "2030-07-11T06:59:59.000Z",
  );
});
