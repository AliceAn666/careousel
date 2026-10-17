import { describe, expect, it } from "vitest";
import {
  DEMO_PERSONAS,
  QUICK_LOGIN_PERSONAS,
  isDemoPersonaId,
} from "../../src/lib/config";

describe("home-page demo quick login", () => {
  it("offers at most six seeded patients and clinics", () => {
    expect(QUICK_LOGIN_PERSONAS.length).toBeLessThanOrEqual(6);
    const roles = new Set(QUICK_LOGIN_PERSONAS.map((p) => p.role));
    expect([...roles].sort()).toEqual(["PATIENT", "STAFF"]);
    for (const p of QUICK_LOGIN_PERSONAS)
      if (p.role === "STAFF") expect(p.id).toMatch(/^staff-[a-z]+$/);
  });

  it("keeps the four switcher personas loginable", () => {
    for (const id of DEMO_PERSONAS) expect(isDemoPersonaId(id)).toBe(true);
  });

  it("rejects ids outside the allowlist", () => {
    for (const id of ["patient-3", "staff-willow", "", "admin", "avery "])
      expect(isDemoPersonaId(id)).toBe(false);
  });
});
