import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { eligibility, overlaps } from "./matching";
import { OFFER_MINUTES, PLANS, SERVICES } from "../../lib/config";
import { advanceBatches } from "./notification-batches";
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
  z.object({
    type: z.literal("startBatch"),
    slotId: id,
    priorityIds: z.array(id).max(100),
    generalIds: z.array(id).max(100),
    intervalMinutes: z.number().int().min(1).max(60),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ type: z.literal("cancelBatch"), batchId: id }),
  z.object({ type: z.literal("respond"), offerId: id, accept: z.boolean() }),
  z.object({ type: z.literal("read"), notificationId: id }),
  z.object({
    type: z.literal("createSlot"),
    service: z.enum(SERVICES),
    provider: z.string().trim().min(2).max(100).default("Dr. Maya Lin"),
    durationMinutes: z.number().int().min(10).max(180).default(30),
    plans: z
      .array(z.enum(PLANS))
      .min(1)
      .max(5)
      .default([...PLANS]),
    start: z.coerce.date(),
    price: z.number().int().min(0).max(1000000),
  }),
  z.object({ type: z.literal("reset"), confirmation: z.literal("RESET") }),
]);
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
  const otherHolds = await tx.offer.count({
    where: { slotId: offer.slotId, status: "PENDING" },
  });
  const activeBatch = await tx.notificationBatch.count({
    where: { slotId: offer.slotId, status: "ACTIVE" },
  });
  if (otherHolds || activeBatch) return;
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
    await expireOffers(tx, now);
    await advanceBatches(tx, now);
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
    let message = "Changes saved.";
    switch (input.type) {
      case "book": {
        patient();
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
        patient();
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
      case "startBatch": {
        const slot = await tx.slot.findUnique({
          where: { id: input.slotId },
          include: { clinic: true },
        });
        if (!slot) fail("Slot not found.", 404);
        staff(slot.clinicId);
        const ids = [...input.priorityIds, ...input.generalIds];
        if (!ids.length || new Set(ids).size !== ids.length)
          fail("Choose distinct patients for the two groups.", 400);
        const existing = await tx.notificationBatch.findFirst({
          where: { slotId: slot.id, status: "ACTIVE" },
        });
        if (existing) {
          if (
            JSON.stringify(existing.priorityIds) ===
              JSON.stringify(input.priorityIds) &&
            JSON.stringify(existing.generalIds) ===
              JSON.stringify(input.generalIds) &&
            existing.intervalMinutes === input.intervalMinutes &&
            existing.reason === input.reason
          )
            return { message: "This notification plan is already active." };
          fail("A notification plan already holds this slot.");
        }
        if (slot.status !== "AVAILABLE")
          fail("Another booking or offer already holds this slot.");
        const bookings = await tx.booking.findMany({
          where: { status: "CONFIRMED" },
          include: { slot: true },
        });
        for (const waitlistId of ids) {
          const w = await tx.waitlist.findUnique({
            where: { id: waitlistId },
            include: { booking: { include: { slot: true } } },
          });
          if (!w || !eligibility(w, slot, bookings, now))
            fail("This patient no longer meets the eligibility requirements.");
          if (
            await tx.offer.count({
              where: { slotId: slot.id, waitlistId, status: "DECLINED" },
            })
          )
            fail(
              "This patient declined this slot. Please choose another candidate.",
            );
        }
        await tx.notificationBatch.create({
          data: {
            slotId: slot.id,
            priorityIds: input.priorityIds,
            generalIds: input.generalIds,
            intervalMinutes: input.intervalMinutes,
            reason: input.reason,
            actor: user.name,
          },
        });
        await advanceBatches(tx, now);
        message = "Group notification plan approved and started.";
        break;
      }
      case "cancelBatch": {
        const batch = await tx.notificationBatch.findUnique({
          where: { id: input.batchId },
          include: { slot: true },
        });
        if (!batch) fail("Notification plan not found.", 404);
        staff(batch.slot.clinicId);
        if (batch.status !== "ACTIVE")
          return { message: "This notification plan is already inactive." };
        await tx.notificationBatch.update({
          where: { id: batch.id },
          data: { status: "CANCELLED", nextAt: null },
        });
        const offers = await tx.offer.findMany({
          where: { batchId: batch.id, status: "PENDING" },
        });
        for (const o of offers) await releaseOffer(tx, o, "REVOKED");
        await audit(
          tx,
          batch.slot.clinicId,
          user.name,
          "Group notification plan cancelled",
        );
        message = "Notification plan cancelled. The slot is available again.";
        break;
      }
      case "respond": {
        patient();
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
        await tx.notificationBatch.updateMany({
          where: { slotId: o.slotId, status: "ACTIVE" },
          data: { status: "COMPLETED", nextAt: null },
        });
        const others = await tx.offer.findMany({
          where: {
            status: "PENDING",
            OR: [{ patientId: user.id }, { slotId: o.slotId }],
          },
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
        const end = new Date(+input.start + input.durationMinutes * 60000);
        const conflict = await tx.slot.findFirst({
          where: {
            clinicId: user.clinicId!,
            start: { lt: end },
            end: { gt: input.start },
            provider: input.provider,
          },
        });
        if (conflict) fail("This provider already has a slot at this time.");
        await tx.slot.create({
          data: {
            clinicId: user.clinicId!,
            service: input.service,
            provider: input.provider,
            start: input.start,
            end,
            price: input.price,
            plans: input.plans,
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
      case "reset": {
        staff();
        if (process.env.DEMO_MODE !== "true")
          fail("Demo reset is disabled.", 403);
        await seedData(tx, now);
        message =
          "Synthetic demo restored. Avery’s original appointment is ready.";
        break;
      }
    }
    await advanceBatches(tx, now);
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
export async function getState(user: User | null) {
  return locked(async (tx) => {
    const now = new Date();
    await expireOffers(tx, now);
    await advanceBatches(tx, now);
    await refreshMatches(tx, now);
    const clinics = await tx.clinic.findMany({ orderBy: { name: "asc" } });
    const slots = await tx.slot.findMany({
      where: { start: { gt: now } },
      include: { clinic: true },
      orderBy: { start: "asc" },
    });
    const personas =
      process.env.DEMO_MODE === "true"
        ? await tx.user.findMany({
            select: { id: true, name: true, role: true, clinicId: true },
            orderBy: { id: "asc" },
          })
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
        batches: [],
        activity: [],
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
                waitlist: { include: { patient: { select: { name: true } } } },
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
        reasons: s.reasons,
        createdAt: s.waitlist.createdAt,
      }));
    return {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        plan: user.plan,
        clinicId: user.clinicId,
      },
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
      batches: staff
        ? await tx.notificationBatch.findMany({
            where: { slot: { clinicId: user.clinicId! } },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : [],
      activity,
    };
  });
}

export async function maintainNotifications(at?: Date) {
  return locked(async (tx) => {
    const now = at ?? new Date();
    await expireOffers(tx, now);
    await advanceBatches(tx, now);
  });
}
