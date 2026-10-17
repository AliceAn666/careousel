import { beforeEach, afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { locked, performAction } from "../../src/server/services/scheduling";
import {
  GROUP_INTERVAL_MS,
  previewSequence,
  processNotificationSequences,
  sequenceAction,
} from "../../src/server/services/notification-sequences";
import {
  notificationScenario,
  startScenario,
} from "../helpers/notification-scenario";
const now = new Date("2030-01-07T17:00:00Z");
const later = (ms: number) => new Date(+now + ms);
beforeEach(async () => {
  await notificationScenario(now);
});
afterAll(async () => {
  await db.$disconnect();
});
const groups = () =>
  db.notificationGroup.findMany({ orderBy: { level: "asc" } });
const state = () =>
  db.notificationSequence.findFirstOrThrow({
    where: { slotId: "earlier" },
    orderBy: { createdAt: "desc" },
  });
it("authorizes the cross-clinic pool once, enforces exact 180-minute boundary and recovers overdue without catch-up bursts", async () => {
  await startScenario(now);
  expect((await groups()).map((g) => g.status)).toEqual([
    "SENT",
    "APPROVED",
    "APPROVED",
    "APPROVED",
  ]);
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS - 1) });
  expect(await db.offer.count({ where: { groupId: { not: null } } })).toBe(1);
  const delayed = later(GROUP_INTERVAL_MS + 60_000);
  await Promise.all([
    processNotificationSequences({ now: delayed }),
    processNotificationSequences({ now: delayed }),
  ]);
  expect((await groups())[1].sentAt).toEqual(delayed);
  expect(
    await db.offer.count({
      where: { groupId: { not: null }, status: "PENDING" },
    }),
  ).toBe(2);
  expect((await state()).nextSendAt).toEqual(
    new Date(+delayed + GROUP_INTERVAL_MS),
  );
  await processNotificationSequences({ now: later(3 * GROUP_INTERVAL_MS) });
  expect((await groups()).filter((g) => g.status === "SENT")).toHaveLength(3);
  expect((await state()).nextSendAt).toEqual(later(4 * GROUP_INTERVAL_MS));
});
it("allows one concurrent winner, invalidates competitors, stops future sends and preserves the loser's original", async () => {
  await startScenario(now);
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  const offers = await db.offer.findMany({
    where: { slotId: "earlier", status: "PENDING" },
  });
  const results = await Promise.allSettled(
    offers.map((o) =>
      performAction(
        o.patientId,
        { type: "respond", offerId: o.id, accept: true },
        { now: later(GROUP_INTERVAL_MS + 1) },
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.booking.count({
      where: { slotId: "earlier", status: "CONFIRMED" },
    }),
  ).toBe(1);
  const loser = await db.offer.findFirstOrThrow({
    where: { slotId: "earlier", status: "REVOKED" },
  });
  expect(
    await db.booking.count({
      where: { patientId: loser.patientId, status: "CONFIRMED" },
    }),
  ).toBe(1);
  expect((await state()).state).toBe("COMPLETED");
  expect((await state()).nextSendAt).toBeNull();
  await processNotificationSequences({ now: later(4 * GROUP_INTERVAL_MS) });
  expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(2);
  expect(
    await db.notification.count({
      where: {
        patientId: loser.patientId,
        title: "Invitation no longer available",
      },
    }),
  ).toBe(1);
});
it("rolls back failed acceptance entirely and continues scheduling", async () => {
  await startScenario(now);
  const o = await db.offer.findFirstOrThrow({ where: { slotId: "earlier" } });
  await expect(
    performAction(
      "avery",
      { type: "respond", offerId: o.id, accept: true },
      { now, failAfterReplacement: true },
    ),
  ).rejects.toThrow("Injected");
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
      .status,
  ).toBe("CONFIRMED");
  expect((await state()).state).toBe("ACTIVE");
  expect(
    (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
  ).toBe("PENDING");
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect((await groups())[1].status).toBe("SENT");
});
it("skips empty groups without fake timestamps or resetting interval", async () => {
  await startScenario(now, ["phase7-w2", "phase7-w4"]);
  expect((await groups())[0].sentAt).toBeNull();
  expect((await groups())[1].sentAt).toEqual(now);
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect((await groups())[2].status).toBe("SKIPPED");
  expect((await groups())[2].sentAt).toBeNull();
  expect((await groups())[3].sentAt).toEqual(later(GROUP_INTERVAL_MS));
});
it("pauses changed approvals and requires explicit fresh recipient authorization; never adds a new patient silently", async () => {
  await startScenario(now);
  await performAction(
    "staff-cedar",
    {
      type: "setWaitlistPriority",
      waitlistId: "phase7-w2",
      clinicId: "cedar",
      level: "P2",
      expectedVersion: 1,
      reason: "New reviewed information",
    },
    { now },
  );
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect((await state()).state).toBe("PAUSED");
  expect((await groups())[1].sentAt).toBeNull();
  await sequenceAction(
    "staff-cedar",
    { operation: "resume", slotId: "earlier" },
    { now: later(GROUP_INTERVAL_MS) },
  );
  expect((await state()).state).toBe("PAUSED");
  const preview = await locked((tx) =>
    previewSequence(tx, "staff-cedar", "earlier", later(GROUP_INTERVAL_MS)),
  );
  await sequenceAction(
    "staff-cedar",
    {
      operation: "start",
      slotId: "earlier",
      previewToken: preview.previewToken,
      firstGroup: 2,
      approvedWaitlistIds: ["phase7-w2"],
      reason: "Explicitly reviewed changed recipients",
    },
    { now: later(GROUP_INTERVAL_MS) },
  );
  expect((await groups())[1].status).toBe("SENT");
  expect((await groups())[0].sentAt).toEqual(now);
});
it("pause/resume preserves actual-send interval; cancel revokes pending and cannot be bypassed", async () => {
  await startScenario(now);
  await sequenceAction(
    "staff-cedar",
    { operation: "pause", slotId: "earlier" },
    { now },
  );
  await processNotificationSequences({ now: later(2 * GROUP_INTERVAL_MS) });
  expect((await groups())[1].sentAt).toBeNull();
  await sequenceAction(
    "staff-cedar",
    { operation: "resume", slotId: "earlier" },
    { now: later(1000) },
  );
  expect((await state()).nextSendAt).toEqual(later(GROUP_INTERVAL_MS));
  await expect(
    performAction("patient-5", { type: "book", slotId: "earlier" }, { now }),
  ).rejects.toThrow("priority-group");
  await expect(
    performAction(
      "staff-cedar",
      {
        type: "approve",
        slotId: "earlier",
        waitlistId: "phase7-w2",
        reason: "Cannot bypass",
      },
      { now },
    ),
  ).rejects.toThrow("sequence");
  await sequenceAction(
    "staff-cedar",
    { operation: "cancel", slotId: "earlier" },
    { now },
  );
  const o = await db.offer.findFirstOrThrow({ where: { slotId: "earlier" } });
  await expect(
    performAction(
      o.patientId,
      { type: "respond", offerId: o.id, accept: true },
      { now },
    ),
  ).rejects.toThrow("no longer active");
  expect((await state()).state).toBe("CANCELLED");
});
it("denies patient/foreign clinic/CSRF-independent service escalation and stale previews", async () => {
  await expect(
    locked((tx) => previewSequence(tx, "avery", "earlier", now)),
  ).rejects.toThrow("Staff");
  await expect(
    locked((tx) => previewSequence(tx, "staff-harbor", "earlier", now)),
  ).rejects.toThrow("another clinic");
  const preview = await locked((tx) =>
    previewSequence(tx, "staff-cedar", "earlier", now),
  );
  await db.waitlist.update({
    where: { id: "phase7-w1" },
    data: { maxPrice: 19000 },
  });
  await expect(
    sequenceAction(
      "staff-cedar",
      {
        operation: "start",
        slotId: "earlier",
        previewToken: preview.previewToken,
        firstGroup: 1,
        approvedWaitlistIds: ["phase7-w1"],
        reason: "Stale preview",
      },
      { now },
    ),
  ).rejects.toThrow("Preview changed");
});
it("fails closed on referral/authorization, then accepts only staff-reviewed clearance", async () => {
  await db.slot.update({
    where: { id: "earlier" },
    data: { requiresReferral: true, requiresAuthorization: true },
  });
  const before = await locked((tx) =>
    previewSequence(tx, "staff-cedar", "earlier", now),
  );
  expect(
    before.candidates.find((c) => c.waitlistId === "phase7-w1")?.excluded,
  ).toMatch(/referral/);
  await performAction(
    "staff-cedar",
    {
      type: "setWaitlistPriority",
      waitlistId: "phase7-w1",
      clinicId: "cedar",
      level: "P1",
      expectedVersion: 1,
      reason: "Synthetic referral and authorization reviewed",
      referralApproved: true,
      authorizationApproved: true,
    },
    { now },
  );
  await startScenario(now, ["phase7-w1"]);
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(1);
});
it("survives database-client restart, rejects expired invitations and stops at appointment start", async () => {
  await startScenario(now);
  await db.$disconnect();
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect((await groups())[1].status).toBe("SENT");
  const o = await db.offer.findFirstOrThrow({
    where: { slotId: "earlier", patientId: "avery" },
  });
  await expect(
    performAction(
      "avery",
      { type: "respond", offerId: o.id, accept: true },
      { now: o.expiresAt },
    ),
  ).rejects.toThrow("no longer active");
  const slot = await db.slot.findUniqueOrThrow({ where: { id: "earlier" } });
  await processNotificationSequences({ now: slot.start });
  expect((await state()).state).toBe("CANCELLED");
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(0);
});
it("does not silently approve unreviewed patients or add new arrivals to an existing snapshot", async () => {
  await db.waitlistPriority.update({
    where: {
      waitlistId_clinicId: { waitlistId: "phase7-w3", clinicId: "cedar" },
    },
    data: {
      reviewState: "UNREVIEWED",
      level: null,
      assignedById: null,
      assignedAt: null,
    },
  });
  const preview = await locked((tx) =>
    previewSequence(tx, "staff-cedar", "earlier", now),
  );
  expect(
    preview.candidates.find((c) => c.waitlistId === "phase7-w3")?.excluded,
  ).toMatch(/No approved priority/);
  await startScenario(now, ["phase7-w1", "phase7-w2"]);
  await performAction(
    "staff-cedar",
    {
      type: "setWaitlistPriority",
      waitlistId: "phase7-w4",
      clinicId: "cedar",
      level: "P2",
      expectedVersion: 1,
      reason: "New arrival approved later",
    },
    { now },
  );
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect(
    await db.offer.count({
      where: { waitlistId: "phase7-w4", slotId: "earlier" },
    }),
  ).toBe(0);
});
it("rechecks revoked staff membership before any scheduled send", async () => {
  await db.account.create({
    data: {
      id: "sequence-author-account",
      userId: "staff-cedar",
      username: "synthetic.author",
      email: "author@example.test",
      passwordHash: "test-only-unused-hash",
      membership: {
        create: { clinicId: "cedar", role: "STAFF", status: "ACTIVE" },
      },
    },
  });
  await startScenario(now);
  await db.clinicMembership.update({
    where: { accountId: "sequence-author-account" },
    data: { status: "REVOKED" },
  });
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect((await state()).state).toBe("PAUSED");
  expect((await groups())[1].sentAt).toBeNull();
  await expect(
    sequenceAction(
      "staff-cedar",
      { operation: "resume", slotId: "earlier" },
      { now },
    ),
  ).rejects.toThrow("revoked");
});
it("decline never reserves/releases group capacity and other groups can still win", async () => {
  await startScenario(now);
  const p1 = await db.offer.findFirstOrThrow({ where: { slotId: "earlier" } });
  await performAction(
    "avery",
    { type: "respond", offerId: p1.id, accept: false },
    { now },
  );
  expect(
    (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
  ).toBe("AVAILABLE");
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  const p2 = await db.offer.findFirstOrThrow({
    where: { slotId: "earlier", patientId: "patient-2" },
  });
  await performAction(
    "patient-2",
    { type: "respond", offerId: p2.id, accept: true },
    { now: later(GROUP_INTERVAL_MS) },
  );
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
      .status,
  ).toBe("CONFIRMED");
});
it("simultaneous patients in the SAME group still produce one committed booking", async () => {
  await performAction(
    "staff-cedar",
    {
      type: "setWaitlistPriority",
      waitlistId: "phase7-w2",
      clinicId: "cedar",
      level: "P1",
      expectedVersion: 1,
      reason: "Same reviewed priority group",
    },
    { now },
  );
  await startScenario(now);
  const offers = await db.offer.findMany({
    where: { slotId: "earlier", status: "PENDING" },
  });
  expect(offers).toHaveLength(2);
  const results = await Promise.allSettled(
    offers.map((o) =>
      performAction(
        o.patientId,
        { type: "respond", offerId: o.id, accept: true },
        { now },
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.booking.count({
      where: { slotId: "earlier", status: "CONFIRMED" },
    }),
  ).toBe(1);
});
it("a successful acceptance racing the scheduler leaves no future sends or actionable competitor", async () => {
  await startScenario(now);
  const offer = await db.offer.findFirstOrThrow({
    where: { slotId: "earlier" },
  });
  await Promise.all([
    processNotificationSequences({ now: later(GROUP_INTERVAL_MS) }),
    performAction(
      "avery",
      { type: "respond", offerId: offer.id, accept: true },
      { now: later(GROUP_INTERVAL_MS) },
    ),
  ]);
  expect((await state()).nextSendAt).toBeNull();
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(0);
});
it("retains history after cancellation and enforces the send interval across a replacement sequence", async () => {
  await startScenario(now);
  await sequenceAction(
    "staff-cedar",
    { operation: "cancel", slotId: "earlier" },
    { now: later(1) },
  );
  await startScenario(later(2));
  expect(
    await db.notificationSequence.count({ where: { slotId: "earlier" } }),
  ).toBe(2);
  expect((await state()).state).toBe("SCHEDULED");
  expect((await state()).nextSendAt).toEqual(later(GROUP_INTERVAL_MS));
  expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(1);
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(2);
});
it("database rejects legacy/group mixing and an invitation forged for another slot", async () => {
  await startScenario(now);
  const group = await db.notificationGroup.findFirstOrThrow({
    where: { level: "P1", status: "SENT" },
  });
  await expect(
    db.offer.create({
      data: {
        slotId: "earlier",
        waitlistId: "phase7-w2",
        patientId: "patient-2",
        reason: "Cannot mix legacy",
        expiresAt: later(600_000),
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.offer.create({
      data: {
        slotId: "slot-0",
        groupId: group.id,
        waitlistId: "phase7-w2",
        patientId: "patient-2",
        reason: "Wrong group slot",
        expiresAt: later(600_000),
      },
    }),
  ).rejects.toThrow();
  expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(1);
});
it("failed notification creation rolls back the whole group and retries exactly once", async () => {
  await startScenario(now);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION phase7_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='An appointment opening is available' THEN RAISE EXCEPTION 'Injected notice failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER phase7_fail_notice BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION phase7_fail_notice()`,
  );
  try {
    await expect(
      processNotificationSequences({ now: later(GROUP_INTERVAL_MS) }),
    ).rejects.toThrow();
    expect((await groups())[1].sentAt).toBeNull();
    expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(1);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER phase7_fail_notice ON "Notification"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION phase7_fail_notice()");
  }
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  await processNotificationSequences({ now: later(GROUP_INTERVAL_MS) });
  expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(2);
});
