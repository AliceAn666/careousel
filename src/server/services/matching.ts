import { demoClinicAccepts } from "../../lib/demo-coverage";
import type { Booking, Slot, Waitlist } from "@prisma/client";
export type RequestWithBooking = Waitlist & {
  booking: (Booking & { slot: Slot }) | null;
};
export function overlaps(
  a: Pick<Slot, "start" | "end">,
  b: Pick<Slot, "start" | "end">,
) {
  return a.start < b.end && b.start < a.end;
}
export function eligibility(
  request: RequestWithBooking,
  slot: Slot & { clinic: { city: string; timezone: string } },
  bookings: (Booking & { slot: Slot })[],
  now = new Date(),
): string[] | null {
  if (
    request.status !== "ACTIVE" ||
    slot.start <= now ||
    request.service !== slot.service
  )
    return null;
  if (request.city && request.city !== slot.clinic.city) return null;
  if (request.clinicIds.length && !request.clinicIds.includes(slot.clinicId))
    return null;
  if (
    (request.plan !== "Self-pay" &&
      !demoClinicAccepts(slot.clinicId, request.plan, "PPO", slot.plans)) ||
    slot.price > request.maxPrice
  )
    return null;
  if (slot.start < request.earliest || slot.end > request.latest) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.clinic.timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(slot.start);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    part("weekday"),
  );
  const hour = Number(part("hour")) + Number(part("minute")) / 60;
  const endParts = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.clinic.timezone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(slot.end);
  const endHour =
    Number(endParts.find((p) => p.type === "hour")?.value) +
    Number(endParts.find((p) => p.type === "minute")?.value) / 60;
  if (
    !request.weekdays.includes(day) ||
    hour < request.startHour ||
    endHour > request.endHour ||
    endHour <= hour
  )
    return null;
  if (
    request.bookingId &&
    (!request.booking ||
      request.booking.status !== "CONFIRMED" ||
      slot.start >= request.booking.slot.start)
  )
    return null;
  if (
    bookings.some(
      (b) =>
        b.patientId === request.patientId &&
        b.status === "CONFIRMED" &&
        b.id !== request.bookingId &&
        overlaps(b.slot, slot),
    )
  )
    return null;
  const reasons = [
    "Service matches",
    `${request.plan} accepted (demo)`,
    "Within budget and preferred hours",
    "No appointment conflict",
  ];
  if (request.booking)
    reasons.push(
      `${Math.floor((request.booking.slot.start.getTime() - slot.start.getTime()) / 86400000)} days earlier`,
    );
  return reasons;
}
