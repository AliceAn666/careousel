import { afterEach, expect, it, vi } from "vitest";
import {
  defaultSearchPreferences,
  parseSearchPreferences,
  readSearchPreferences,
  saveSearchPreferences,
  searchStorageKey,
} from "../../src/lib/search-preferences";
afterEach(() => vi.unstubAllGlobals());
it("validates persisted fictional search preferences and fails safely on corrupt data", () => {
  for (const raw of [
    null,
    "{broken",
    JSON.stringify({ ...defaultSearchPreferences, plan: "Real insurer" }),
    JSON.stringify({ ...defaultSearchPreferences, price: "-20" }),
    JSON.stringify({ ...defaultSearchPreferences, date: "2026-99-99" }),
    JSON.stringify({ ...defaultSearchPreferences, date: "2026-02-30" }),
    JSON.stringify({ ...defaultSearchPreferences, price: "." }),
  ])
    expect(parseSearchPreferences(raw)).toEqual(defaultSearchPreferences);
  expect(
    parseSearchPreferences(
      JSON.stringify({ ...defaultSearchPreferences, coveredOnly: true }),
    ).coveredOnly,
  ).toBe(false);
  expect(
    parseSearchPreferences(
      JSON.stringify({
        ...defaultSearchPreferences,
        plan: "Self-pay",
        coveredOnly: true,
      }),
    ).coveredOnly,
  ).toBe(false);
});
it("persists per persona without changing another patient's preferences", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const avery = {
    ...defaultSearchPreferences,
    plan: "Blue Horizon" as const,
    planType: "HMO" as const,
    patientCost: "30",
    coveredOnly: true,
  };
  saveSearchPreferences("avery", avery);
  expect(searchStorageKey("avery")).not.toBe(searchStorageKey("patient-1"));
  expect(readSearchPreferences("avery")).toEqual(avery);
  expect(readSearchPreferences("patient-1")).toEqual(defaultSearchPreferences);
});
it("unavailable browser storage does not prevent search", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(readSearchPreferences("avery")).toEqual(defaultSearchPreferences);
  expect(() =>
    saveSearchPreferences("avery", defaultSearchPreferences),
  ).not.toThrow();
});
