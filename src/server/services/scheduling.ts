import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { eligibility, overlaps } from "./matching";
import {
  DEMO_PERSONAS,
  OFFER_MINUTES,
  PLANS,
  SERVICES,
} from "../../lib/config";
import { DURATIONS, SYMPTOM_AREAS, WARNING_SIGNS } from "../../lib/priority";
import { PRIORITY_LEVELS } from "../../lib/waitlist-priority";
import { priorityInclude, priorityRequestScope } from "./waitlist-priority";
import { ensureStaffAccess } from "../auth/access";
import { seedData } from "../../../prisma/seed-data";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function fail(message: string, status = 409): never {
  throw new DomainError(message, status);
}
const id = z.string().min(1).max(100);
const preferences = {
  service: z.enum(SERVICES),
  plan: z.enum(PLANS),
  city: z.string().max(80).default(""),
  clinicIds: z.array(id).max(4).default([]),
  maxPrice: z.number().int().min(0).max(1000000),
  earliest: z.coerce.date(),
  latest: z.coerce.date(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
};
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("book"), slotId: id }),
  z.object({ type: z.literal("cancel"), bookingId: id }),
  z.object({
    type: z.literal("waitlist"),
    ...preferences,
    bookingId: id.optional(),
    waitlistId: id.optional(),
  }),
  z.object({ type: z.literal("withdraw"), waitlistId: id }),
  z.object({
    type: z.literal("approve"),
    slotId: id,
    waitlistId: id,
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ type: z.literal("respond"), offerId: id, accept: z.boolean() }),
  z.object({ type: z.literal("read"), notificationId: id }),
  z.object({
    type: z.literal("createSlot"),
    service: z.enum(SERVICES),
    start: z.coerce.date(),
    price: z.number().int().min(0).max(1000000),
  }),
  z.object({ type: z.literal("reset"), confirmation: z.literal("RESET") }),
  z.object({
    type: z.literal("intake"),
    symptoms: z
      .array(
        z.object({
          area: z.enum(SYMPTOM_AREAS.map((a) => a.id) as [AreaId, ...AreaId[]]),
          pain: z.number().int().min(0).max(10),
          duration: z.enum(
            DURATIONS.map((d) => d.id) as [DurationId, ...DurationId[]],
          ),
          worsening: z.boolean(),
        }),
      )
      .min(1)
      .max(SYMPTOM_AREAS.length)
      .refine(
        (list) => new Set(list.map((s) => s.area)).size === list.length,
        "Each symptom area can be reported once.",
      ),
    warningSigns: z
      .array(z.enum(WARNING_SIGNS.map((w) => w.id) as [SignId, ...SignId[]]))
      .max(WARNING_SIGNS.length)
      .default([]),
  }),
  z
    .object({
      type: z.literal("setWaitlistPriority"),
      waitlistId: id,
      clinicId: id,
      level: z.enum(PRIORITY_LEVELS),
      expectedVersion: z.number().int().min(0),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);
type AreaId = (typeof SYMPTOM_AREAS)[number]["id"];
type DurationId = (typeof DURATIONS)[number]["id"];
type SignId = (typeof WARNING_SIGNS)[number]["id"];
export type Action = z.input<typeof actionSchema>;
async function audit(
  tx: Prisma.TransactionClient,
  clinicId: string,
  actor: string,
  action: string,
) {
  await tx.audit.create({ data: { clinicId, actor, action } });
}
// A single transaction-scoped advisory lock serializes demo scheduling operations.
// This deliberately favors reviewable correctness over throughput for 50 demo slots.
export async function locked<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728194)`;
      return fn(tx);
    },
    { timeout: 30000, maxWait: 15000 },
  );
}
async function releaseOffer(
  tx: Prisma.TransactionClient,
  offer: { id: string; slotId: string; status: string },
  status: string,
) {
  if (offer.status !== "PENDING") return;
  await tx.offer.update({ where: { id: offer.id }, data: { status } });
  await tx.slot.updateMany({
    where: { id: offer.slotId, status: "HELD" },
    data: { status: "AVAILABLE" },
  });
}
export async function expireOffers(tx: Prisma.TransactionClient, now: Date) {
  const expired = await tx.offer.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
  });
  for (const o of expired) {
    await releaseOffer(tx, o, "EXPIRED");
    const s = await tx.slot.findUniqueOrThrow({ where: { id: o.slotId } });
    await audit(tx, s.clinicId, "System", "Invitation expired; slot released");
  }
}
export async function refreshMatches(tx: Prisma.TransactionClient, now: Date) {
  const [slots, requests, bookings] = await Promise.all([
    tx.slot.findMany({
      where: { status: "AVAILABLE", start: { gt: now } },
      include: { clinic: true },
    }),
    tx.waitlist.findMany({
      where: { status: "ACTIVE" },
      include: { booking: { include: { slot: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.booking.findMany({
      where: { status: "CONFIRMED" },
      include: { slot: true },
    }),
  ]);
  await tx.suggestion.deleteMany();
  for (const slot of slots)
    for (const request of requests) {
      const reasons = eligibility(request, slot, bookings, now);
      if (reasons)
        await tx.suggestion.create({
          data: { slotId: slot.id, waitlistId: request.id, reasons },
        });
    }
}
async function revokeRequests(
  tx: Prisma.TransactionClient,
  where: Prisma.WaitlistWhereInput,
) {
  const requests = await tx.waitlist.findMany({
    where,
    include: { offers: { where: { status: "PENDING" } } },
  });
  for (const r of requests)
    for (const o of r.offers) await releaseOffer(tx, o, "REVOKED");
}
async function assertBookable(
  tx: Prisma.TransactionClient,
  patientId: string,
  slotId: string,
  excludeBooking?: string,
  allowHeld = false,
  now = new Date(),
) {
  const s = await tx.slot.findUnique({
    where: { id: slotId },
    include: { clinic: true },
  });
  if (
    !s ||
    s.start <= now ||
    !(allowHeld ? s.status === "HELD" : s.status === "AVAILABLE")
  )
    fail("This appointment is no longer available. Please refresh.");
  const bookings = await tx.booking.findMany({
    where: { patientId, status: "CONFIRMED" },
    include: { slot: true },
  });
  if (bookings.some((b) => b.id !== excludeBooking && overlaps(b.slot, s)))
    fail("This time overlaps another confirmed appointment.");
  return s;
}
export async function performAction(
  userId: string,
  raw: unknown,
  options: {
    now?: Date;
    clock?: () => Date;
    failAfterReplacement?: boolean;
    failRefreshMatches?: boolean;
  } = {},
) {
  const input = actionSchema.parse(raw);
  const result = await locked(async (tx) => {
    const now = options.clock?.() ?? options.now ?? new Date();
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) fail("Please select a demo persona.", 401);
    if (user.role === "STAFF") await ensureStaffAccess(tx, user);
    await expireOffers(tx, now);
    const staff = (clinicId?: string) => {
      if (
        user.role !== "STAFF" ||
        !user.clinicId ||
        (clinicId && user.clinicId !== clinicId)
      )
        fail("This action is outside your clinic permissions.", 403);
    };
    const patient = () => {
      if (user.role !== "PATIENT")
        fail("Select a patient persona for this action.", 403);
    };
    // First-visit patients must finish the intake questionnaire before
    // booking, joining a waitlist or accepting an offer.
    const intakeDone = async () => {
      patient();
      if (
        user.visitType === "FIRST" &&
        !(await tx.intake.findUnique({ where: { patientId: user.id } }))
      )
        fail("Please complete your intake questionnaire first.", 403);
    };
    let message = "Changes saved.";
    switch (input.type) {
      case "book": {
        await intakeDone();
        const existing = await tx.booking.findFirst({
          where: {
            patientId: user.id,
            slotId: input.slotId,
            status: "CONFIRMED",
          },
        });
        if (existing) return { message: "Appointment already confirmed." };
        const s = await assertBookable(
          tx,
          user.id,
          input.slotId,
          undefined,
          false,
          now,
        );
        if (!s.plans.includes(user.plan))
          fail("Your demo insurance plan is not accepted.");
        await tx.booking.create({ data: { patientId: user.id, slotId: s.id } });
        await tx.slot.update({
          where: { id: s.id },
          data: { status: "BOOKED" },
        });
        // A new booking can invalidate another pending invitation through overlap.
        const pending = await tx.offer.findMany({
          where: { patientId: user.id, status: "PENDING" },
          include: { slot: true },
        });
        for (const o of pending)
          if (overlaps(s, o.slot)) await releaseOffer(tx, o, "REVOKED");
        await audit(tx, s.clinicId, user.name, "Appointment booked");
        message = "Appointment confirmed. You’re all set.";
        break;
      }
      case "cancel": {
        const b = await tx.booking.findUnique({
          where: { id: input.bookingId },
          include: { slot: true },
        });
        if (!b) fail("Appointment not found.", 404);
        if (user.role === "STAFF") staff(b.slot.clinicId);
        else if (b.patientId !== user.id)
          fail("This is not your appointment.", 403);
        if (b.status !== "CONFIRMED")
          return {
            message: "Appointment was already cancelled or rescheduled.",
          };
        await revokeRequests(tx, { bookingId: b.id, status: "ACTIVE" });
        await tx.waitlist.updateMany({
          where: { bookingId: b.id, status: "ACTIVE" },
          data: { status: "WITHDRAWN" },
        });
        await tx.booking.update({
          where: { id: b.id },
          data: { status: "CANCELLED" },
        });
        await tx.slot.update({
          where: { id: b.slotId },
          data: { status: "AVAILABLE" },
        });
        await audit(
          tx,
          b.slot.clinicId,
          user.name,
          "Appointment cancelled; eligible waitlist matches generated",
        );
        message = "Appointment cancelled. The slot is available for matching.";
        break;
      }
      case "waitlist": {
        await intakeDone();
        if (
          input.earliest >= input.latest ||
          input.endHour <= input.startHour ||
          input.latest <= now
        )
          fail("Choose a valid future date and time window.", 400);
        if (input.bookingId) {
          const b = await tx.booking.findUnique({
            where: { id: input.bookingId },
            include: { slot: true },
          });
          if (
            !b ||
            b.patientId !== user.id ||
            b.status !== "CONFIRMED" ||
            b.slot.service !== input.service
          )
            fail("Choose your confirmed appointment for this service.", 400);
        }
        if (
          input.clinicIds.length &&
          (await tx.clinic.count({
            where: { id: { in: input.clinicIds } },
          })) !== new Set(input.clinicIds).size
        )
          fail("Unknown clinic.", 400);
        const { type: _, waitlistId, ...data } = input;
        void _;
        const existing = await tx.waitlist.findFirst({
          where: {
            patientId: user.id,
            service: input.service,
            status: "ACTIVE",
          },
        });
        if (waitlistId) {
          const w = await tx.waitlist.findUnique({ where: { id: waitlistId } });
          if (!w || w.patientId !== user.id || w.status !== "ACTIVE")
            fail("Waitlist request not found.", 404);
          if (existing && existing.id !== w.id)
            fail("You already have an active waitlist for this service.");
          await revokeRequests(tx, { id: w.id });
          const reviewed = await tx.waitlistPriority.findMany({
            where: { waitlistId: w.id, reviewState: "APPROVED" },
          });
          for (const priority of reviewed) {
            const version = priority.version + 1;
            const reason =
              "Patient edited request preferences; staff re-review required.";
            await tx.priorityHistory.create({
              data: {
                priorityId: priority.id,
                previousLevel: priority.level,
                level: null,
                actorId: user.id,
                reason,
                version,
                createdAt: now,
              },
            });
            await tx.waitlistPriority.update({
              where: { id: priority.id },
              data: {
                level: null,
                reviewState: "UNREVIEWED",
                assignedById: null,
                assignedAt: null,
                reason,
                version,
              },
            });
          }
          await tx.waitlist.update({
            where: { id: w.id },
            data: { ...data, bookingId: input.bookingId ?? null },
          });
        } else {
          if (existing)
            fail(
              "You already have an active waitlist for this service. Edit it from My waitlist.",
            );
          await tx.waitlist.create({ data: { ...data, patientId: user.id } });
        }
        message =
          "Waitlist preferences saved. Your existing appointment stays confirmed.";
        break;
      }
      case "withdraw": {
        patient();
        const w = await tx.waitlist.findUnique({
          where: { id: input.waitlistId },
        });
        if (!w || w.patientId !== user.id)
          fail("Waitlist request not found.", 404);
        if (w.status !== "ACTIVE")
          return { message: "This waitlist request is already inactive." };
        await revokeRequests(tx, { id: w.id });
        await tx.waitlist.update({
          where: { id: w.id },
          data: { status: "WITHDRAWN" },
        });
        message = "Waitlist withdrawn. Your existing booking is unchanged.";
        break;
      }
      case "approve": {
        const s = await tx.slot.findUnique({
          where: { id: input.slotId },
          include: { clinic: true },
        });
        if (!s) fail("Slot not found.", 404);
        staff(s.clinicId);
        const duplicate = await tx.offer.findFirst({
          where: {
            slotId: s.id,
            waitlistId: input.waitlistId,
            status: "PENDING",
          },
        });
        if (duplicate)
          return {
            message: "An invitation is already pending for this patient.",
          };
        if (s.status !== "AVAILABLE")
          fail("Another booking or offer already holds this slot.");
        const w = await tx.waitlist.findUnique({
          where: { id: input.waitlistId },
          include: { booking: { include: { slot: true } } },
        });
        const bookings = await tx.booking.findMany({
          where: { status: "CONFIRMED" },
          include: { slot: true },
        });
        if (!w || !eligibility(w, s, bookings, now))
          fail("This patient no longer meets the eligibility requirements.");
        const declined = await tx.offer.findFirst({
          where: { slotId: s.id, waitlistId: w.id, status: "DECLINED" },
        });
        if (declined)
          fail(
            "This patient declined this slot. Please choose another candidate.",
          );
        const offer = await tx.offer.create({
          data: {
            slotId: s.id,
            waitlistId: w.id,
            patientId: w.patientId,
            reason: input.reason,
            expiresAt: new Date(+now + OFFER_MINUTES * 60000),
          },
        });
        await tx.slot.update({ where: { id: s.id }, data: { status: "HELD" } });
        await tx.notification.create({
          data: {
            patientId: w.patientId,
            offerId: offer.id,
            title: "An earlier appointment is ready",
            body: `${s.clinic.name} approved a ${s.service} opening. Accept within ${OFFER_MINUTES} minutes to confirm.`,
          },
        });
        await audit(
          tx,
          s.clinicId,
          user.name,
          `Approved an eligible match: ${input.reason}`,
        );
        message = "Invitation sent. The slot is held for 10 minutes.";
        break;
      }
      case "respond": {
        if (input.accept) await intakeDone();
        else patient();
        const o = await tx.offer.findUnique({
          where: { id: input.offerId },
          include: {
            slot: { include: { clinic: true } },
            waitlist: { include: { booking: { include: { slot: true } } } },
          },
        });
        if (!o || o.patientId !== user.id) fail("Invitation not found.", 404);
        if (o.status === "ACCEPTED" && input.accept)
          return { message: "This appointment is already confirmed." };
        if (o.status === "DECLINED" && !input.accept)
          return { message: "This invitation was already declined." };
        if (o.status !== "PENDING" || o.expiresAt <= now)
          fail(
            "This invitation is no longer active. Your original appointment is unchanged.",
          );
        if (!input.accept) {
          await releaseOffer(tx, o, "DECLINED");
          await audit(
            tx,
            o.slot.clinicId,
            user.name,
            "Patient declined invitation",
          );
          message =
            "Invitation declined. Your original appointment is unchanged.";
          break;
        }
        const bookings = await tx.booking.findMany({
          where: { status: "CONFIRMED" },
          include: { slot: true },
        });
        if (!eligibility(o.waitlist, o.slot, bookings, now))
          fail(
            "Your preferences or appointments changed. This offer cannot be accepted.",
          );
        await assertBookable(
          tx,
          user.id,
          o.slotId,
          o.waitlist.bookingId ?? undefined,
          true,
          now,
        );
        const replacement = await tx.booking.create({
          data: { patientId: user.id, slotId: o.slotId },
        });
        if (o.waitlist.bookingId) {
          const old = o.waitlist.booking!;
          await tx.booking.update({
            where: { id: old.id },
            data: { status: "RESCHEDULED", replacementId: replacement.id },
          });
          await tx.slot.update({
            where: { id: old.slotId },
            data: { status: "AVAILABLE" },
          });
          await audit(
            tx,
            old.slot.clinicId,
            user.name,
            "Original appointment rescheduled; slot released",
          );
        }
        if (options.failAfterReplacement)
          throw new Error("Injected replacement failure");
        await tx.offer.update({
          where: { id: o.id },
          data: { status: "ACCEPTED" },
        });
        await tx.slot.update({
          where: { id: o.slotId },
          data: { status: "BOOKED" },
        });
        await tx.waitlist.update({
          where: { id: o.waitlistId },
          data: { status: "FULFILLED" },
        });
        const others = await tx.offer.findMany({
          where: { patientId: user.id, status: "PENDING" },
        });
        for (const other of others) await releaseOffer(tx, other, "REVOKED");
        await tx.notification.create({
          data: {
            patientId: user.id,
            title: "Your earlier appointment is confirmed",
            body: `Your ${o.slot.service} appointment at ${o.slot.clinic.name} is confirmed. Any linked original booking has been rescheduled.`,
          },
        });
        await audit(
          tx,
          o.slot.clinicId,
          user.name,
          "Earlier appointment accepted and confirmed",
        );
        message =
          "Earlier appointment confirmed. Your schedule has been updated.";
        break;
      }
      case "read": {
        patient();
        const updated = await tx.notification.updateMany({
          where: { id: input.notificationId, patientId: user.id },
          data: { read: true },
        });
        if (!updated.count) fail("Notification not found.", 404);
        break;
      }
      case "createSlot": {
        staff();
        if (input.start <= now) fail("New slots must be in the future.", 400);
        const end = new Date(+input.start + 1800000);
        const conflict = await tx.slot.findFirst({
          where: {
            clinicId: user.clinicId!,
            start: { lt: end },
            end: { gt: input.start },
            provider: "Dr. Maya Lin",
          },
        });
        if (conflict) fail("This provider already has a slot at this time.");
        await tx.slot.create({
          data: {
            clinicId: user.clinicId!,
            service: input.service,
            provider: "Dr. Maya Lin",
            start: input.start,
            end,
            price: input.price,
            plans: [...PLANS],
          },
        });
        await audit(
          tx,
          user.clinicId!,
          user.name,
          "Created a new appointment opening",
        );
        message = "New appointment opening created.";
        break;
      }
      case "intake": {
        patient();
        if (user.visitType !== "FIRST")
          fail("Only first-visit patients complete the intake form.", 403);
        if (await tx.intake.findUnique({ where: { patientId: user.id } }))
          return { message: "Your intake questionnaire is already complete." };
        const answers = {
          symptoms: input.symptoms,
          warningSigns: input.warningSigns,
        };
        await tx.intake.create({ data: { patientId: user.id, answers } });
        message =
          "Thanks — your synthetic questionnaire is saved. Request priority requires separate staff review.";
        break;
      }
      case "setWaitlistPriority": {
        staff(input.clinicId);
        const request = await tx.waitlist.findFirst({
          where: {
            id: input.waitlistId,
            ...priorityRequestScope(input.clinicId),
          },
        });
        if (!request)
          fail("This request is outside your clinic scope or inactive.", 403);
        const current = await tx.waitlistPriority.findUnique({
          where: {
            waitlistId_clinicId: {
              waitlistId: request.id,
              clinicId: input.clinicId,
            },
          },
        });
        // A repeated successful submission is safe, but a different actor,
        // reason or outdated conflicting decision must not overwrite history.
        if (
          current?.reviewState === "APPROVED" &&
          current.level === input.level &&
          current.assignedById === user.id &&
          current.reason === input.reason &&
          (current.version === input.expectedVersion ||
            current.version === input.expectedVersion + 1)
        )
          return { message: "This request priority is already saved." };
        if ((current?.version ?? 0) !== input.expectedVersion)
          fail(
            "Priority changed. Refresh and review the current decision before saving.",
          );
        const data = {
          level: input.level,
          reviewState: "APPROVED",
          assignedById: user.id,
          assignedAt: now,
          reason: input.reason,
          version: input.expectedVersion + 1,
        };
        const priority = await tx.waitlistPriority.upsert({
          where: {
            waitlistId_clinicId: {
              waitlistId: request.id,
              clinicId: input.clinicId,
            },
          },
          create: { waitlistId: request.id, clinicId: input.clinicId, ...data },
          update: data,
        });
        await tx.priorityHistory.create({
          data: {
            priorityId: priority.id,
            previousLevel: current?.level ?? null,
            level: input.level,
            actorId: user.id,
            reason: input.reason,
            version: priority.version,
            createdAt: now,
          },
        });
        await audit(
          tx,
          input.clinicId,
          user.name,
          `Assigned ${input.level} to waitlist request ${request.id}: ${input.reason}`,
        );
        message =
          "Request priority saved. No appointment or invitation was changed.";
        break;
      }
      case "reset": {
        staff();
        if (await tx.account.findUnique({ where: { userId: user.id } }))
          fail(
            "Reset requires an explicit synthetic Demo Mode staff session.",
            403,
          );
        if (process.env.DEMO_MODE !== "true")
          fail("Demo reset is disabled.", 403);
        await seedData(tx, now);
        message =
          "Synthetic demo restored. Avery’s original appointment is ready.";
        break;
      }
    }
    if (input.type !== "cancel") {
      if (options.failRefreshMatches)
        throw new Error("Injected match refresh failure");
      await refreshMatches(tx, now);
    }
    return { message };
  });
  if (input.type === "cancel") {
    try {
      await locked(async (tx) => {
        const now = options.clock?.() ?? options.now ?? new Date();
        if (options.failRefreshMatches)
          throw new Error("Injected match refresh failure");
        await refreshMatches(tx, now);
      });
    } catch {
      return {
        message:
          "Appointment cancelled. Matching will retry on the next refresh.",
      };
    }
  }
  return result;
}
// Compatibility endpoint uses exactly the same authorization and confirmation
// rules as the explicit Reset Demo action. Never call this during navigation.
export async function restartDemo(
  userId: string,
  raw: unknown,
  options: { now?: Date } = {},
) {
  const confirmation = z
    .object({ confirmation: z.literal("RESET") })
    .parse(raw);
  return performAction(userId, { type: "reset", ...confirmation }, options);
}
export async function getState(
  user: User | null,
  options: { demoMode?: boolean } = {},
) {
  return locked(async (tx) => {
    if (user?.role === "STAFF") await ensureStaffAccess(tx, user);
    const now = new Date();
    await expireOffers(tx, now);
    await refreshMatches(tx, now);
    const clinics = await tx.clinic.findMany({ orderBy: { name: "asc" } });
    const slots = await tx.slot.findMany({
      where: { start: { gt: now } },
      include: { clinic: true },
      orderBy: { start: "asc" },
    });
    const personas =
      process.env.DEMO_MODE === "true" && options.demoMode !== false
        ? (
            await tx.user.findMany({
              where: { id: { in: [...DEMO_PERSONAS] } },
              select: {
                id: true,
                name: true,
                role: true,
                clinicId: true,
                visitType: true,
              },
            })
          ).sort(
            (a, b) =>
              DEMO_PERSONAS.indexOf(a.id as (typeof DEMO_PERSONAS)[number]) -
              DEMO_PERSONAS.indexOf(b.id as (typeof DEMO_PERSONAS)[number]),
          )
        : [];
    if (!user)
      return {
        user: null,
        clinics,
        slots: slots.filter((s) => s.status === "AVAILABLE"),
        personas,
        bookings: [],
        waitlists: [],
        offers: [],
        notifications: [],
        candidates: [],
        activity: [],
        myTags: [],
        priorityRequests: [],
      };
    const staff = user.role === "STAFF";
    const [bookings, waitlists, offers, notifications, suggestions, activity] =
      await Promise.all([
        tx.booking.findMany({
          where: staff
            ? { slot: { clinicId: user.clinicId! } }
            : { patientId: user.id },
          include: {
            slot: { include: { clinic: true } },
            patient: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        staff
          ? Promise.resolve([])
          : tx.waitlist.findMany({
              where: { patientId: user.id },
              include: {
                priorities: {
                  include: priorityInclude,
                  orderBy: { clinicId: "asc" },
                },
              },
              orderBy: { createdAt: "desc" },
            }),
        tx.offer.findMany({
          where: staff
            ? { slot: { clinicId: user.clinicId! } }
            : { patientId: user.id },
          include: { slot: { include: { clinic: true } } },
          orderBy: { createdAt: "desc" },
        }),
        staff
          ? Promise.resolve([])
          : tx.notification.findMany({
              where: { patientId: user.id },
              orderBy: { createdAt: "desc" },
            }),
        staff
          ? tx.suggestion.findMany({
              where: { slot: { clinicId: user.clinicId! } },
              include: {
                waitlist: {
                  include: {
                    patient: { select: { name: true, visitType: true } },
                  },
                },
              },
              orderBy: [
                { waitlist: { createdAt: "asc" } },
                { waitlistId: "asc" },
              ],
            })
          : Promise.resolve([]),
        staff
          ? tx.audit.findMany({
              where: { clinicId: user.clinicId! },
              orderBy: { createdAt: "desc" },
              take: 50,
            })
          : Promise.resolve([]),
      ]);
    const declined = await tx.offer.findMany({
      where: {
        status: "DECLINED",
        slot: { clinicId: user.clinicId ?? "__none__" },
      },
      select: { slotId: true, waitlistId: true },
    });
    const priorityRequests = staff
      ? await tx.waitlist.findMany({
          where: priorityRequestScope(user.clinicId!),
          select: {
            id: true,
            service: true,
            createdAt: true,
            bookingId: true,
            patient: { select: { name: true } },
            priorities: {
              where: { clinicId: user.clinicId! },
              include: priorityInclude,
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : [];
    const candidates = suggestions
      .filter(
        (s) =>
          !declined.some(
            (o) => o.slotId === s.slotId && o.waitlistId === s.waitlistId,
          ),
      )
      .map((s) => ({
        id: s.id,
        slotId: s.slotId,
        waitlistId: s.waitlistId,
        name: s.waitlist.patient.name,
        visitType: s.waitlist.patient.visitType,
        reasons: s.reasons,
        createdAt: s.waitlist.createdAt,
        priority:
          priorityRequests.find((w) => w.id === s.waitlistId)?.priorities[0] ??
          null,
      }));
    let myTags = staff
      ? []
      : await tx.symptomTag.findMany({
          where: { patientId: user.id },
          select: { id: true, label: true, source: true },
          orderBy: { label: "asc" },
        });
    const intake = staff
      ? null
      : await tx.intake.findUnique({ where: { patientId: user.id } });
    // Display the patient's saved self-report labels, without computing a
    // severity score or exposing another clinic's historical tags to staff.
    if (
      intake?.answers &&
      typeof intake.answers === "object" &&
      !Array.isArray(intake.answers)
    ) {
      const parsed = actionSchema.safeParse({
        ...intake.answers,
        type: "intake",
      });
      if (parsed.success && parsed.data.type === "intake") {
        myTags = parsed.data.symptoms.map((symptom) => ({
          id: `intake-${symptom.area}`,
          label: SYMPTOM_AREAS.find((area) => area.id === symptom.area)!.label,
          source: "QUESTIONNAIRE",
        }));
      }
    }
    return {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        plan: user.plan,
        clinicId: user.clinicId,
        visitType: user.visitType,
        intakeCompleted: !!intake,
      },
      myTags,
      priorityRequests,
      clinics,
      slots: slots.filter((s) =>
        staff ? s.clinicId === user.clinicId : s.status === "AVAILABLE",
      ),
      personas,
      bookings,
      waitlists,
      offers,
      notifications,
      candidates,
      activity,
    };
  });
}
