import { z } from "zod";
import { PLANS, SERVICES } from "./config";
const amount = z.string().regex(/^(?:\d{1,6}(?:\.\d{0,2})?|)$/);
export const searchPreferencesSchema = z.object({
  service: z.enum(["", ...SERVICES]),
  city: z.string().max(80),
  plan: z.enum(["", ...PLANS]),
  price: amount,
  date: z.string().refine((value) => {
    if (value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const instant = Date.parse(`${value}T12:00:00Z`);
    return (
      Number.isFinite(instant) &&
      new Date(instant).toISOString().slice(0, 10) === value
    );
  }),
  planType: z.enum(["PPO", "HMO"]),
  coveredOnly: z.boolean(),
  patientCost: amount,
});
export type SearchPreferences = z.infer<typeof searchPreferencesSchema>;
export const defaultSearchPreferences: SearchPreferences = {
  service: "",
  city: "",
  plan: "",
  price: "",
  date: "",
  planType: "PPO",
  coveredOnly: false,
  patientCost: "",
};
export function parseSearchPreferences(raw: string | null): SearchPreferences {
  try {
    const parsed = searchPreferencesSchema.safeParse(JSON.parse(raw ?? "null"));
    if (!parsed.success) return { ...defaultSearchPreferences };
    return {
      ...parsed.data,
      coveredOnly:
        !!parsed.data.plan &&
        parsed.data.plan !== "Self-pay" &&
        parsed.data.coveredOnly,
    };
  } catch {
    return { ...defaultSearchPreferences };
  }
}
export const searchStorageKey = (patientId: string) =>
  `careousel:search:v1:${patientId}`;
export function readSearchPreferences(patientId: string): SearchPreferences {
  try {
    return parseSearchPreferences(
      localStorage.getItem(searchStorageKey(patientId)),
    );
  } catch {
    return { ...defaultSearchPreferences };
  }
}
export function saveSearchPreferences(
  patientId: string,
  preferences: SearchPreferences,
) {
  if (!searchPreferencesSchema.safeParse(preferences).success) return;
  try {
    localStorage.setItem(
      searchStorageKey(patientId),
      JSON.stringify(preferences),
    );
  } catch {
    /* Browser storage is optional, never scheduling state. */
  }
}
