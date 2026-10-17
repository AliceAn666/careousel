import { beforeEach, afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import { locked, getState } from "../../src/server/services/scheduling";
import {
  medicalTagsDashboard,
  mutateMedicalTag,
} from "../../src/server/services/medical-tags";
import {
  provisionMockAdministrator,
  manageAccess,
} from "../../src/server/auth/accounts";
const draft = {
  type: "create",
  sourceBookingId: "phase8-visit",
  needTitle: "Skin follow-up",
  kind: "FOLLOW_UP",
  label: "Review skin care plan",
  clinicalNotes: "PRIVATE_SYNTHETIC_NOTE",
  followUpRecommendation: "Arrange follow-up visit",
  recommendedFrom: null,
  recommendedBy: null,
  requiresReferral: true,
  requiresAuthorization: false,
  reason: "Synthetic visit assessment",
};
beforeEach(async () => {
  await locked(async (tx) => {
    await seedData(tx);
    await tx.slot.create({
      data: {
        id: "phase8-past-slot",
        clinicId: "cedar",
        service: "Dermatology",
        provider: "Synthetic clinician",
        start: new Date(Date.now() - 86400000),
        end: new Date(Date.now() - 84000000),
        price: 10000,
        plans: ["Blue Horizon"],
        status: "BOOKED",
      },
    });
    await tx.waitlist.create({
      data: {
        id: "phase8-request",
        patientId: "avery",
        service: "Dermatology",
        plan: "Blue Horizon",
        clinicIds: [],
        maxPrice: 20000,
        earliest: new Date(),
        latest: new Date(Date.now() + 864000000),
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
    });
    await tx.booking.create({
      data: {
        id: "phase8-visit",
        patientId: "avery",
        slotId: "phase8-past-slot",
      },
    });
  });
});
afterAll(async () => {
  await db.$disconnect();
});
async function create() {
  return mutateMedicalTag("staff-cedar", draft);
}
async function approve(tagId: string, expectedVersion = 1) {
  return mutateMedicalTag("staff-cedar", {
    type: "approve",
    tagId,
    expectedVersion,
    reason: "Clinician reviewed source",
  });
}
it("persists patient need, provenance, notes, review and complete version snapshots without changing scheduling", async () => {
  const before = await db.booking.findMany({ orderBy: { id: "asc" } }),
    priorities = await db.waitlistPriority.findMany();
  const created = await create();
  expect((await medicalTagsDashboard("avery")).tags).toHaveLength(0);
  await approve(created.tagId);
  const tag = await db.medicalTag.findUniqueOrThrow({
    where: { id: created.tagId },
    include: { need: true, revisions: true },
  });
  expect(tag).toMatchObject({
    authorId: "staff-cedar",
    reviewedById: "staff-cedar",
    clinicId: "cedar",
    patientId: "avery",
    sourceBookingId: "phase8-visit",
    state: "APPROVED",
    version: 2,
    need: { service: "Dermatology", createdById: "staff-cedar" },
  });
  expect(tag.revisions.map((r) => r.action).sort()).toEqual([
    "APPROVE",
    "CREATE",
  ]);
  expect((await medicalTagsDashboard("avery")).tags[0]).toMatchObject({
    clinicalNotes: "PRIVATE_SYNTHETIC_NOTE",
  });
  expect((await medicalTagsDashboard("patient-1")).tags).toHaveLength(0);
  expect((await medicalTagsDashboard("staff-harbor")).tags).toHaveLength(0);
  expect(await db.booking.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  expect(await db.waitlistPriority.findMany()).toEqual(priorities);
  await mutateMedicalTag("staff-cedar", {
    ...Object.fromEntries(
      Object.entries(draft).filter(
        ([key]) => !["type", "sourceBookingId", "needTitle"].includes(key),
      ),
    ),
    type: "edit",
    tagId: created.tagId,
    expectedVersion: 2,
    label: "Updated follow-up",
    reason: "Corrected clinical recommendation",
  });
  expect((await medicalTagsDashboard("avery")).tags).toHaveLength(0);
  expect(
    await db.medicalTag.findUnique({ where: { id: created.tagId } }),
  ).toMatchObject({ state: "DRAFT", reviewedAt: null, version: 3 });
  expect(await db.medicalTagRevision.count()).toBe(3);
});
it("denies patients, unknown actors and other clinics; rejects future and cancelled sources", async () => {
  for (const id of ["avery", "patient-1", "staff-harbor", "missing"])
    await expect(mutateMedicalTag(id, draft)).rejects.toThrow();
  await db.slot.update({
    where: { id: "phase8-past-slot" },
    data: {
      start: new Date(Date.now() + 86400000),
      end: new Date(Date.now() + 88800000),
    },
  });
  await expect(create()).rejects.toThrow(/visit/);
  await db.slot.update({
    where: { id: "phase8-past-slot" },
    data: {
      start: new Date(Date.now() - 86400000),
      end: new Date(Date.now() - 84000000),
    },
  });
  await db.booking.update({
    where: { id: "phase8-visit" },
    data: { status: "CANCELLED" },
  });
  await expect(create()).rejects.toThrow(/visit/);
  expect(await db.medicalTag.count()).toBe(0);
});
it("serializes concurrent edits, rejects stale reviews, retains retired histories and protects audit snapshots", async () => {
  const { tagId } = await create();
  const outcomes = await Promise.allSettled([approve(tagId), approve(tagId)]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  await expect(
    mutateMedicalTag("staff-harbor", {
      type: "retire",
      tagId,
      expectedVersion: 2,
      reason: "Foreign clinic attempt",
    }),
  ).rejects.toThrow();
  await mutateMedicalTag("staff-cedar", {
    type: "retire",
    tagId,
    expectedVersion: 2,
    reason: "Recommendation superseded",
  });
  await expect(approve(tagId, 3)).rejects.toThrow(/Retired/);
  expect(await db.medicalTagRevision.count()).toBe(3);
  await expect(
    db.medicalTagRevision.updateMany({ data: { reason: "tampered" } }),
  ).rejects.toThrow(/append-only/);
  await expect(db.medicalTagRevision.deleteMany()).rejects.toThrow(
    /append-only/,
  );
  await expect(
    db.medicalTag.update({
      where: { id: tagId },
      data: { authorId: "staff-harbor", version: { increment: 1 } },
    }),
  ).rejects.toThrow(/immutable/);
});
it("requires explicit administrator-granted clinical permission, immediately honors revocation and hides clinical notes from scheduling staff", async () => {
  await provisionMockAdministrator({
    username: "tags.admin",
    name: "Synthetic Admin",
    email: "tags@example.test",
    password: "SyntheticPassword!123",
    clinicId: "cedar",
  });
  const account = await db.account.findUniqueOrThrow({
    where: { username: "tags.admin" },
    include: { membership: true },
  });
  const action = {
    type: "clinicalPermission",
    membershipId: account.membership!.id,
    enabled: true,
    expectedEnabled: false,
    reason: "Synthetic clinical role verified",
  };
  await expect(mutateMedicalTag(account.userId, draft)).rejects.toThrow(
    /permission/,
  );
  const { tagId } = await create();
  await approve(tagId);
  const readonly = await medicalTagsDashboard(account.userId);
  expect(readonly.canAuthor).toBe(false);
  expect(JSON.stringify(readonly)).not.toContain("PRIVATE_SYNTHETIC_NOTE");
  expect(JSON.stringify(readonly)).not.toContain("revisions");
  await expect(manageAccess("avery", action)).rejects.toThrow();
  await manageAccess(account.userId, action);
  await expect(manageAccess(account.userId, action)).rejects.toThrow(/changed/);
  expect((await medicalTagsDashboard(account.userId)).canAuthor).toBe(true);
  await mutateMedicalTag(account.userId, draft);
  await manageAccess(account.userId, {
    ...action,
    enabled: false,
    expectedEnabled: true,
    reason: "Clinical permission withdrawn",
  });
  await expect(mutateMedicalTag(account.userId, draft)).rejects.toThrow(
    /permission/,
  );
  expect(
    JSON.stringify(await medicalTagsDashboard(account.userId)),
  ).not.toContain("PRIVATE_SYNTHETIC_NOTE");
});
it("projects only approved scheduling evidence to same-clinic priority requests without private notes", async () => {
  const { tagId } = await create();
  expect(
    JSON.stringify(
      await getState(
        await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
      ),
    ),
  ).not.toContain("PRIVATE_SYNTHETIC_NOTE");
  await approve(tagId);
  const state = await getState(
    await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
  );
  expect(JSON.stringify(state)).not.toContain("PRIVATE_SYNTHETIC_NOTE");
  const relevant = state.priorityRequests.filter(
    (r) => r.patientId === "avery" && r.service === "Dermatology",
  );
  expect(relevant.length).toBeGreaterThan(0);
  expect(relevant[0].medicalEvidence[0].label).toBe(draft.label);
  const foreign = await getState(
    await db.user.findUniqueOrThrow({ where: { id: "staff-harbor" } }),
  );
  expect(
    foreign.priorityRequests.flatMap((r) => r.medicalEvidence),
  ).toHaveLength(0);
});
it("rejects cross-patient/clinic source and medical-need forgery at the database boundary", async () => {
  await expect(
    db.medicalNeed.create({
      data: {
        patientId: "patient-1",
        clinicId: "cedar",
        sourceBookingId: "phase8-visit",
        title: "Forged need",
        service: "Dermatology",
        createdById: "staff-cedar",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.medicalNeed.create({
      data: {
        patientId: "avery",
        clinicId: "harbor",
        sourceBookingId: "phase8-visit",
        title: "Forged clinic",
        service: "Dermatology",
        createdById: "staff-harbor",
      },
    }),
  ).rejects.toThrow();
  const { tagId } = await create();
  const tag = await db.medicalTag.findUniqueOrThrow({ where: { id: tagId } });
  await expect(
    db.medicalTag.create({
      data: {
        needId: tag.needId,
        patientId: "patient-1",
        clinicId: "cedar",
        sourceBookingId: "phase8-visit",
        authorId: "staff-cedar",
        updatedById: "staff-cedar",
        kind: "FOLLOW_UP",
        label: "Forged relation",
        clinicalNotes: "",
        followUpRecommendation: "",
      },
    }),
  ).rejects.toThrow();
  expect(await db.medicalTag.count()).toBe(1);
});
it("rolls back tag review and generic audit if a revision cannot be persisted", async () => {
  const { tagId } = await create();
  // Simulate a corrupt/colliding next history key without changing the live tag.
  const original = await db.medicalTag.findUniqueOrThrow({
    where: { id: tagId },
  });
  await db.medicalTagRevision.create({
    data: {
      tagId,
      version: 2,
      actorId: "staff-cedar",
      action: "EDIT",
      reason: "Synthetic storage collision",
      snapshot: { synthetic: true },
    },
  });
  const audits = await db.audit.count();
  await expect(approve(tagId)).rejects.toThrow();
  expect(
    await db.medicalTag.findUniqueOrThrow({ where: { id: tagId } }),
  ).toEqual(original);
  expect(await db.audit.count()).toBe(audits);
});
