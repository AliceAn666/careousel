/** Exact service identifiers: never infer eligibility from labels or symptoms. */
export const DIRECT_BOOKING_SERVICES = [
  "Vaccination",
  "Blood test",
  "Routine examination",
] as const;
const directServices: ReadonlySet<string> = new Set(DIRECT_BOOKING_SERVICES);
export function canDirectBook(service: string): boolean {
  return directServices.has(service);
}
export const REVIEWED_WAITLIST_MESSAGE =
  "This service is allocated through clinic-reviewed waitlist invitations. Join the shared waitlist or Find an Earlier Appointment; ordinary direct booking is not available.";
