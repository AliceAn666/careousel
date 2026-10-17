import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { eligibility, type RequestWithBooking } from "./matching";
import { DomainError, locked } from "./scheduling";
import { ensureStaffAccess } from "../auth/access";

export const GROUP_INTERVAL_MS = 180 * 60_000;
export const INVITATION_LIFETIME_MS = 12 * 60 * 60_000;
export function requirementsMet(
  slot: { requiresReferral?: boolean; requiresAuthorization?: boolean },
  priority:
    | {
        reviewState: string;
        referralApproved: boolean;
        authorizationApproved: boolean;
      }
    | null
    | undefined,
) {
  return (
    (!slot.requiresReferral ||
      (priority?.reviewState === "APPROVED" && priority.referralApproved)) &&
    (!slot.requiresAuthorization ||
      (priority?.reviewState === "APPROVED" && priority.authorizationApproved))
  );
}
const recipientSchema = z.object({
  waitlistId: z.string(),
  priorityVersion: z.number(),
  fingerprint: z.string(),
});
const recipientsSchema = z.array(recipientSchema);
export const sequenceActionSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("start"),
      slotId: z.string().min(1),
      previewToken: z.string(),
      firstGroup: z.number().int().min(1).max(4),
      approvedWaitlistIds: z.array(z.string()).max(500),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      operation: z.enum(["pause", "resume", "cancel"]),
      slotId: z.string().min(1),
    })
    .strict(),
]);
async function databaseTime(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  return row.now;
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function fingerprint(w: RequestWithBooking) {
  return hash([
    w.service,
    w.plan,
    w.city,
    w.clinicIds,
    w.maxPrice,
    w.earliest,
    w.latest,
    w.startHour,
    w.endHour,
    w.weekdays,
    w.bookingId,
    w.status,
  ]);
}
async function clinicActor(
  tx: Prisma.TransactionClient,
  userId: string,
  clinicId: string,
) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  await ensureStaffAccess(tx, user);
  if (user.clinicId !== clinicId)
    throw new DomainError("This opening belongs to another clinic.", 403);
  return user;
}
async function warning(
  tx: Prisma.TransactionClient,
  clinicId: string,
  body: string,
  now: Date,
) {
  await tx.audit.create({
    data: {
      clinicId,
      actor: "Notification scheduler",
      action: body,
      createdAt: now,
    },
  });
  const staff = await tx.user.findMany({
    where: { role: "STAFF", clinicId },
    select: { id: true },
  });
  await tx.notification.createMany({
    data: staff.map((s) => ({
      patientId: s.id,
      title: "Notification sequence needs attention",
      body,
      createdAt: now,
    })),
  });
}
export async function previewSequence(
  tx: Prisma.TransactionClient,
  userId: string,
  slotId: string,
  now: Date,
) {
  const slot = await tx.slot.findUniqueOrThrow({
    where: { id: slotId },
    include: { clinic: true },
  });
  await clinicActor(tx, userId, slot.clinicId);
  const [requests, bookings, declined] = await Promise.all([
    tx.waitlist.findMany({
      where: { status: "ACTIVE", service: slot.service },
      include: {
        booking: { include: { slot: true } },
        patient: { select: { name: true } },
        priorities: { where: { clinicId: slot.clinicId } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.booking.findMany({
      where: { status: "CONFIRMED" },
      include: { slot: true },
    }),
    tx.offer.findMany({
      where: { slotId, status: "DECLINED" },
      select: { waitlistId: true },
    }),
  ]);
  const candidates = requests.map((w) => {
    const priority = w.priorities[0];
    const reasons = eligibility(w, slot, bookings, now);
    const excluded = !requirementsMet(slot, priority)
      ? "Required referral or authorization has not been approved by this clinic"
      : !reasons
        ? "Service, insurance, budget, time or appointment restrictions do not match"
        : declined.some((o) => o.waitlistId === w.id)
          ? "Patient declined this opening"
          : priority?.reviewState !== "APPROVED" || !priority.level
            ? "No approved priority for this request at this clinic"
            : null;
    return {
      waitlistId: w.id,
      name: w.patient.name,
      level: priority?.level ?? null,
      priorityVersion: priority?.version ?? 0,
      fingerprint: fingerprint(w),
      reasons: reasons ?? [],
      excluded,
    };
  });
  return {
    slotId,
    capacity: slot.status === "AVAILABLE" && slot.start > now ? 1 : 0,
    candidates,
    previewToken: hash([slot.id, slot.status, slot.start, candidates]),
  };
}
export async function getSequencePreview(userId: string, slotId: string) {
  return locked((tx) => previewSequence(tx, userId, slotId, new Date()));
}
export async function finishSequence(
  tx: Prisma.TransactionClient,
  slotId: string,
  state: "COMPLETED" | "CANCELLED",
  now: Date,
) {
  const seq = await tx.notificationSequence.findFirst({
    where: { slotId },
    orderBy: { createdAt: "desc" },
  });
  if (!seq) return;
  await tx.notificationSequence.update({
    where: { id: seq.id },
    data: { state, nextSendAt: null },
  });
  await tx.notificationGroup.updateMany({
    where: { sequenceId: seq.id, status: "APPROVED" },
    data: {
      status: "CANCELLED",
      note:
        state === "COMPLETED"
          ? "Capacity filled; future sends cancelled"
          : "Opening unavailable or sequence cancelled",
    },
  });
  const others = await tx.offer.findMany({
    where: { slotId, status: "PENDING", groupId: { not: null } },
  });
  for (const o of others) {
    await tx.offer.update({ where: { id: o.id }, data: { status: "REVOKED" } });
    await tx.notification.create({
      data: {
        patientId: o.patientId,
        title: "Invitation no longer available",
        body: "This opening was filled or withdrawn. Your original appointment is unchanged.",
        createdAt: now,
      },
    });
  }
}
async function sendDue(
  tx: Prisma.TransactionClient,
  sequenceId: string,
  now: Date,
) {
  const seq = await tx.notificationSequence.findUniqueOrThrow({
    where: { id: sequenceId },
    include: {
      slot: { include: { clinic: true } },
      groups: { orderBy: { level: "asc" } },
    },
  });
  if (seq.slot.status !== "AVAILABLE" || seq.slot.start <= now) {
    await finishSequence(
      tx,
      seq.slotId,
      seq.slot.status === "BOOKED" ? "COMPLETED" : "CANCELLED",
      now,
    );
    return;
  }
  if (
    !["ACTIVE", "SCHEDULED"].includes(seq.state) ||
    !seq.nextSendAt ||
    seq.nextSendAt > now
  )
    return;
  if (seq.lastSentAt && +now - +seq.lastSentAt < GROUP_INTERVAL_MS) return;
  try {
    await clinicActor(tx, seq.authorizedById, seq.slot.clinicId);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    await tx.notificationSequence.update({
      where: { id: seq.id },
      data: { state: "PAUSED", nextSendAt: null },
    });
    await warning(
      tx,
      seq.slot.clinicId,
      "Paused: sequence author is no longer authorized. Review and resume with current clinic authority.",
      now,
    );
    return;
  }
  const bookings = await tx.booking.findMany({
    where: { status: "CONFIRMED" },
    include: { slot: true },
  });
  for (const group of seq.groups.filter((g) => g.status === "APPROVED")) {
    const approved = recipientsSchema.parse(group.recipients);
    const valid: { waitlistId: string; patientId: string }[] = [];
    for (const recipient of approved) {
      const w = await tx.waitlist.findUnique({
        where: { id: recipient.waitlistId },
        include: {
          booking: { include: { slot: true } },
          priorities: { where: { clinicId: seq.slot.clinicId } },
        },
      });
      const p = w?.priorities[0];
      if (!w || w.status !== "ACTIVE") continue;
      // A changed request/decision needs new review; never substitute new recipients.
      if (
        fingerprint(w) !== recipient.fingerprint ||
        p?.reviewState !== "APPROVED" ||
        p.level !== group.level ||
        p.version !== recipient.priorityVersion
      ) {
        await tx.notificationSequence.update({
          where: { id: seq.id },
          data: { state: "PAUSED", nextSendAt: null },
        });
        await warning(
          tx,
          seq.slot.clinicId,
          `Paused: ${group.level} authorization changed. Review and explicitly reauthorize remaining groups; no changed list was sent.`,
          now,
        );
        return;
      }
      if (!p.assignedById) continue;
      try {
        await clinicActor(tx, p.assignedById, seq.slot.clinicId);
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        continue;
      }
      if (
        !requirementsMet(seq.slot, p) ||
        !eligibility(w, seq.slot, bookings, now)
      )
        continue;
      if (
        await tx.offer.findFirst({
          where: { slotId: seq.slotId, waitlistId: w.id, status: "DECLINED" },
        })
      )
        continue;
      valid.push({ waitlistId: w.id, patientId: w.patientId });
    }
    if (!valid.length) {
      await tx.notificationGroup.update({
        where: { id: group.id },
        data: {
          status: "SKIPPED",
          note: "No eligible authorized recipients; no send timestamp",
        },
      });
      await warning(
        tx,
        seq.slot.clinicId,
        `${group.level} skipped: no eligible approved recipients.`,
        now,
      );
      continue;
    }
    if (valid.length < approved.length)
      await warning(
        tx,
        seq.slot.clinicId,
        `${group.level}: ${approved.length - valid.length} approved recipients were skipped because eligibility or reviewer authority is no longer valid; no substitute recipients were added.`,
        now,
      );
    const expiresAt = new Date(
      Math.min(+now + INVITATION_LIFETIME_MS, +seq.slot.start),
    );
    for (const recipient of valid) {
      const offer = await tx.offer.create({
        data: {
          ...recipient,
          slotId: seq.slotId,
          groupId: group.id,
          reason: `${group.level} · ${seq.reason}`,
          expiresAt,
          createdAt: now,
        },
      });
      await tx.notification.create({
        data: {
          patientId: recipient.patientId,
          offerId: offer.id,
          title: "An appointment opening is available",
          body: `${seq.slot.clinic.name} · ${seq.slot.service}. Your clinic-approved group was invited. Other eligible patients may also receive this opening; confirmation is first successful booking. Your original appointment stays confirmed until replacement succeeds.`,
          createdAt: now,
        },
      });
    }
    await tx.notificationGroup.update({
      where: { id: group.id },
      data: {
        status: "SENT",
        sentAt: now,
        note: `${valid.length} in-app invitations sent; ${approved.length - valid.length} no longer eligible`,
      },
    });
    const remaining = seq.groups.some(
      (g) => g.level > group.level && g.status === "APPROVED",
    );
    await tx.notificationSequence.update({
      where: { id: seq.id },
      data: {
        state: remaining ? "ACTIVE" : "COMPLETED",
        lastSentAt: now,
        nextSendAt: remaining ? new Date(+now + GROUP_INTERVAL_MS) : null,
      },
    });
    await tx.audit.create({
      data: {
        clinicId: seq.slot.clinicId,
        actor: "Notification scheduler",
        action: `${group.level} actually sent to ${valid.length} approved recipients`,
        createdAt: now,
      },
    });
    if (+seq.slot.start - +now < GROUP_INTERVAL_MS + 10 * 60_000)
      await warning(
        tx,
        seq.slot.clinicId,
        "Appointment is too close for another group to have a full response window.",
        now,
      );
    return; // Never catch up several sends in one execution.
  }
  await tx.notificationSequence.update({
    where: { id: seq.id },
    data: { state: "COMPLETED", nextSendAt: null },
  });
}
export async function sequenceAction(
  userId: string,
  raw: unknown,
  options: { now?: Date } = {},
) {
  const input = sequenceActionSchema.parse(raw);
  return locked(async (tx) => {
    const now = options.now ?? (await databaseTime(tx));
    const slot = await tx.slot.findUniqueOrThrow({
      where: { id: input.slotId },
    });
    await clinicActor(tx, userId, slot.clinicId);
    let seq = await tx.notificationSequence.findFirst({
      where: { slotId: slot.id },
      orderBy: { createdAt: "desc" },
    });
    if (input.operation === "start") {
      if (seq && ["CANCELLED", "COMPLETED"].includes(seq.state)) seq = null;
      if (seq && seq.state !== "PAUSED")
        throw new DomainError(
          "A sequence already exists. Refresh its history and controls.",
        );
      if (slot.status !== "AVAILABLE" || slot.start <= now)
        throw new DomainError("Opening is unavailable.");
      if (
        await tx.offer.count({
          where: {
            slotId: slot.id,
            status: "PENDING",
            ...(seq ? { groupId: null } : {}),
          },
        })
      )
        throw new DomainError(
          "An existing exclusive invitation must finish first.",
        );
      const preview = await previewSequence(tx, userId, slot.id, now);
      if (preview.previewToken !== input.previewToken)
        throw new DomainError("Preview changed. Review recipients again.");
      const approved = preview.candidates.filter((c) =>
        input.approvedWaitlistIds.includes(c.waitlistId),
      );
      if (
        !approved.length ||
        approved.length !== new Set(input.approvedWaitlistIds).size ||
        approved.some(
          (c) => c.excluded || Number(c.level?.slice(1)) < input.firstGroup,
        )
      )
        throw new DomainError(
          "Approve only eligible recipients in the selected and later groups.",
        );
      if (seq) {
        const groups = await tx.notificationGroup.findMany({
          where: { sequenceId: seq.id },
        });
        const lastSentLevel = Math.max(
          0,
          ...groups
            .filter((g) => g.status === "SENT")
            .map((g) => Number(g.level.slice(1))),
        );
        if (input.firstGroup <= lastSentLevel)
          throw new DomainError(
            "Previously sent groups cannot be sent again. Select a later first group.",
          );
        for (const group of groups.filter((g) => g.status !== "SENT")) {
          const n = Number(group.level.slice(1));
          await tx.notificationGroup.update({
            where: { id: group.id },
            data: {
              status: n < input.firstGroup ? "SKIPPED" : "APPROVED",
              note: "Staff explicitly reviewed new recipient snapshot",
              recipients: approved
                .filter((c) => c.level === group.level)
                .map((c) => ({
                  waitlistId: c.waitlistId,
                  priorityVersion: c.priorityVersion,
                  fingerprint: c.fingerprint,
                })),
            },
          });
        }
        seq = await tx.notificationSequence.update({
          where: { id: seq.id },
          data: {
            authorizedById: userId,
            reason: input.reason,
            firstGroup: input.firstGroup,
            state: "SCHEDULED",
            nextSendAt: new Date(
              Math.max(
                +now,
                seq.lastSentAt ? +seq.lastSentAt + GROUP_INTERVAL_MS : +now,
              ),
            ),
          },
        });
      } else {
        const previousSend = await tx.notificationGroup.findFirst({
          where: { sequence: { slotId: slot.id }, sentAt: { not: null } },
          orderBy: { sentAt: "desc" },
        });
        seq = await tx.notificationSequence.create({
          data: {
            slotId: slot.id,
            authorizedById: userId,
            firstGroup: input.firstGroup,
            reason: input.reason,
            state: "SCHEDULED",
            lastSentAt: previousSend?.sentAt ?? null,
            nextSendAt: new Date(
              Math.max(
                +now,
                previousSend?.sentAt
                  ? +previousSend.sentAt + GROUP_INTERVAL_MS
                  : +now,
              ),
            ),
            createdAt: now,
            groups: {
              create: [1, 2, 3, 4].map((n) => ({
                level: `P${n}`,
                status: n < input.firstGroup ? "SKIPPED" : "APPROVED",
                note:
                  n < input.firstGroup
                    ? "Staff selected a later first group"
                    : "",
                recipients: approved
                  .filter((c) => c.level === `P${n}`)
                  .map((c) => ({
                    waitlistId: c.waitlistId,
                    priorityVersion: c.priorityVersion,
                    fingerprint: c.fingerprint,
                  })),
              })),
            },
          },
        });
      }
      await sendDue(tx, seq.id, now);
    } else {
      if (!seq) throw new DomainError("No sequence exists.", 404);
      if (slot.status === "BOOKED")
        return {
          message: "Appointment is filled; sequence already terminated.",
        };
      if (input.operation === "cancel")
        await finishSequence(tx, slot.id, "CANCELLED", now);
      else if (input.operation === "pause") {
        if (!["ACTIVE", "SCHEDULED"].includes(seq.state))
          throw new DomainError("Only an active sequence can pause.");
        await tx.notificationSequence.update({
          where: { id: seq.id },
          data: { state: "PAUSED", nextSendAt: null },
        });
      } else {
        if (seq.state !== "PAUSED")
          throw new DomainError("Only a paused sequence can resume.");
        // Resume reauthorizes the SAME snapshot, never a changed recipient list.
        await tx.notificationSequence.update({
          where: { id: seq.id },
          data: {
            state: "SCHEDULED",
            authorizedById: userId,
            nextSendAt: new Date(
              Math.max(
                +now,
                seq.lastSentAt ? +seq.lastSentAt + GROUP_INTERVAL_MS : +now,
              ),
            ),
          },
        });
        await sendDue(tx, seq.id, now);
      }
    }
    await tx.audit.create({
      data: {
        clinicId: slot.clinicId,
        actor: userId,
        action:
          input.operation === "start"
            ? `Notification sequence authorization: first P${input.firstGroup}; requests ${input.approvedWaitlistIds.join(",")}; reason ${input.reason}`
            : `Notification sequence: ${input.operation}`,
        createdAt: now,
      },
    });
    return { message: "Notification sequence updated." };
  });
}
// Independent worker entry. Transaction + persisted group status make retries/restarts safe.
export async function processNotificationSequences(
  options: { now?: Date; clock?: () => Date } = {},
) {
  return locked(async (tx) => {
    const now = options.clock?.() ?? options.now ?? (await databaseTime(tx));
    const sequences = await tx.notificationSequence.findMany({
      where: { state: { not: "CANCELLED" } },
      select: { id: true },
    });
    for (const seq of sequences) await sendDue(tx, seq.id, now);
    await tx.offer.updateMany({
      where: {
        groupId: { not: null },
        status: "PENDING",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    });
    return { checked: sequences.length };
  });
}

export async function validateGroupInvitation(
  tx: Prisma.TransactionClient,
  groupId: string,
  w: RequestWithBooking,
  clinicId: string,
) {
  const group = await tx.notificationGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: { sequence: true },
  });
  const p = await tx.waitlistPriority.findUnique({
    where: { waitlistId_clinicId: { waitlistId: w.id, clinicId } },
  });
  const recipient = recipientsSchema
    .parse(group.recipients)
    .find((r) => r.waitlistId === w.id);
  if (
    group.sequence.state === "CANCELLED" ||
    !recipient ||
    p?.reviewState !== "APPROVED" ||
    p.level !== group.level ||
    p.version !== recipient.priorityVersion ||
    fingerprint(w) !== recipient.fingerprint ||
    !p.assignedById
  )
    throw new DomainError(
      "This invitation requires renewed clinic review. Your original appointment is unchanged.",
    );
  await clinicActor(tx, p.assignedById, clinicId);
}
