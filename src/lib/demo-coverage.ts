// Synthetic clinic insurance networks for the hackathon demo.
// Keep acceptance at the CLINIC level, independent of individual appointment times.
export type PlanType = "PPO" | "HMO";

const DEMO_NETWORKS: Record<string, readonly string[]> = {
  harbor: ["Blue Horizon", "Aster Health"],
  cedar: ["Blue Horizon", "United Demo"],
  summit: ["Pacific Care", "United Demo"],
  willow: ["Aster Health", "Pacific Care"],
};

export function demoClinicPlans(clinicId: string): string[] {
  return [...(DEMO_NETWORKS[clinicId] ?? []), "Self-pay"];
}

export function demoClinicAccepts(
  clinicId: string,
  provider: string,
  type: PlanType,
  fallbackPlans: readonly string[] = [],
) {
  if (!provider || provider === "Self-pay") return false;
  const insurers = DEMO_NETWORKS[clinicId] ?? fallbackPlans;
  // Fictional HMO has a narrower clinic network.
  return insurers.includes(provider) &&
    (type === "PPO" || clinicId === "cedar" || clinicId === "harbor");
}

export function demoCoverage(
  slot: { clinicId: string; service: string; price: number; plans: string[] },
  provider: string,
  type: PlanType,
) {
  if (!provider)
    return {
      status: "Choose a demo plan",
      estimate: null,
      reason: "Select an insurer and plan type to explore fictional benefits.",
    };
  if (provider === "Self-pay")
    return {
      status: "Self-pay",
      estimate: slot.price,
      reason: "Full listed visit price; no insurance benefit applied.",
    };
  if (!demoClinicAccepts(slot.clinicId, provider, type, slot.plans))
    return {
      status: "Out-of-network · demo",
      estimate: null,
      reason:
        "This fictional clinic is outside the selected plan network. Self-pay remains an option; out-of-network benefit amounts are unknown.",
    };
  if (type === "HMO" && slot.service === "Cardiology")
    return {
      status: "Service not covered · demo",
      estimate: null,
      reason:
        "This clinic is in-network, but Cardiology is excluded in this fictional HMO plan. You may choose self-pay.",
    };
  if (type === "HMO")
    return {
      status: "In-network · demo",
      estimate: Math.min(slot.price, 3000),
      reason: `${slot.service === "Primary care" ? "No referral required" : "Referral required before care"}. Fictional $30 copay, capped at the listed visit price; prior authorization must be reviewed by the clinic.`,
    };
  const deductible = Math.min(slot.price, 5000);
  return {
    status: "In-network · demo",
    estimate: deductible + Math.round((slot.price - deductible) * 0.2),
    reason:
      "Fictional PPO: $50 deductible remaining, then 20% coinsurance on the remaining listed price. No referral required in this scenario; authorization is not verified.",
  };
}
