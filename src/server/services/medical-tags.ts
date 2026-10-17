import { Prisma, type User } from "@prisma/client";
import { medicalTagAction } from "../../lib/medical-tags";
import { ensureStaffAccess } from "../auth/access";
import { DomainError, locked } from "./scheduling";
async function actor(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new DomainError("Login required.", 401);
  if (user.role === "STAFF") await ensureStaffAccess(tx, user);
  else if (user.role !== "PATIENT")
    throw new DomainError("Access denied.", 403);
  return user;
}
async function canAuthor(tx: Prisma.TransactionClient, user: User) {
  if (user.role !== "STAFF") return false;
  const account = await tx.account.findUnique({
    where: { userId: user.id },
    include: { membership: true },
  });
  return account
    ? account.membership?.canAuthorMedicalTags === true
    : process.env.DEMO_MODE === "true" && user.id === "staff-cedar";
}
export async function medicalTagsDashboard(userId: string) {
  return locked(async (tx) => {
    const user = await actor(tx, userId),
      author = await canAuthor(tx, user);
    const staff = user.role === "STAFF";
    const tags = await tx.medicalTag.findMany({
      where: {
        ...(staff ? { clinicId: user.clinicId! } : { patientId: user.id }),
        ...(!author ? { state: "APPROVED" } : {}),
      },
      include: {
        need: true,
        ...(author
          ? { revisions: { orderBy: { version: "desc" as const } } }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    const ids = [
      ...new Set(
        tags.flatMap((t) => [
          t.authorId,
          t.updatedById,
          ...(t.reviewedById ? [t.reviewedById] : []),
        ]),
      ),
    ];
    const authors = await tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const clinics = await tx.clinic.findMany({
      where: { id: { in: [...new Set(tags.map((t) => t.clinicId))] } },
      select: { id: true, name: true },
    });
    const patients = staff
      ? await tx.user.findMany({
          where: { id: { in: [...new Set(tags.map((t) => t.patientId))] } },
          select: { id: true, name: true },
        })
      : [];
    const encounters = author
      ? await tx.booking.findMany({
          where: {
            slot: { clinicId: user.clinicId!, start: { lte: new Date() } },
            status: "CONFIRMED",
          },
          select: {
            id: true,
            patient: { select: { name: true } },
            slot: { select: { service: true, start: true, provider: true } },
          },
          orderBy: { slot: { start: "desc" } },
        })
      : [];
    return {
      canAuthor: author,
      encounters,
      authors,
      clinics,
      patients,
      tags: tags.map((t) =>
        author || !staff
          ? t
          : {
              id: t.id,
              label: t.label,
              kind: t.kind,
              need: { title: t.need.title, service: t.need.service },
              patientId: t.patientId,
              followUpRecommendation: t.followUpRecommendation,
              recommendedFrom: t.recommendedFrom,
              recommendedBy: t.recommendedBy,
              requiresReferral: t.requiresReferral,
              requiresAuthorization: t.requiresAuthorization,
              authorId: t.authorId,
              reviewedById: t.reviewedById,
              reviewedAt: t.reviewedAt,
              sourceBookingId: t.sourceBookingId,
              clinicId: t.clinicId,
              state: t.state,
              version: t.version,
              updatedAt: t.updatedAt,
            },
      ),
    };
  });
}
export async function mutateMedicalTag(userId: string, raw: unknown) {
  const input = medicalTagAction.parse(raw);
  return locked(async (tx) => {
    const user = await actor(tx, userId);
    if (!(await canAuthor(tx, user)))
      throw new DomainError(
        "Explicit clinician author permission required.",
        403,
      );
    const [{ now }] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    let tag;
    const fields =
      input.type === "create" || input.type === "edit"
        ? {
            kind: input.kind,
            label: input.label,
            clinicalNotes: input.clinicalNotes,
            followUpRecommendation: input.followUpRecommendation,
            recommendedFrom: input.recommendedFrom
              ? new Date(input.recommendedFrom)
              : null,
            recommendedBy: input.recommendedBy
              ? new Date(input.recommendedBy)
              : null,
            requiresReferral: input.requiresReferral,
            requiresAuthorization: input.requiresAuthorization,
          }
        : null;
    if (input.type === "create") {
      const booking = await tx.booking.findFirst({
        where: {
          id: input.sourceBookingId,
          slot: { clinicId: user.clinicId!, start: { lte: now } },
          status: "CONFIRMED",
        },
        include: { slot: true },
      });
      if (!booking)
        throw new DomainError(
          "An existing visit at your clinic, during or after its start, is required.",
          403,
        );
      let need = input.needId
        ? await tx.medicalNeed.findFirst({
            where: {
              id: input.needId,
              clinicId: user.clinicId!,
              patientId: booking.patientId,
              service: booking.slot.service,
            },
          })
        : null;
      if (input.needId && !need)
        throw new DomainError("Medical need not found.", 404);
      need ??= await tx.medicalNeed.create({
        data: {
          patientId: booking.patientId,
          clinicId: user.clinicId!,
          sourceBookingId: booking.id,
          createdById: user.id,
          title: input.needTitle,
          service: booking.slot.service,
        },
      });
      tag = await tx.medicalTag.create({
        data: {
          ...fields!,
          needId: need.id,
          patientId: booking.patientId,
          clinicId: user.clinicId!,
          sourceBookingId: booking.id,
          authorId: user.id,
          updatedById: user.id,
        },
      });
    } else {
      const existing = await tx.medicalTag.findFirst({
        where: { id: input.tagId, clinicId: user.clinicId! },
      });
      if (!existing) throw new DomainError("Medical tag not found.", 404);
      if (existing.version !== input.expectedVersion)
        throw new DomainError(
          "Tag changed; refresh before editing or reviewing.",
        );
      if (existing.state === "RETIRED")
        throw new DomainError("Retired tags remain read-only.");
      if (input.type === "approve" && existing.state !== "DRAFT")
        throw new DomainError("Only draft tags can be approved.");
      tag = await tx.medicalTag.update({
        where: { id: existing.id },
        data: {
          ...(fields ?? {}),
          version: { increment: 1 },
          updatedById: user.id,
          state:
            input.type === "approve"
              ? "APPROVED"
              : input.type === "retire"
                ? "RETIRED"
                : "DRAFT",
          reviewedById: input.type === "approve" ? user.id : null,
          reviewedAt: input.type === "approve" ? now : null,
        },
      });
    }
    await tx.medicalTagRevision.create({
      data: {
        tagId: tag.id,
        version: tag.version,
        actorId: user.id,
        action: input.type.toUpperCase(),
        reason: input.reason,
        snapshot: JSON.parse(JSON.stringify(tag)) as Prisma.InputJsonValue,
      },
    });
    await tx.audit.create({
      data: {
        clinicId: user.clinicId!,
        actor: user.id,
        action: `Medical tag ${input.type}: ${tag.id} v${tag.version}`,
      },
    });
    return {
      message: "Medical tag saved. Scheduling priority is unchanged.",
      tagId: tag.id,
      version: tag.version,
    };
  });
}
