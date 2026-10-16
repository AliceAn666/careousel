import { describe, it, expect } from "vitest";
import { scoreIntake, severityLabel } from "../../src/lib/priority";

describe("intake scoring", () => {
  it("gives each symptom area its own tag and score, highest first", () => {
    const tags = scoreIntake({
      symptoms: [
        { area: "injury", pain: 2, duration: "day", worsening: false },
        { area: "chest", pain: 7, duration: "week", worsening: true },
      ],
      warningSigns: [],
    });
    expect(tags).toEqual([
      { label: "Chest pain", score: 7 },
      { label: "Wound or injury", score: 1 },
    ]);
  });

  it("raises only the areas a warning sign relates to", () => {
    const tags = scoreIntake({
      symptoms: [
        { area: "chest", pain: 5, duration: "day", worsening: false },
        { area: "skin", pain: 5, duration: "day", worsening: false },
      ],
      warningSigns: ["radiating"],
    });
    expect(tags.find((t) => t.label === "Chest pain")?.score).toBe(7);
    expect(tags.find((t) => t.label === "Skin problem")?.score).toBe(3);
  });

  it("keeps scores within 1–10", () => {
    const [high] = scoreIntake({
      symptoms: [
        { area: "breathing", pain: 10, duration: "longer", worsening: true },
      ],
      warningSigns: ["breathless", "faint", "highFever"],
    });
    const [low] = scoreIntake({
      symptoms: [{ area: "back", pain: 0, duration: "day", worsening: false }],
      warningSigns: [],
    });
    expect(high.score).toBe(10);
    expect(low.score).toBe(1);
  });

  it("labels severity bands", () => {
    expect([1, 3, 4, 6, 7, 10].map(severityLabel)).toEqual([
      "Low",
      "Low",
      "Moderate",
      "Moderate",
      "High",
      "High",
    ]);
  });
});
