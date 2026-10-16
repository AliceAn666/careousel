import { demoCoverage, type PlanType } from "@/lib/demo-coverage";
import { money } from "@/lib/config";
import type { SlotView } from "@/lib/types";
export function CoverageSummary({
  slot,
  provider,
  planType,
}: {
  slot: SlotView;
  provider: string;
  planType: PlanType;
}) {
  const coverage = demoCoverage(slot, provider, planType);
  return (
    <div className="coverage-summary" data-tour="coverage">
      <strong>{coverage.status}</strong>
      <p>
        {provider
          ? `${provider}${provider === "Self-pay" ? "" : ` ${planType}`} · ${slot.service}`
          : "Fictional insurance benefits"}
      </p>
      <p>
        Estimated patient cost:{" "}
        <b>
          {coverage.estimate === null
            ? "Not available"
            : money(coverage.estimate)}
        </b>
      </p>
      <p>{coverage.reason}</p>
      <small>
        Simulated benefits only. Listed price substitutes for an allowed amount;
        other charges and benefit limits are excluded. Not a quote or guarantee
        of coverage.
      </small>
    </div>
  );
}
