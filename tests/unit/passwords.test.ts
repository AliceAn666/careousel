import { expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
} from "../../src/server/auth/passwords";
import {
  patientRegistration,
  loginSchema,
} from "../../src/server/auth/accounts";
it("salts password hashes, verifies credentials and rejects malformed stored data", async () => {
  const a = await hashPassword("SyntheticPassword!123"),
    b = await hashPassword("SyntheticPassword!123");
  expect(a).not.toBe(b);
  expect(a).not.toContain("SyntheticPassword");
  expect(await verifyPassword("SyntheticPassword!123", a)).toBe(true);
  expect(await verifyPassword("DifferentPassword!123", a)).toBe(false);
  expect(await verifyPassword("SyntheticPassword!123", "bad")).toBe(false);
  expect(tokenHash("one")).not.toBe(tokenHash("two"));
});
it("patient registration never accepts privileged roles, clinics, or non-synthetic contact data", () => {
  const input = {
    name: "Synthetic Patient",
    username: "patient.one",
    email: "patient@example.test",
    password: "SyntheticPassword!123",
    plan: "Blue Horizon",
    planType: "PPO",
  };
  expect(patientRegistration.safeParse(input).success).toBe(true);
  // Insured patients choose PPO or HMO; Self-pay needs no plan type.
  const { planType: _omit, ...noPlanType } = input;
  void _omit;
  expect(patientRegistration.safeParse(noPlanType).success).toBe(false);
  expect(
    patientRegistration.safeParse({ ...noPlanType, plan: "Self-pay" }).success,
  ).toBe(true);
  for (const extra of [
    { role: "STAFF" },
    { clinicId: "cedar" },
    { employeeId: "123" },
    { email: "person@actualhospital.com" },
  ])
    expect(patientRegistration.safeParse({ ...input, ...extra }).success).toBe(
      false,
    );
  expect(
    loginSchema.safeParse({
      username: "patient.one",
      password: "short",
      entrance: "PATIENT",
    }).success,
  ).toBe(false);
});
