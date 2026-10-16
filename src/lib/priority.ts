// Demo priority scoring. Scores are self-reported (first visit) or clinic-entered
// (follow-up) hints shown to staff; they never change eligibility or FIFO order.
export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

export const SYMPTOM_AREAS = [
  { id: "chest", label: "Chest pain", weight: 1 },
  { id: "breathing", label: "Breathing difficulty", weight: 1 },
  { id: "head", label: "Headache", weight: 0 },
  { id: "abdomen", label: "Abdominal pain", weight: 0 },
  { id: "back", label: "Back pain", weight: 0 },
  { id: "limbs", label: "Joint or limb pain", weight: 0 },
  { id: "skin", label: "Skin problem", weight: 0 },
  { id: "injury", label: "Wound or injury", weight: 0 },
  { id: "fever", label: "Fever", weight: 0 },
] as const;
export type SymptomArea = (typeof SYMPTOM_AREAS)[number]["id"];

export const DURATIONS = [
  { id: "day", label: "Less than a day", weight: 0 },
  { id: "week", label: "1–7 days", weight: 1 },
  { id: "month", label: "1–4 weeks", weight: 1 },
  { id: "longer", label: "More than a month", weight: 2 },
] as const;
export type Duration = (typeof DURATIONS)[number]["id"];

// Warning signs raise the score of the symptom areas they relate to.
export const WARNING_SIGNS = [
  {
    id: "breathless",
    label: "Short of breath while resting",
    areas: ["chest", "breathing"],
  },
  {
    id: "radiating",
    label: "Chest pain spreading to arm, jaw or back",
    areas: ["chest"],
  },
  {
    id: "faint",
    label: "Fainting, confusion or trouble speaking",
    areas: ["chest", "breathing", "head"],
  },
  {
    id: "bleeding",
    label: "Bleeding that will not stop",
    areas: ["injury", "skin"],
  },
  {
    id: "highFever",
    label: "Fever above 39 °C / 102 °F",
    areas: ["fever", "breathing", "head"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  areas: readonly SymptomArea[];
}[];
export type WarningSign = (typeof WARNING_SIGNS)[number]["id"];

export type SymptomAnswer = {
  area: SymptomArea;
  pain: number; // 0–10 self-reported intensity
  duration: Duration;
  worsening: boolean;
};
export type IntakeAnswers = {
  symptoms: SymptomAnswer[];
  warningSigns: WarningSign[];
};
export type ScoredTag = { label: string; score: number };

const clamp = (n: number) =>
  Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(n)));

/** One tag per reported symptom area, highest score first. */
export function scoreIntake(answers: IntakeAnswers): ScoredTag[] {
  return answers.symptoms
    .map((s) => {
      const area = SYMPTOM_AREAS.find((a) => a.id === s.area)!;
      const duration = DURATIONS.find((d) => d.id === s.duration)!;
      const warnings = WARNING_SIGNS.filter(
        (w) =>
          answers.warningSigns.includes(w.id) &&
          (w.areas as readonly string[]).includes(s.area),
      ).length;
      const score =
        s.pain * 0.6 +
        area.weight +
        duration.weight +
        (s.worsening ? 1 : 0) +
        warnings * 3;
      return { label: area.label, score: clamp(score) };
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

export function severityLabel(score: number) {
  return score >= 7 ? "High" : score >= 4 ? "Moderate" : "Low";
}
