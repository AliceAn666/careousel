import { createHash } from "node:crypto";
import { Prisma, type PatientNeed, type User } from "@prisma/client";
import {
  patientNeedAction,
  needPreferences,
  type PatientNeedAction,
} from "../../lib/patient-needs";
import { DomainError, locked } from "./scheduling";
function reportKey(
  service: string,
  e: { clinicName: string; reference: string; start: Date; location: string },
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        e.clinicName.trim().toLowerCase(),
        ...(e.reference
          ? ["REFERENCE", e.reference.trim().toLowerCase()]
          : [service, e.start.toISOString(), e.location.trim().toLowerCase()]),
      ]),
    )
    .digest("hex");
}
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function needHistory(
  tx: Prisma.TransactionClient,
  need: PatientNeed,
  actorId: string,
  action: string,
  details: unknown,
) {
  await tx.patientNeedHistory.create({
    data: {
      needId: need.id,
      version: need.version,
      actorId,
      action,
      details: json({ need, ...(details as object) }),
    },
  });
}
export async function touchNeed(
  tx: Prisma.TransactionClient,
  id: string,
  actorId: string,
  action: string,
  data: Prisma.PatientNeedUncheckedUpdateInput,
  details: unknown = {},
) {
  const need = await tx.patientNeed.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
  });
  await needHistory(tx, need, actorId, action, details);
  return need;
}
export async function checkedNeed(
  tx: Prisma.TransactionClient,
  user: User,
  id: string,
  version?: number,
) {
  if (user.role !== "PATIENT")
    throw new DomainError("Patient account required.", 403);
  const need = await tx.patientNeed.findFirst({
    where: { id, patientId: user.id },
    include: {
      currentBooking: { include: { slot: true } },
      externalAppointment: true,
    },
  });
  if (!need) throw new DomainError("Medical need not found.", 404);
  if (version !== undefined && need.version !== version)
    throw new DomainError("Medical need changed; refresh before continuing.");
  return need;
}
export async function stopNeedRequests(
  tx: Prisma.TransactionClient,
  needId: string,
  winningRequest?: string,
) {
  const offers = await tx.offer.findMany({
    where: { waitlist: { needId }, status: "PENDING" },
    include: { slot: true },
  });
  for (const offer of offers) {
    await tx.offer.update({
      where: { id: offer.id },
      data: { status: "REVOKED" },
    });
    if (!offer.groupId)
      await tx.slot.updateMany({
        where: { id: offer.slotId, status: "HELD" },
        data: { status: "AVAILABLE" },
      });
  }
  await tx.waitlist.updateMany({
    where: {
      needId,
      status: "ACTIVE",
      ...(winningRequest ? { id: { not: winningRequest } } : {}),
    },
    data: { status: "WITHDRAWN" },
  });
}
async function evidence(
  tx: Prisma.TransactionClient,
  need: PatientNeed,
  tagIds: string[],
) {
  const tags = await tx.medicalTag.findMany({
    where: {
      id: { in: tagIds },
      patientId: need.patientId,
      need: { service: need.service },
      state: "APPROVED",
      OR: [{ sourceImportId: null }, { sourceImport: { state: "ACTIVE" } }],
    },
  });
  if (tags.length !== new Set(tagIds).size)
    throw new DomainError(
      "Choose your approved tags for this service with active source consent.",
      400,
    );
  await tx.patientNeedEvidence.deleteMany({ where: { needId: need.id } });
  await tx.patientNeedEvidence.createMany({
    data: tags.map((t) => ({
      needId: need.id,
      patientId: need.patientId,
      tagId: t.id,
    })),
  });
}
export async function handlePatientNeed(
  tx: Prisma.TransactionClient,
  user: User,
  raw: PatientNeedAction,
  now: Date,
) {
  const input = patientNeedAction.parse(raw);
  if (user.role !== "PATIENT")
    throw new DomainError(
      "Only patients can manage their needs or external reports.",
      403,
    );
  if (input.type === "createNeed" || input.type === "editNeed") {
    const p = input.preferences;
    if (p.plan !== user.plan)
      throw new DomainError(
        "Use your saved insurance plan for a medical need request; incompatible clinics remain visible with warnings.",
        400,
      );
    if (p.latest <= now)
      throw new DomainError("Choose a future search window.", 400);
    if (
      (await tx.clinic.count({ where: { id: { in: p.clinicIds } } })) !==
      new Set(p.clinicIds).size
    )
      throw new DomainError("Unknown preferred clinic.", 400);
    if (input.type === "createNeed") {
      let bookingId: string | null = null,
        externalId: string | null = null;
      if (input.original.type === "INTERNAL") {
        const b = await tx.booking.findFirst({
          where: {
            id: input.original.bookingId,
            patientId: user.id,
            status: "CONFIRMED",
            needId: null,
            slot: { service: input.service },
          },
        });
        if (!b)
          throw new DomainError(
            "Choose your unassigned confirmed appointment for this service.",
            400,
          );
        if (
          await tx.waitlist.findFirst({
            where: { bookingId: b.id, status: "ACTIVE" },
          })
        )
          throw new DomainError(
            "This original already has an active replacement request; withdraw it before assigning a medical need.",
          );
        bookingId = b.id;
      } else if (input.original.type === "EXTERNAL") {
        const key = reportKey(input.service, input.original.appointment);
        if (
          await tx.externalAppointment.findUnique({
            where: {
              patientId_reportKey: { patientId: user.id, reportKey: key },
            },
          })
        )
          throw new DomainError(
            "This external appointment is already assigned to a medical need. Manage that need instead.",
          );
        const e = await tx.externalAppointment.create({
          data: {
            ...input.original.appointment,
            reportKey: key,
            patientId: user.id,
            service: input.service,
          },
        });
        externalId = e.id;
      }
      const need = await tx.patientNeed.create({
        data: {
          patientId: user.id,
          title: input.title,
          service: input.service,
          preferences: json(p),
          requiresReferral: input.requiresReferral,
          requiresAuthorization: input.requiresAuthorization,
          originalBookingId: bookingId,
          currentBookingId: bookingId,
          externalAppointmentId: externalId,
        },
      });
      if (bookingId)
        await tx.booking.update({
          where: { id: bookingId },
          data: { needId: need.id },
        });
      await evidence(tx, need, input.tagIds);
      await needHistory(tx, need, user.id, "CREATE", {
        external:
          input.original.type === "EXTERNAL"
            ? input.original.appointment
            : null,
        tagIds: input.tagIds,
      });
      return {
        message:
          "Independent medical need saved. External appointments are patient-reported and unverified.",
        needId: need.id,
      };
    }
    const need = await checkedNeed(
      tx,
      user,
      input.needId,
      input.expectedVersion,
    );
    if (["CLOSED", "COMPLETED"].includes(need.state))
      throw new DomainError("Reopen this need before editing it.");
    await stopNeedRequests(tx, need.id);
    await evidence(tx, need, input.tagIds);
    await touchNeed(
      tx,
      need.id,
      user.id,
      "EDIT",
      {
        title: input.title,
        preferences: json(p),
        requiresReferral: input.requiresReferral,
        requiresAuthorization: input.requiresAuthorization,
      },
      { previous: need, tagIds: input.tagIds },
    );
    return {
      message:
        "Only this need's preferences changed. Its old request was withdrawn; create a fresh request for staff review. Other needs and bookings are unchanged.",
    };
  }
  const need = await checkedNeed(tx, user, input.needId, input.expectedVersion);
  if (input.type === "requestNeed") {
    if (["CLOSED", "COMPLETED"].includes(need.state))
      throw new DomainError("Reopen this need before seeking appointments.");
    if (
      await tx.waitlist.findFirst({
        where: { needId: need.id, status: "ACTIVE" },
      })
    )
      return {
        message: "This need already has an active shared cross-clinic request.",
      };
    const p = needPreferences.parse(need.preferences);
    if (p.latest <= now)
      throw new DomainError("Update the search window before joining.", 400);
    const booking =
      need.currentBooking?.status === "CONFIRMED" ? need.currentBooking : null;
    const ext =
      !booking &&
      need.externalAppointment &&
      !need.externalAppointment.reportedCancelled
        ? need.externalAppointment
        : null;
    if ((booking && booking.slot.start <= now) || (ext && ext.start <= now))
      throw new DomainError(
        "The reported original date has passed; update the external report or register a fresh need instead.",
      );
    const request = await tx.waitlist.create({
      data: {
        ...p,
        service: need.service,
        patientId: user.id,
        needId: need.id,
        bookingId: booking?.id ?? null,
        externalAppointmentId: ext?.id ?? null,
        requiresReferral: need.requiresReferral,
        requiresAuthorization: need.requiresAuthorization,
      },
    });
    await touchNeed(
      tx,
      need.id,
      user.id,
      "REQUEST",
      { state: "OPEN" },
      { requestId: request.id },
    );
    return {
      message:
        "This need joined the shared cross-clinic waitlist. Original appointments and other needs remain unchanged.",
      waitlistId: request.id,
    };
  }
  if (input.type === "editExternal") {
    if (!need.externalAppointment)
      throw new DomainError("This need has no external appointment.", 404);
    const key = reportKey(need.service, input.appointment);
    const duplicate = await tx.externalAppointment.findUnique({
      where: { patientId_reportKey: { patientId: user.id, reportKey: key } },
    });
    if (duplicate && duplicate.id !== need.externalAppointment.id)
      throw new DomainError(
        "This external appointment belongs to another need; manage that need instead.",
      );
    await stopNeedRequests(tx, need.id);
    const updated = await tx.externalAppointment.update({
      where: { id: need.externalAppointment.id },
      data: {
        ...input.appointment,
        reportKey: key,
        reportedCancelled: input.reportedCancelled,
        version: { increment: 1 },
      },
    });
    await touchNeed(
      tx,
      need.id,
      user.id,
      "EXTERNAL_REPORT",
      {},
      {
        before: need.externalAppointment,
        after: updated,
        reason: input.reason,
      },
    );
    return {
      message:
        "Patient-reported external details saved, still unverified. Careousel did not contact or cancel any external appointment. This need's previous request was withdrawn for fresh review.",
    };
  }
  await stopNeedRequests(tx, need.id);
  const state =
    input.type === "completeNeed"
      ? "COMPLETED"
      : input.type === "closeNeed"
        ? "CLOSED"
        : "OPEN";
  await touchNeed(tx, need.id, user.id, input.type, { state });
  return {
    message: `Need ${state.toLowerCase()}. Only this need's search requests stopped; all appointments and other medical needs are preserved.`,
  };
}
export async function patientNeedsDashboard(userId: string) {
  return locked(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "PATIENT")
      throw new DomainError("Patient account required.", 403);
    const needs = await tx.patientNeed.findMany({
      where: { patientId: user.id },
      include: {
        originalBooking: { include: { slot: { include: { clinic: true } } } },
        currentBooking: { include: { slot: { include: { clinic: true } } } },
        externalAppointment: true,
        evidence: { select: { tagId: true } },
        waitlists: {
          include: {
            priorities: {
              select: { clinicId: true, level: true, reviewState: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        history: { orderBy: { version: "desc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    const bookings = await tx.booking.findMany({
      where: { patientId: user.id, status: "CONFIRMED", needId: null },
      include: { slot: { include: { clinic: true } } },
    });
    const tags = await tx.medicalTag.findMany({
      where: {
        patientId: user.id,
        state: "APPROVED",
        OR: [{ sourceImportId: null }, { sourceImport: { state: "ACTIVE" } }],
      },
      select: {
        id: true,
        label: true,
        clinicId: true,
        sourceType: true,
        requiresReferral: true,
        requiresAuthorization: true,
        need: { select: { service: true } },
      },
    });
    const openings = await tx.slot.findMany({
      where: { status: "AVAILABLE", start: { gt: new Date() } },
      include: { clinic: true },
      orderBy: { start: "asc" },
    });
    const clinics = await tx.clinic.findMany({
      select: { id: true, name: true, city: true },
      orderBy: { name: "asc" },
    });
    return { needs, bookings, tags, openings, clinics, plan: user.plan };
  });
}
