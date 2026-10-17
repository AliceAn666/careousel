// Fictional benefit scenarios for the hackathon; never real coverage verification.
export type PlanType = "PPO" | "HMO";
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
  // HMO scenarios deliberately have a narrower network than the PPO variants.
  const network =
    slot.plans.includes(provider) &&
    (type === "PPO" || slot.clinicId === "cedar" || slot.clinicId === "harbor");
  if (!network)
    return {
      status: "Out-of-network · demo",
      estimate: null,
      reason:
        "This specific demo plan has no in-network benefit at this clinic. Out-of-network costs are unknown.",
    };
  if (type === "HMO" && slot.service === "Cardiology")
    return {
      status: "Service not covered · demo",
      estimate: null,
      reason:
        "Cardiology is excluded in this fictional HMO benefit scenario, even at an in-network clinic.",
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
