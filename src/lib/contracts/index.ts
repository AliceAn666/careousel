import { z } from "zod";
// Wire values mirror PR #2 at 0177554; never import Prisma into browser contracts.
export const slotStatusSchema = z.enum(["AVAILABLE", "HELD", "BOOKED", "WITHDRAWN"]);
export const bookingStatusSchema = z.enum(["CONFIRMED", "CANCELLED", "RESCHEDULED"]);
export const waitlistStatusSchema = z.enum(["ACTIVE", "FULFILLED", "WITHDRAWN"]);
export const offerStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "REVOKED"]);
export const roleSchema = z.enum(["PATIENT", "STAFF", "ADMIN"]);
export const suggestionStatusSchema = z.enum(["ELIGIBLE", "DISMISSED"]);
export const notificationKindSchema = z.enum(["OFFER", "BOOKING", "CANCELLED", "INFO"]);
export type SlotStatus = z.infer<typeof slotStatusSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type WaitlistStatus = z.infer<typeof waitlistStatusSchema>;
export type OfferStatus = z.infer<typeof offerStatusSchema>;
const id = z.uuid();
const timestamp = z.iso.datetime(); // UTC ISO 8601; JSON never transports Date objects.
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().trim().min(1).max(200);
const date = z.iso.date();
export const paginationSchema = z.strictObject({ cursor: id.optional(), limit: z.number().int().min(1).max(100).default(25) });
export const moneySchema = z.strictObject({ amountCents: cents, currency: z.literal("USD") });
export const clinicSchema = z.strictObject({ id, name: text, city: text, address: text, timezone: z.string().refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Invalid IANA timezone") });
export const serviceSchema = z.strictObject({ id, name: text, specialty: text });
export const insurancePlanSchema = z.strictObject({ id, name: text });
export const slotSchema = z.strictObject({ id, clinicId: id, clinicServiceId: id, startsAt: timestamp, endsAt: timestamp, status: slotStatusSchema, version: z.number().int().nonnegative() }).refine(v => Date.parse(v.endsAt) > Date.parse(v.startsAt), "End must follow start");
export const clinicServiceSchema = z.strictObject({ id, clinicId: id, serviceId: id, visitType: text, durationMinutes: z.number().int().positive(), estimatedPriceCents: cents, currency: z.literal("USD"), allowsSelfPay: z.boolean(), acceptedPlanIds: z.array(id) });
export const bookingSchema = z.strictObject({ id, patientId: id, slotId: id, status: bookingStatusSchema, replacedBookingId: id.nullable(), createdAt: timestamp, updatedAt: timestamp });
export const waitlistPreferencesSchema = z.strictObject({
 serviceId: id, visitType: text, linkedBookingId: id.nullable(), insurancePlanId: id.nullable(), allowSelfPay: z.boolean(),
 allowedClinicIds: z.array(id).max(100), allowedCities: z.array(text).max(100), preferredWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
 earliestTimeMinutes: z.number().int().min(0).max(1439).nullable(), latestTimeMinutes: z.number().int().min(1).max(1440).nullable(),
 earliestDate: date.nullable(), latestDate: date.nullable(), maxPriceCents: cents,
}).refine(v => v.insurancePlanId !== null || v.allowSelfPay, "Select a plan or self-pay")
.refine(v => v.earliestDate === null || v.latestDate === null || v.earliestDate <= v.latestDate, "Invalid date range")
.refine(v => v.earliestTimeMinutes === null || v.latestTimeMinutes === null || v.earliestTimeMinutes < v.latestTimeMinutes, "Invalid time window");
export const waitlistSchema = waitlistPreferencesSchema.extend({ id, patientId: id, status: waitlistStatusSchema, createdAt: timestamp, updatedAt: timestamp });
export const offerSchema = z.strictObject({ id, slotId: id, patientId: id, waitlistId: id, status: offerStatusSchema, expiresAt: timestamp, approvalReason: text, createdAt: timestamp, updatedAt: timestamp });
export const suggestionSchema = z.strictObject({ id, slotId: id, waitlistId: id, status: suggestionStatusSchema, reasons: z.array(text), createdAt: timestamp });
export const notificationSchema = z.strictObject({ id, offerId: id.nullable(), kind: notificationKindSchema, title: text, body: z.string().max(2000), readAt: timestamp.nullable(), createdAt: timestamp });
export const auditEventSchema = z.strictObject({ id, clinicId: id.nullable(), eventType: text, entityType: text, entityId: id, createdAt: timestamp }); // No unrestricted audit details in wire DTO.
export const searchInputSchema = z.strictObject({ serviceId: id.optional(), specialty: text.optional(), city: text.optional(), insurancePlanId: id.optional(), allowSelfPay: z.boolean().optional(), maxPriceCents: cents.optional(), startsAfter: timestamp.optional(), startsBefore: timestamp.optional(), ...paginationSchema.shape }).refine(v => !v.startsAfter || !v.startsBefore || Date.parse(v.startsAfter) < Date.parse(v.startsBefore), "Invalid interval");
export const bookInputSchema = z.strictObject({ slotId: id, expectedVersion: z.number().int().nonnegative() });
export const reasonInputSchema = z.strictObject({ reason: text });
export const approveInputSchema = z.strictObject({ suggestionId: id, expectedSlotVersion: z.number().int().nonnegative(), reason: text });
export const offerResponseInputSchema = z.strictObject({ action: z.enum(["ACCEPT", "DECLINE"]) });
export const createSlotInputSchema = z.strictObject({ clinicServiceId: id, startsAt: timestamp, endsAt: timestamp }).refine(v => Date.parse(v.startsAt) < Date.parse(v.endsAt), "Invalid interval");
export const resetInputSchema = z.strictObject({ confirmation: z.literal("RESET SYNTHETIC DEMO") });
export const sessionInputSchema = z.strictObject({ personaId: id });
export const sessionSchema = z.strictObject({ userId: id, role: roleSchema, patientId: id.nullable(), clinicIds: z.array(id) });
export const errorCodeSchema = z.enum(["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "OFFER_EXPIRED", "STALE_STATE", "INTERNAL_ERROR"]);
export const apiErrorSchema = z.strictObject({ error: z.strictObject({ code: errorCodeSchema, message: z.string(), requestId: z.string(), fieldErrors: z.record(z.string(), z.array(z.string())).optional() }) });
export const successSchema = <T extends z.ZodType>(data: T) => z.strictObject({ data });
export const pageSchema = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), nextCursor: id.nullable() });
export const searchResultSchema = z.strictObject({ slot: slotSchema, clinic: clinicSchema, clinicService: clinicServiceSchema, service: serviceSchema });
export const offerResultSchema = z.strictObject({ offer: offerSchema, booking: bookingSchema.nullable() });
export type Slot = z.infer<typeof slotSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type WaitlistRequest = z.infer<typeof waitlistSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type WaitlistPreferences = z.infer<typeof waitlistPreferencesSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
// Descriptors only: these routes have no implementation in the foundation milestone.
const endpoint = <I extends z.ZodType, O extends z.ZodType>(method: "GET" | "POST" | "PATCH", path: string, input: I, output: O) => ({ method, path, input, response: successSchema(output) });
const empty = z.strictObject({});
export const api = {
 search: endpoint("GET", "/api/v1/slots", searchInputSchema, pageSchema(searchResultSchema)),
 clinic: endpoint("GET", "/api/v1/clinics/:id", empty, z.strictObject({ clinic: clinicSchema, services: z.array(clinicServiceSchema) })),
 catalogs: endpoint("GET", "/api/v1/catalogs", empty, z.strictObject({ services: z.array(serviceSchema), plans: z.array(insurancePlanSchema) })),
 bookings: endpoint("GET", "/api/v1/bookings", paginationSchema, pageSchema(bookingSchema)),
 book: endpoint("POST", "/api/v1/bookings", bookInputSchema, bookingSchema),
 cancel: endpoint("POST", "/api/v1/bookings/:id/cancel", reasonInputSchema, bookingSchema),
 waitlists: endpoint("GET", "/api/v1/waitlists", paginationSchema, pageSchema(waitlistSchema)),
 joinWaitlist: endpoint("POST", "/api/v1/waitlists", waitlistPreferencesSchema, waitlistSchema),
 editWaitlist: endpoint("PATCH", "/api/v1/waitlists/:id", waitlistPreferencesSchema, waitlistSchema),
 withdraw: endpoint("POST", "/api/v1/waitlists/:id/withdraw", empty, waitlistSchema),
 schedule: endpoint("GET", "/api/v1/clinics/:id/slots", searchInputSchema, pageSchema(searchResultSchema)),
 createSlot: endpoint("POST", "/api/v1/clinics/:id/slots", createSlotInputSchema, slotSchema),
 withdrawSlot: endpoint("POST", "/api/v1/slots/:id/withdraw", reasonInputSchema, slotSchema),
 candidates: endpoint("GET", "/api/v1/slots/:id/candidates", paginationSchema, pageSchema(suggestionSchema)),
 regenerate: endpoint("POST", "/api/v1/slots/:id/candidates", empty, pageSchema(suggestionSchema)),
 dismiss: endpoint("POST", "/api/v1/suggestions/:id/dismiss", reasonInputSchema, suggestionSchema),
 approve: endpoint("POST", "/api/v1/slots/:id/offers", approveInputSchema, offerSchema),
 offer: endpoint("GET", "/api/v1/offers/:id", empty, offerSchema),
 respond: endpoint("POST", "/api/v1/offers/:id/respond", offerResponseInputSchema, offerResultSchema),
 notifications: endpoint("GET", "/api/v1/notifications", paginationSchema, pageSchema(notificationSchema)),
 readNotification: endpoint("POST", "/api/v1/notifications/:id/read", empty, notificationSchema),
 activity: endpoint("GET", "/api/v1/clinics/:id/activity", paginationSchema, pageSchema(auditEventSchema)),
 session: endpoint("GET", "/api/v1/session", empty, sessionSchema),
 enterDemo: endpoint("POST", "/api/v1/demo/session", sessionInputSchema, sessionSchema),
 reset: endpoint("POST", "/api/v1/demo/reset", resetInputSchema, z.strictObject({ resetAt: timestamp })),
} as const;
export type ApiInput<K extends keyof typeof api> = z.input<(typeof api)[K]["input"]>;
export type ApiResponse<K extends keyof typeof api> = z.output<(typeof api)[K]["response"]>;
