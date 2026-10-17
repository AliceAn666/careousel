import { describe, expect, it } from "vitest";
import { demoCoverage } from "../../src/lib/demo-coverage";
const slot = {
  clinicId: "cedar",
  service: "Dermatology",
  price: 15000,
  plans: ["Blue Horizon"],
};
describe("fictional plan-specific benefits", () => {
  it("applies the deductible before coinsurance without exceeding the visit price", () => {
    expect(demoCoverage(slot, "Blue Horizon", "PPO").estimate).toBe(7000);
    expect(
      demoCoverage({ ...slot, price: 2000 }, "Blue Horizon", "PPO").estimate,
    ).toBe(2000);
    expect(
      demoCoverage({ ...slot, price: 0 }, "Blue Horizon", "PPO").estimate,
    ).toBe(0);
  });
  it("distinguishes insurer acceptance from the specific plan network", () => {
    const otherClinic = { ...slot, clinicId: "summit" };
    expect(
      demoCoverage(otherClinic, "Blue Horizon", "PPO").estimate,
    ).not.toBeNull();
    expect(
      demoCoverage(otherClinic, "Blue Horizon", "HMO").estimate,
    ).toBeNull();
    expect(demoCoverage(slot, "Aster Health", "PPO").estimate).toBeNull();
  });
  it("does not infer service coverage from network status", () => {
    expect(
      demoCoverage({ ...slot, service: "Cardiology" }, "Blue Horizon", "HMO")
        .status,
    ).toContain("not covered");
    expect(
      demoCoverage({ ...slot, service: "Cardiology" }, "Blue Horizon", "HMO")
        .estimate,
    ).toBeNull();
    expect(demoCoverage(slot, "Blue Horizon", "HMO").reason).toContain(
      "Referral required",
    );
  });
  it("keeps unknown and self-pay distinct", () => {
    expect(demoCoverage(slot, "", "PPO").estimate).toBeNull();
    expect(demoCoverage(slot, "Self-pay", "PPO").estimate).toBe(15000);
  });
});
