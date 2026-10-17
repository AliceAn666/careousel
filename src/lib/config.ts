export const SERVICES = [
  "Dermatology",
  "Cardiology",
  "Primary care",
  "Vaccination",
  "Blood test",
  "Routine examination",
] as const;
export const PLANS = [
  "Blue Horizon",
  "Aster Health",
  "United Demo",
  "Pacific Care",
  "Self-pay",
] as const;
export const OFFER_MINUTES = 10;
// Personas offered in the demo switcher; other seeded patients stay as background data.
export const DEMO_PERSONAS = [
  "avery",
  "patient-1",
  "staff-cedar",
  "staff-harbor",
] as const;
// Home-page quick login for fast demos (at most 6 seeded synthetic users,
// a superset of DEMO_PERSONAS). The in-app switcher still lists DEMO_PERSONAS.
export const QUICK_LOGIN_PERSONAS = [
  { id: "avery", name: "Avery Morgan", role: "PATIENT" },
  { id: "patient-1", name: "Jordan Lee", role: "PATIENT" },
  { id: "patient-2", name: "Sam Rivera", role: "PATIENT" },
  { id: "staff-cedar", name: "Cedar Health staff", role: "STAFF" },
  { id: "staff-harbor", name: "Harbor Medical staff", role: "STAFF" },
  { id: "staff-summit", name: "Summit Specialty staff", role: "STAFF" },
] as const;
export function isDemoPersonaId(id: string) {
  return QUICK_LOGIN_PERSONAS.some((p) => p.id === id);
}
export const VISIT_TYPES = { FIRST: "First visit", FOLLOW_UP: "Follow-up" };
export function dateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
// Convert a date-only Pacific preference to UTC, respecting daylight-saving time.
export function pacificDateBoundary(date: string, end = false) {
  const naive = new Date(`${date}T${end ? "23:59:59" : "00:00:00"}Z`);
  let instant = naive;
  for (let i = 0; i < 2; i++) {
    const offsetName =
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        timeZoneName: "longOffset",
      })
        .formatToParts(instant)
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT-08:00";
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetName);
    const offset = match
      ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;
    instant = new Date(+naive - offset * 60000);
  }
  return instant.toISOString();
}
export function pacificDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function timeLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
