import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { locked, getState } from "../../src/server/services/scheduling";
import { seedData } from "../../prisma/seed-data";
import {
  medicalRecordsDashboard,
  mutateMedicalRecords,
} from "../../src/server/services/medical-records";
import {
  medicalTagsDashboard,
  mutateMedicalTag,
} from "../../src/server/services/medical-tags";
import {
  registerPatient,
  provisionMockAdministrator,
  manageAccess,
} from "../../src/server/auth/accounts";
import { SYNTHETIC_SOURCE } from "../../src/lib/record-import";
beforeEach(async () => {
  await locked((tx) => seedData(tx));
});
afterAll(async () => {
  await db.$disconnect();
});
const grant = (clinicId = "cedar") => ({
  type: "authorizeImport",
  clinicId,
  source: SYNTHETIC_SOURCE,
  consent: true,
  consentVersion: "SYNTHETIC_V1",
  requestId: randomUUID(),
});
async function imported(patientId = "avery", clinicId = "cedar") {
  const result = await mutateMedicalRecords(patientId, grant(clinicId));
  return result.importId!;
}
async function extracted(patientId = "avery") {
  const importId = await imported(patientId);
  await mutateMedicalRecords(patientId, {
    type: "extract",
    importId,
    mode: "LOCAL_RULES",
  });
  return {
    importId,
    suggestion: await db.importedTagSuggestion.findFirstOrThrow({
      where: { importId },
    }),
  };
}
async function clinician(clinicId = "harbor") {
  await provisionMockAdministrator({
    username: `records.${clinicId}`,
    name: "Synthetic Clinician",
    email: `records@${clinicId}.example.test`,
    password: "SyntheticPassword!123",
    clinicId,
  });
  const account = await db.account.findUniqueOrThrow({
    where: { username: `records.${clinicId}` },
    include: { membership: true },
  });
  await manageAccess(account.userId, {
    type: "clinicalPermission",
    membershipId: account.membership!.id,
    enabled: true,
    expectedEnabled: false,
    reason: "Synthetic clinical credential review",
  });
  return account.userId;
}
const review = (
  s: { id: string; version: number; fields: unknown },
  decision = "APPROVE",
) => ({
  type: "review",
  suggestionId: s.id,
  expectedVersion: s.version,
  decision,
  fields: s.fields,
  reason: "Reviewed synthetic source evidence",
});
it("imports for a newly registered patient with no tags or visits, requires clinic-specific consent and is retry-safe", async () => {
  await registerPatient({
    username: "new.records",
    name: "Synthetic New Patient",
    email: "newrecords@example.test",
    password: "SyntheticPassword!123",
    plan: "Blue Horizon",
  });
  const user = (
    await db.account.findUniqueOrThrow({ where: { username: "new.records" } })
  ).userId;
  const payload = grant();
  const a = await mutateMedicalRecords(user, payload);
  const b = await mutateMedicalRecords(user, payload);
  expect(a.importId).toBe(b.importId);
  expect(await db.importedMedicalRecord.count()).toBe(4);
  expect(await db.medicalTag.count({ where: { patientId: user } })).toBe(0);
  expect(await db.booking.count({ where: { patientId: user } })).toBe(0);
  await expect(
    mutateMedicalRecords(user, { ...grant(), consent: false }),
  ).rejects.toThrow();
  await expect(mutateMedicalRecords("staff-cedar", grant())).rejects.toThrow(
    /patient/,
  );
  await expect(mutateMedicalRecords(user, grant())).rejects.toThrow(
    /active authorized/,
  );
});
it("searches literal keywords and PostgreSQL full text without leaking another patient's records or interpreting SQL", async () => {
  await imported();
  await imported("patient-1");
  expect(
    (await medicalRecordsDashboard("avery", { q: "eczema", mode: "keyword" }))
      .records,
  ).toHaveLength(1);
  expect(
    (
      await medicalRecordsDashboard("avery", {
        q: "referrals",
        mode: "fulltext",
      })
    ).records.length,
  ).toBeGreaterThan(0);
  expect(
    (
      await medicalRecordsDashboard("avery", {
        q: "' OR 1=1; DROP TABLE",
        mode: "keyword",
      })
    ).records,
  ).toHaveLength(0);
  expect((await medicalRecordsDashboard("avery")).imports).toHaveLength(1);
  expect(await db.medicalRecordImport.count()).toBe(2);
});
it("denies ordinary staff, patients reviewing, foreign clinicians, and unconsented clinic access", async () => {
  const { suggestion } = await extracted();
  const foreign = await clinician();
  await expect(medicalRecordsDashboard("staff-harbor")).rejects.toThrow(
    /permission/,
  );
  expect((await medicalRecordsDashboard(foreign)).records).toHaveLength(0);
  await expect(
    mutateMedicalRecords(foreign, review(suggestion)),
  ).rejects.toThrow(/unavailable/);
  await expect(
    mutateMedicalRecords("avery", review(suggestion)),
  ).rejects.toThrow(/Clinician/);
  expect((await medicalRecordsDashboard("patient-1")).records).toHaveLength(0);
});
it("keeps local/AI-fallback extraction unconfirmed, preserves reviews on retries and never assigns priorities", async () => {
  const { importId, suggestion } = await extracted();
  expect(await db.medicalTag.count()).toBe(0);
  const priorities = await db.waitlistPriority.findMany();
  await mutateMedicalRecords("staff-cedar", review(suggestion, "REJECT"));
  await mutateMedicalRecords("avery", {
    type: "extract",
    importId,
    mode: "LOCAL_AI",
  });
  expect(await db.importedTagSuggestion.count()).toBe(3);
  expect(
    await db.importedTagSuggestion.findUnique({ where: { id: suggestion.id } }),
  ).toMatchObject({ state: "REJECTED", version: 2 });
  expect(await db.medicalTag.count()).toBe(0);
  expect(await db.waitlistPriority.findMany()).toEqual(priorities);
});
it("lets clinicians correct then approve evidence into Part A without a prior visit, preserving original source and manual priority", async () => {
  const { suggestion, importId } = await extracted();
  const bookings = await db.booking.findMany({ orderBy: { id: "asc" } });
  const priorities = await db.waitlistPriority.findMany();
  const corrected = {
    ...(suggestion.fields as object),
    label: "Clinician corrected synthetic follow-up",
    service: "Dermatology",
    clinicalNotes: "PRIVATE_REVIEW_ONLY",
  };
  await mutateMedicalRecords("staff-cedar", {
    ...review(suggestion, "SAVE"),
    fields: corrected,
  });
  expect(await db.medicalTag.count()).toBe(0);
  const saved = await db.importedTagSuggestion.findUniqueOrThrow({
    where: { id: suggestion.id },
  });
  const approved = await mutateMedicalRecords("staff-cedar", review(saved));
  const tag = await db.medicalTag.findUniqueOrThrow({
    where: { id: approved.tagId! },
    include: { need: true, revisions: true },
  });
  expect(tag).toMatchObject({
    state: "APPROVED",
    sourceType: "SYNTHETIC_RECORD_REVIEW",
    sourceBookingId: null,
    sourceImportId: importId,
    sourceRecordId: suggestion.recordId,
    sourceExcerpt: suggestion.excerpt,
    reviewedById: "staff-cedar",
    need: { service: "Dermatology", sourceBookingId: null },
  });
  expect(tag.revisions).toHaveLength(1);
  expect((await medicalTagsDashboard("avery")).tags).toHaveLength(1);
  const state = await getState(
    await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
  );
  expect(JSON.stringify(state)).not.toContain("PRIVATE_REVIEW_ONLY");
  expect(await db.booking.findMany({ orderBy: { id: "asc" } })).toEqual(
    bookings,
  );
  expect(await db.waitlistPriority.findMany()).toEqual(priorities);
  await expect(
    mutateMedicalRecords("staff-cedar", review(saved)),
  ).rejects.toThrow(/changed|reviewed/);
});
it("serializes review races and preserves source records, rejected suggestions and audit entries", async () => {
  const { suggestion } = await extracted();
  const result = await Promise.allSettled([
    mutateMedicalRecords("staff-cedar", review(suggestion)),
    mutateMedicalRecords("staff-cedar", review(suggestion)),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.medicalTag.count()).toBe(1);
  await expect(
    db.importedMedicalRecord.updateMany({ data: { text: "tampered" } }),
  ).rejects.toThrow(/append-only/);
  await expect(db.medicalRecordAudit.deleteMany()).rejects.toThrow(
    /append-only/,
  );
});
it("revokes consent atomically, hides records/history from clinics, retires evidence and preserves private patient archives", async () => {
  const { suggestion, importId } = await extracted();
  const approved = await mutateMedicalRecords(
    "staff-cedar",
    review(suggestion),
  );
  const records = await db.importedMedicalRecord.findMany();
  await mutateMedicalRecords("avery", {
    type: "revoke",
    importId,
    expectedVersion: 1,
  });
  expect((await medicalRecordsDashboard("staff-cedar")).records).toHaveLength(
    0,
  );
  expect(
    (await medicalRecordsDashboard("staff-cedar")).suggestions,
  ).toHaveLength(0);
  expect((await medicalTagsDashboard("staff-cedar")).tags).toHaveLength(0);
  expect((await medicalRecordsDashboard("avery")).records).toHaveLength(4);
  expect(await db.importedMedicalRecord.findMany()).toEqual(records);
  expect(
    await db.medicalTag.findUnique({ where: { id: approved.tagId! } }),
  ).toMatchObject({ state: "RETIRED", version: 2 });
  await expect(
    mutateMedicalRecords("staff-cedar", review(suggestion)),
  ).rejects.toThrow(/unavailable/);
  await expect(
    mutateMedicalRecords("avery", {
      type: "extract",
      importId,
      mode: "LOCAL_RULES",
    }),
  ).rejects.toThrow(/consent/);
  await expect(
    mutateMedicalTag("staff-cedar", {
      type: "approve",
      tagId: approved.tagId,
      expectedVersion: 2,
      reason: "Attempt after consent withdrawn",
    }),
  ).rejects.toThrow(/consent/);
  await expect(
    mutateMedicalRecords("patient-1", {
      type: "revoke",
      importId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow(/not found/);
  expect(
    await db.medicalTagRevision.findMany({ where: { tagId: approved.tagId! } }),
  ).toHaveLength(2);
});
it("handles concurrent revocation and clinical approval without leaving usable imported evidence", async () => {
  const { suggestion, importId } = await extracted();
  await Promise.allSettled([
    mutateMedicalRecords("staff-cedar", review(suggestion)),
    mutateMedicalRecords("avery", {
      type: "revoke",
      importId,
      expectedVersion: 1,
    }),
  ]);
  expect(
    await db.medicalRecordImport.findUnique({ where: { id: importId } }),
  ).toMatchObject({ state: "REVOKED" });
  expect(
    await db.medicalTag.count({
      where: { sourceImportId: importId, state: "APPROVED" },
    }),
  ).toBe(0);
  expect((await medicalTagsDashboard("staff-cedar")).tags).toHaveLength(0);
});
it("requires a new explicit grant after revocation and never resurrects old evidence", async () => {
  const payload = grant();
  const a = await mutateMedicalRecords("avery", payload);
  await mutateMedicalRecords("avery", {
    type: "revoke",
    importId: a.importId,
    expectedVersion: 1,
  });
  await expect(mutateMedicalRecords("avery", payload)).rejects.toThrow(
    /already used/,
  );
  const b = await imported();
  expect(b).not.toBe(a.importId);
  expect(await db.medicalRecordImport.count()).toBe(2);
  expect(await db.importedMedicalRecord.count()).toBe(8);
});
it("honors immediate clinician permission revocation on record access and approval", async () => {
  const id = await clinician("cedar");
  const { suggestion } = await extracted();
  const member = await db.clinicMembership.findFirstOrThrow({
    where: { clinicId: "cedar" },
  });
  await manageAccess(id, {
    type: "clinicalPermission",
    membershipId: member.id,
    enabled: false,
    expectedEnabled: true,
    reason: "Clinical record access withdrawn",
  });
  await expect(medicalRecordsDashboard(id)).rejects.toThrow(/permission/);
  await expect(mutateMedicalRecords(id, review(suggestion))).rejects.toThrow(
    /permission/,
  );
});
it("rejects forged imported provenance, immutable suggestion rewrites and direct SQL consent resurrection", async () => {
  const { suggestion, importId } = await extracted();
  await expect(
    db.medicalNeed.create({
      data: {
        patientId: "patient-1",
        clinicId: "cedar",
        sourceImportId: importId,
        title: "Forged patient association",
        service: "Dermatology",
        createdById: "staff-cedar",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.importedTagSuggestion.update({
      where: { id: suggestion.id },
      data: { excerpt: "Invented source", version: { increment: 1 } },
    }),
  ).rejects.toThrow(/immutable/);
  await mutateMedicalRecords("avery", {
    type: "revoke",
    importId,
    expectedVersion: 1,
  });
  await expect(
    db.medicalRecordImport.update({
      where: { id: importId },
      data: { state: "ACTIVE", revokedAt: null, version: { increment: 1 } },
    }),
  ).rejects.toThrow(/immutable/);
});
it("rolls back published tag, medical need, revision and suggestion decision when consent audit persistence fails", async () => {
  const { suggestion } = await extracted();
  await db.$executeRawUnsafe(
    `CREATE FUNCTION partb_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='APPROVE' THEN RAISE EXCEPTION 'synthetic audit persistence failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER partb_audit_failure BEFORE INSERT ON "MedicalRecordAudit" FOR EACH ROW EXECUTE FUNCTION partb_audit_failure()`,
  );
  try {
    await expect(
      mutateMedicalRecords("staff-cedar", review(suggestion)),
    ).rejects.toThrow(/audit persistence/);
    expect(await db.medicalTag.count()).toBe(0);
    expect(await db.medicalNeed.count()).toBe(0);
    expect(await db.medicalTagRevision.count()).toBe(0);
    expect(
      await db.importedTagSuggestion.findUnique({
        where: { id: suggestion.id },
      }),
    ).toMatchObject({ state: "PENDING", version: 1 });
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER partb_audit_failure ON "MedicalRecordAudit"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION partb_audit_failure()");
  }
});
it("uses approved imported evidence in manual P1–P4 review, then removes only that evidence on revocation while preserving visit tags and the staff decision", async () => {
  const { importId } = await extracted();
  const suggestion = await db.importedTagSuggestion.findFirstOrThrow({
    where: { importId },
    orderBy: { createdAt: "asc" },
  });
  await db.waitlist.create({
    data: {
      id: "record-evidence-request",
      patientId: "avery",
      service: "Dermatology",
      plan: "Blue Horizon",
      clinicIds: [],
      maxPrice: 20000,
      earliest: new Date(),
      latest: new Date(Date.now() + 30 * 86400000),
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  const staff = await db.user.findUniqueOrThrow({
    where: { id: "staff-cedar" },
  });
  expect(
    (await getState(staff)).priorityRequests.find(
      (r) => r.id === "record-evidence-request",
    )!.medicalEvidence,
  ).toHaveLength(0);
  await mutateMedicalRecords("staff-cedar", {
    ...review(suggestion),
    fields: { ...(suggestion.fields as object), service: "Dermatology" },
  });
  expect(
    (await getState(staff)).priorityRequests.find(
      (r) => r.id === "record-evidence-request",
    )!.medicalEvidence,
  ).toHaveLength(1);
  const { performAction } =
    await import("../../src/server/services/scheduling");
  await performAction("staff-cedar", {
    type: "setWaitlistPriority",
    waitlistId: "record-evidence-request",
    clinicId: "cedar",
    level: "P2",
    expectedVersion: 0,
    reason: "Independent human scheduling review",
  });
  const priority = await db.waitlistPriority.findFirstOrThrow({
    where: { waitlistId: "record-evidence-request" },
  });
  await db.slot.create({
    data: {
      id: "retained-visit-slot",
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
  await db.booking.create({
    data: {
      id: "retained-visit",
      patientId: "avery",
      slotId: "retained-visit-slot",
    },
  });
  const fields = suggestion.fields as Record<string, unknown>;
  const manual = await mutateMedicalTag("staff-cedar", {
    ...Object.fromEntries(
      Object.entries(fields).filter(([k]) => k !== "service"),
    ),
    type: "create",
    sourceBookingId: "retained-visit",
    needTitle: "Independent visit recommendation",
    reason: "Documented separate visit",
  });
  await mutateMedicalTag("staff-cedar", {
    type: "approve",
    tagId: manual.tagId,
    expectedVersion: 1,
    reason: "Independent visit review",
  });
  await mutateMedicalRecords("avery", {
    type: "revoke",
    importId,
    expectedVersion: 1,
  });
  const evidence = (await getState(staff)).priorityRequests.find(
    (r) => r.id === "record-evidence-request",
  )!.medicalEvidence;
  expect(evidence.map((e) => e.id)).toEqual([manual.tagId]);
  expect(
    await db.waitlistPriority.findUnique({ where: { id: priority.id } }),
  ).toEqual(priority);
  expect(
    await db.booking.findUnique({ where: { id: "retained-visit" } }),
  ).toMatchObject({ status: "CONFIRMED" });
});
