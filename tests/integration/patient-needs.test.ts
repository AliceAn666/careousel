import { beforeEach, afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import { locked, performAction } from "../../src/server/services/scheduling";
import { patientNeedsDashboard } from "../../src/server/services/patient-needs";
const now = new Date("2030-01-01T00:00:00Z");
const preferences = {
  plan: "Blue Horizon",
  city: "",
  clinicIds: [],
  maxPrice: 30000,
  earliest: now,
  latest: new Date("2030-03-01T00:00:00Z"),
  startHour: 0,
  endHour: 24,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
};
const external = (reference = "OUT-1", start = "2030-02-10T18:00:00Z") => ({
  clinicName: "Outside Patient-Reported Clinic",
  start,
  end: new Date(Date.parse(start) + 1800000),
  location: "Reported outside location",
  reference,
  reportedConfirmed: true,
});
const create = (title: string, original: unknown = { type: "NONE" }) => ({
  type: "createNeed",
  title,
  service: "Dermatology",
  preferences,
  requiresReferral: false,
  requiresAuthorization: false,
  tagIds: [],
  original,
});
async function need(title: string, original: unknown = { type: "NONE" }) {
  await performAction("avery", create(title, original), { now });
  return db.patientNeed.findFirstOrThrow({ where: { title } });
}
async function request(id: string) {
  const n = await db.patientNeed.findUniqueOrThrow({ where: { id } });
  await performAction(
    "avery",
    { type: "requestNeed", needId: id, expectedVersion: n.version },
    { now },
  );
  return db.waitlist.findFirstOrThrow({
    where: { needId: id, status: "ACTIVE" },
  });
}
async function slot(
  id: string,
  start = "2030-01-08T18:00:00Z",
  patch: object = {},
) {
  return db.slot.create({
    data: {
      id,
      clinicId: "cedar",
      service: "Dermatology",
      provider: "Synthetic independent care",
      start: new Date(start),
      end: new Date(Date.parse(start) + 1800000),
      price: 10000,
      plans: ["Blue Horizon"],
      status: "AVAILABLE",
      ...patch,
    },
  });
}
async function offer(waitlistId: string, slotId: string) {
  await performAction(
    "staff-cedar",
    {
      type: "approve",
      waitlistId,
      slotId,
      reason: "Synthetic staff-approved match",
    },
    { now },
  );
  return db.offer.findFirstOrThrow({
    where: { waitlistId, slotId, status: "PENDING" },
  });
}
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
});
afterAll(async () => {
  await db.$disconnect();
});
it("supports multiple active same-service medical needs without changing legacy appointments", async () => {
  const before = await db.booking.findMany({ orderBy: { id: "asc" } });
  const a = await need("Independent skin follow-up");
  const b = await need("Separate skin procedure");
  await request(a.id);
  await request(b.id);
  expect(
    await db.waitlist.count({
      where: { patientId: "avery", status: "ACTIVE" },
    }),
  ).toBe(2);
  expect(await db.booking.findMany({ orderBy: { id: "asc" } })).toEqual(before);
});
it("registers explicitly unverified external data, prevents duplicate replacement sources and never gives clinic staff write access", async () => {
  const a = await need("Outside appointment need", {
    type: "EXTERNAL",
    appointment: external(),
  });
  expect(
    await db.externalAppointment.findUnique({
      where: { id: a.externalAppointmentId! },
    }),
  ).toMatchObject({
    verification: "PATIENT_REPORTED_UNVERIFIED",
    reportedConfirmed: true,
    reference: "OUT-1",
  });
  await expect(
    need("Duplicate outside need", {
      type: "EXTERNAL",
      appointment: external(),
    }),
  ).rejects.toThrow(/already assigned/);
  await expect(
    performAction("staff-cedar", create("Staff cannot report"), { now }),
  ).rejects.toThrow(/patients/);
  await expect(patientNeedsDashboard("staff-cedar")).rejects.toThrow(/Patient/);
  expect((await patientNeedsDashboard("patient-1")).needs).toHaveLength(0);
});
it("accepts for one external need while preserving another need, request, invitation and both outside reports", async () => {
  const a = await need("First outside need", {
      type: "EXTERNAL",
      appointment: external("OUT-A"),
    }),
    b = await need("Second outside need", {
      type: "EXTERNAL",
      appointment: external("OUT-B", "2030-02-12T18:00:00Z"),
    });
  const wa = await request(a.id),
    wb = await request(b.id);
  await slot("need-a-slot");
  await slot("need-b-slot", "2030-01-09T18:00:00Z");
  const oa = await offer(wa.id, "need-a-slot"),
    ob = await offer(wb.id, "need-b-slot");
  const before = await db.externalAppointment.findMany({
    orderBy: { id: "asc" },
  });
  await performAction(
    "avery",
    { type: "respond", offerId: oa.id, accept: true },
    { now },
  );
  expect(await db.waitlist.findUnique({ where: { id: wa.id } })).toMatchObject({
    status: "FULFILLED",
  });
  expect(await db.waitlist.findUnique({ where: { id: wb.id } })).toMatchObject({
    status: "ACTIVE",
  });
  expect(await db.offer.findUnique({ where: { id: ob.id } })).toMatchObject({
    status: "PENDING",
  });
  expect(
    await db.patientNeed.findUnique({ where: { id: b.id } }),
  ).toMatchObject({ state: "OPEN" });
  expect(
    await db.externalAppointment.findMany({ orderBy: { id: "asc" } }),
  ).toEqual(before);
  const saved = await db.patientNeed.findUniqueOrThrow({ where: { id: a.id } });
  await performAction(
    "avery",
    { type: "completeNeed", needId: a.id, expectedVersion: saved.version },
    { now },
  );
  expect(
    await db.booking.findUnique({ where: { id: saved.currentBookingId! } }),
  ).toMatchObject({ status: "CONFIRMED" });
  expect(await db.waitlist.findUnique({ where: { id: wb.id } })).toMatchObject({
    status: "ACTIVE",
  });
});
it("rolls back a failed internal replacement completely, then allows exactly one competing acceptance", async () => {
  const a = await need("Replace this internal appointment", {
    type: "INTERNAL",
    bookingId: "avery-original",
  });
  const w = await request(a.id);
  await slot("race-one");
  await slot("race-two", "2030-01-09T18:00:00Z");
  const x = await offer(w.id, "race-one"),
    y = await offer(w.id, "race-two");
  const before = await db.booking.count();
  await expect(
    performAction(
      "avery",
      { type: "respond", offerId: x.id, accept: true },
      { now, failAfterReplacement: true },
    ),
  ).rejects.toThrow(/Injected/);
  expect(await db.booking.count()).toBe(before);
  expect(
    await db.booking.findUnique({ where: { id: "avery-original" } }),
  ).toMatchObject({ status: "CONFIRMED", replacementId: null });
  expect(await db.offer.findUnique({ where: { id: x.id } })).toMatchObject({
    status: "PENDING",
  });
  const outcomes = await Promise.allSettled([
    performAction(
      "avery",
      { type: "respond", offerId: x.id, accept: true },
      { now },
    ),
    performAction(
      "avery",
      { type: "respond", offerId: y.id, accept: true },
      { now },
    ),
  ]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(await db.booking.count()).toBe(before + 1);
  expect(
    await db.booking.findUnique({ where: { id: "avery-original" } }),
  ).toMatchObject({ status: "RESCHEDULED" });
  expect(
    await db.booking.count({ where: { needId: a.id, status: "CONFIRMED" } }),
  ).toBe(1);
});
it("rejects assigning one internal original to two needs or to a second legacy request", async () => {
  const result = await Promise.allSettled([
    need("First assignment", { type: "INTERNAL", bookingId: "avery-original" }),
    need("Second assignment", {
      type: "INTERNAL",
      bookingId: "avery-original",
    }),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(
    performAction(
      "avery",
      {
        type: "waitlist",
        ...preferences,
        service: "Dermatology",
        bookingId: "avery-original",
      },
      { now },
    ),
  ).rejects.toThrow(/confirmed/);
});
it("preserves an existing legacy replacement request until the patient explicitly withdraws it", async () => {
  await performAction(
    "avery",
    {
      type: "waitlist",
      ...preferences,
      service: "Dermatology",
      bookingId: "avery-original",
    },
    { now },
  );
  await expect(
    need("Cannot duplicate original", {
      type: "INTERNAL",
      bookingId: "avery-original",
    }),
  ).rejects.toThrow(/already has/);
  expect(await db.patientNeed.count()).toBe(0);
  expect(
    await db.waitlist.count({
      where: { patientId: "avery", status: "ACTIVE" },
    }),
  ).toBe(1);
});
it("prevents time conflicts with another reported confirmed external appointment and requires fresh review after correcting a report", async () => {
  const a = await need("Request without an original"),
    b = await need("Conflicting outside booking", {
      type: "EXTERNAL",
      appointment: external("CONFLICT", "2030-01-08T18:00:00Z"),
    });
  const wa = await request(a.id);
  await slot("external-conflict");
  await expect(offer(wa.id, "external-conflict")).rejects.toThrow(
    /eligibility/,
  );
  await expect(
    performAction(
      "avery",
      {
        type: "book",
        slotId: "external-conflict",
        needId: a.id,
        expectedNeedVersion: 2,
      },
      { now },
    ),
  ).rejects.toThrow(/external appointment/);
  await performAction(
    "avery",
    {
      type: "editExternal",
      needId: b.id,
      expectedVersion: b.version,
      appointment: {
        ...external("CONFLICT", "2030-01-08T18:00:00Z"),
        reportedConfirmed: false,
      },
      reportedCancelled: false,
      reason: "Patient corrects confirmation report",
    },
    { now },
  );
  await offer(wa.id, "external-conflict");
});
it("enforces need-specific referral/authorization even when the slot itself has no flags", async () => {
  await performAction(
    "avery",
    {
      ...create("Special requirements"),
      requiresReferral: true,
      requiresAuthorization: true,
    },
    { now },
  );
  const n = await db.patientNeed.findFirstOrThrow({
    where: { title: "Special requirements" },
  });
  const w = await request(n.id);
  await slot("requirements-slot");
  await expect(
    performAction(
      "avery",
      {
        type: "book",
        slotId: "requirements-slot",
        needId: n.id,
        expectedNeedVersion: 2,
      },
      { now },
    ),
  ).rejects.toThrow(/clearance/);
  await expect(offer(w.id, "requirements-slot")).rejects.toThrow(
    /not approved/,
  );
  await performAction(
    "staff-cedar",
    {
      type: "setWaitlistPriority",
      waitlistId: w.id,
      clinicId: "cedar",
      level: "P3",
      expectedVersion: 0,
      referralApproved: true,
      authorizationApproved: true,
      reason: "Human review of required documents",
    },
    { now },
  );
  await offer(w.id, "requirements-slot");
});
it("keeps competing acceptance for one slot safe across separate needs and preserves the losing original", async () => {
  const a = await need("Competition first", {
      type: "EXTERNAL",
      appointment: external("FIRST"),
    }),
    b = await need("Competition second", {
      type: "EXTERNAL",
      appointment: external("SECOND", "2030-02-11T18:00:00Z"),
    });
  const wa = await request(a.id),
    wb = await request(b.id);
  await slot("one-capacity");
  // Group invitations share one opening; exercise the actual authorized sequence.
  for (const w of [wa, wb])
    await performAction(
      "staff-cedar",
      {
        type: "setWaitlistPriority",
        waitlistId: w.id,
        clinicId: "cedar",
        level: "P2",
        expectedVersion: 0,
        reason: "Staff-approved independent request",
      },
      { now },
    );
  const { previewSequence, sequenceAction } =
    await import("../../src/server/services/notification-sequences");
  const preview = await locked((tx) =>
    previewSequence(tx, "staff-cedar", "one-capacity", now),
  );
  const candidates = preview.candidates.filter((c) =>
    [wa.id, wb.id].includes(c.waitlistId),
  );
  expect(candidates.every((c) => !c.excluded)).toBe(true);
  await sequenceAction(
    "staff-cedar",
    {
      operation: "start",
      slotId: "one-capacity",
      previewToken: preview.previewToken,
      firstGroup: 2,
      approvedWaitlistIds: [wa.id, wb.id],
      reason: "Authorized both independent needs",
    },
    { now },
  );
  const offers = await db.offer.findMany({
    where: { slotId: "one-capacity", status: "PENDING" },
  });
  expect(offers).toHaveLength(2);
  const results = await Promise.allSettled(
    offers.map((o) =>
      performAction(
        "avery",
        { type: "respond", offerId: o.id, accept: true },
        { now },
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.booking.count({
      where: { slotId: "one-capacity", status: "CONFIRMED" },
    }),
  ).toBe(1);
  expect(await db.patientNeed.count({ where: { state: "OPEN" } })).toBe(1);
  expect(
    await db.waitlist.count({
      where: { id: { in: [wa.id, wb.id] }, status: "ACTIVE" },
    }),
  ).toBe(1);
  expect(
    (await db.externalAppointment.findMany()).every(
      (e) => !e.reportedCancelled && e.reportedConfirmed,
    ),
  ).toBe(true);
});
it("edits and closes only the selected need, uses optimistic versions and preserves immutable history", async () => {
  const a = await need("Editable need"),
    b = await need("Unrelated need");
  const wa = await request(a.id),
    wb = await request(b.id);
  const current = await db.patientNeed.findUniqueOrThrow({
    where: { id: a.id },
  });
  await performAction(
    "avery",
    {
      type: "editNeed",
      needId: a.id,
      expectedVersion: current.version,
      title: "Corrected need",
      preferences: { ...preferences, maxPrice: 18000 },
      requiresReferral: false,
      requiresAuthorization: false,
      tagIds: [],
    },
    { now },
  );
  expect(await db.waitlist.findUnique({ where: { id: wa.id } })).toMatchObject({
    status: "WITHDRAWN",
  });
  expect(await db.waitlist.findUnique({ where: { id: wb.id } })).toMatchObject({
    status: "ACTIVE",
  });
  await expect(
    performAction(
      "avery",
      { type: "closeNeed", needId: a.id, expectedVersion: current.version },
      { now },
    ),
  ).rejects.toThrow(/changed/);
  await expect(
    db.patientNeedHistory.updateMany({ data: { action: "tamper" } }),
  ).rejects.toThrow(/append-only/);
  await expect(db.patientNeedHistory.deleteMany()).rejects.toThrow(
    /append-only/,
  );
  await expect(
    performAction(
      "patient-1",
      { type: "closeNeed", needId: a.id, expectedVersion: 3 },
      { now },
    ),
  ).rejects.toThrow(/not found/);
});
it("books an appropriate basic opening for one need without replacing or retargeting another need", async () => {
  const a = await need("Basic booking"),
    b = await need("Another independent booking");
  await slot("direct-need-slot");
  await performAction(
    "avery",
    {
      type: "book",
      needId: a.id,
      expectedNeedVersion: 1,
      slotId: "direct-need-slot",
    },
    { now },
  );
  await expect(
    performAction(
      "avery",
      {
        type: "book",
        needId: b.id,
        expectedNeedVersion: 1,
        slotId: "direct-need-slot",
      },
      { now },
    ),
  ).rejects.toThrow(/different medical need/);
  expect(
    await db.patientNeed.findUnique({ where: { id: b.id } }),
  ).toMatchObject({ state: "OPEN", currentBookingId: null });
});
it("does not book an incompatible insurance plan and rejects forged patient or automatic priority fields", async () => {
  const a = await need("Insurance compatibility");
  await slot("not-covered", "2030-01-08T18:00:00Z", {
    plans: ["Aster Health"],
  });
  await expect(
    performAction(
      "avery",
      {
        type: "book",
        slotId: "not-covered",
        needId: a.id,
        expectedNeedVersion: 1,
      },
      { now },
    ),
  ).rejects.toThrow(/insurance/);
  await expect(
    performAction(
      "avery",
      { ...create("Forged priority"), priority: "P1" },
      { now },
    ),
  ).rejects.toThrow();
  await expect(
    performAction(
      "avery",
      { ...create("Forged owner"), patientId: "patient-1" },
      { now },
    ),
  ).rejects.toThrow();
});
it("projects only explicitly linked approved same-clinic evidence without assigning priority", async () => {
  const { mutateMedicalTag } =
    await import("../../src/server/services/medical-tags");
  await slot("evidence-visit", "2020-01-01T18:00:00Z", { status: "BOOKED" });
  await db.booking.create({
    data: {
      id: "evidence-booking",
      patientId: "avery",
      slotId: "evidence-visit",
    },
  });
  const tag = await mutateMedicalTag("staff-cedar", {
    type: "create",
    sourceBookingId: "evidence-booking",
    needTitle: "Clinical follow-up",
    kind: "FOLLOW_UP",
    label: "Reviewed evidence",
    clinicalNotes: "PRIVATE_NOTE_NEVER_IN_STATE",
    followUpRecommendation: "Arrange follow-up",
    recommendedFrom: null,
    recommendedBy: null,
    requiresReferral: false,
    requiresAuthorization: false,
    reason: "Synthetic visit review",
  });
  await mutateMedicalTag("staff-cedar", {
    type: "approve",
    tagId: tag.tagId,
    expectedVersion: 1,
    reason: "Clinician confirmed source",
  });
  await performAction(
    "avery",
    { ...create("Linked evidence need"), tagIds: [tag.tagId] },
    { now },
  );
  const a = await db.patientNeed.findFirstOrThrow({
    where: { title: "Linked evidence need" },
  });
  const b = await need("Unrelated evidence need");
  const wa = await request(a.id),
    wb = await request(b.id);
  const { getState } = await import("../../src/server/services/scheduling");
  const state = await getState(
    await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
  );
  expect(
    state.priorityRequests
      .find((r) => r.id === wa.id)
      ?.medicalEvidence.map((t) => t.id),
  ).toEqual([tag.tagId]);
  expect(
    state.priorityRequests.find((r) => r.id === wb.id)?.medicalEvidence,
  ).toEqual([]);
  expect(JSON.stringify(state)).not.toContain("PRIVATE_NOTE_NEVER_IN_STATE");
  expect(
    await db.waitlistPriority.count({
      where: { waitlistId: { in: [wa.id, wb.id] } },
    }),
  ).toBe(0);
  expect(
    (
      await getState(
        await db.user.findUniqueOrThrow({ where: { id: "staff-harbor" } }),
      )
    ).priorityRequests.flatMap((r) => r.medicalEvidence),
  ).toEqual([]);
});
it("rolls back request withdrawal and preference changes if immutable history cannot be appended", async () => {
  const a = await need("Atomic history need");
  const w = await request(a.id);
  await slot("history-slot");
  const pending = await offer(w.id, "history-slot");
  const before = await db.patientNeed.findUniqueOrThrow({
    where: { id: a.id },
  });
  await db.patientNeedHistory.create({
    data: {
      needId: a.id,
      version: before.version + 1,
      actorId: "avery",
      action: "SYNTHETIC_FAILURE",
      details: { fixture: true },
    },
  });
  await expect(
    performAction(
      "avery",
      {
        type: "editNeed",
        needId: a.id,
        expectedVersion: before.version,
        title: "Must roll back",
        preferences,
        requiresReferral: false,
        requiresAuthorization: false,
        tagIds: [],
      },
      { now },
    ),
  ).rejects.toThrow();
  expect(await db.patientNeed.findUnique({ where: { id: a.id } })).toEqual(
    before,
  );
  expect(await db.waitlist.findUnique({ where: { id: w.id } })).toMatchObject({
    status: "ACTIVE",
  });
  expect(
    await db.offer.findUnique({ where: { id: pending.id } }),
  ).toMatchObject({ status: "PENDING" });
});
it("serializes completion against acceptance and blocks database-level foreign need links", async () => {
  const a = await need("Completion race", {
    type: "EXTERNAL",
    appointment: external("COMPLETE-RACE"),
  });
  const b = await need("Unaffected by completion race");
  await request(b.id);
  const w = await request(a.id);
  await slot("completion-race-slot");
  const pending = await offer(w.id, "completion-race-slot");
  const current = await db.patientNeed.findUniqueOrThrow({
    where: { id: a.id },
  });
  const attempts = await Promise.allSettled([
    performAction(
      "avery",
      { type: "completeNeed", needId: a.id, expectedVersion: current.version },
      { now },
    ),
    performAction(
      "avery",
      { type: "respond", offerId: pending.id, accept: true },
      { now },
    ),
  ]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const after = await db.patientNeed.findUniqueOrThrow({ where: { id: a.id } });
  expect(["COMPLETED", "SECURED"]).toContain(after.state);
  expect(
    await db.booking.count({ where: { slotId: "completion-race-slot" } }),
  ).toBe(after.state === "SECURED" ? 1 : 0);
  expect(
    await db.waitlist.count({ where: { needId: b.id, status: "ACTIVE" } }),
  ).toBe(1);
  await expect(
    db.patientNeedEvidence.create({
      data: { needId: a.id, patientId: "patient-1", tagId: "missing" },
    }),
  ).rejects.toThrow();
  await slot("foreign-need-slot", "2030-01-09T18:00:00Z");
  await expect(
    db.booking.create({
      data: {
        patientId: "patient-1",
        slotId: "foreign-need-slot",
        needId: a.id,
      },
    }),
  ).rejects.toThrow();
});
