export const SERVICES = ["Dermatology", "Cardiology", "Primary care"] as const;
export const PLANS = [
  "Blue Horizon",
  "Aster Health",
  "United Demo",
  "Pacific Care",
  "Self-pay",
] as const;
export const OFFER_MINUTES = 10;
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
