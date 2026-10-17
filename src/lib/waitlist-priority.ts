export const PRIORITY_LEVELS = ["P1", "P2", "P3", "P4"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];
export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  P1: "Time-Sensitive",
  P2: "High Priority",
  P3: "Routine",
  P4: "Flexible",
};
export function priorityLabel(level: string | null | undefined) {
  return PRIORITY_LEVELS.includes(level as PriorityLevel)
    ? `${level} — ${PRIORITY_LABELS[level as PriorityLevel]}`
    : "Awaiting staff review";
}
