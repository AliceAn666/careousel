import type { BookingStatus, OfferStatus, SlotStatus, WaitlistStatus } from "@/lib/contracts";
const labels = { AVAILABLE: "Available", HELD: "Held", BOOKED: "Booked", WITHDRAWN: "Withdrawn", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", RESCHEDULED: "Rescheduled", ACTIVE: "Active", FULFILLED: "Fulfilled", PENDING: "Pending", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired", REVOKED: "Revoked" };
export function StatusBadge({ status }: { status: BookingStatus | OfferStatus | SlotStatus | WaitlistStatus }) {
 return <span className="inline-flex rounded-full border bg-secondary px-2.5 py-1 text-xs font-medium">{labels[status]}</span>;
}
