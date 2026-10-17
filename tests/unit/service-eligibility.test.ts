import { expect, it } from "vitest";
import {
  canDirectBook,
  DIRECT_BOOKING_SERVICES,
} from "../../src/lib/service-eligibility";
it("allows exactly the three explicitly classified basic services", () => {
  expect([...DIRECT_BOOKING_SERVICES]).toEqual([
    "Vaccination",
    "Blood test",
    "Routine examination",
  ]);
  for (const s of DIRECT_BOOKING_SERVICES) expect(canDirectBook(s)).toBe(true);
  for (const s of [
    "Dermatology",
    "Cardiology",
    "Primary care",
    "Routine examination consultation",
    "vaccination",
    "Unknown",
    "",
  ])
    expect(canDirectBook(s)).toBe(false);
});
