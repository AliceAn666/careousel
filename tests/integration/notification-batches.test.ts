import { beforeEach, afterAll, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import {
  locked,
  performAction,
  maintainNotifications,
} from "../../src/server/services/scheduling";
const now = new Date();
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
});
afterAll(async () => {
  await db.$disconnect();
});
async function prepare() {
  await performAction(
    "avery",
    {
      type: "waitlist",
      service: "Dermatology",
      plan: "Blue Horizon",
      city: "",
      clinicIds: [],
      maxPrice: 20000,
      earliest: now,
      latest: new Date(+now + 35 * 86400000),
      startHour: 0,
      endHour: 24,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      bookingId: "avery-original",
    },
    { now },
  );
  await performAction(
    "staff-cedar",
    { type: "cancel", bookingId: "cedar-cancellation" },
    { now },
  );
  const w = await db.waitlist.findFirstOrThrow({
    where: { patientId: "avery", status: "ACTIVE" },
  });
  return {
    type: "startBatch",
    slotId: "earlier",
    priorityIds: ["wait-2"],
    generalIds: [w.id],
    intervalMinutes: 1,
    reason: "Staff reviewed both groups",
  };
}
it("notifies priority first and persists the timed next group without browser requests", async () => {
  const plan = await prepare();
  await performAction("staff-cedar", plan, { now });
  expect(
    await db.offer.count({ where: { slotId: "earlier", patientId: "avery" } }),
  ).toBe(0);
  await maintainNotifications(new Date(+now + 61000));
  expect(
    (
      await db.offer.findFirstOrThrow({
        where: { slotId: "earlier", patientId: "patient-2" },
      })
    ).status,
  ).toBe("EXPIRED");
  expect(
    (
      await db.offer.findFirstOrThrow({
        where: { slotId: "earlier", patientId: "avery" },
      })
    ).status,
  ).toBe("PENDING");
  await maintainNotifications(new Date(+now + 122000));
  expect(
    (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
  ).toBe("AVAILABLE");
  expect((await db.notificationBatch.findFirstOrThrow()).status).toBe(
    "EXHAUSTED",
  );
});
it("moves immediately to general group after all priority patients decline", async () => {
  const plan = await prepare();
  await performAction("staff-cedar", plan, { now });
  const o = await db.offer.findFirstOrThrow({
    where: { slotId: "earlier", status: "PENDING" },
  });
  await performAction(
    "patient-2",
    { type: "respond", offerId: o.id, accept: false },
    { now },
  );
  expect(
    await db.offer.count({
      where: { slotId: "earlier", patientId: "avery", status: "PENDING" },
    }),
  ).toBe(1);
});
it("allows only one confirmation from simultaneous group invitations and stops later groups", async () => {
  const plan = await prepare();
  plan.priorityIds.push(...plan.generalIds);
  plan.generalIds = [];
  await performAction("staff-cedar", plan, { now });
  const offers = await db.offer.findMany({
    where: { slotId: "earlier", status: "PENDING" },
  });
  expect(offers).toHaveLength(2);
  const result = await Promise.allSettled(
    offers.map((o) =>
      performAction(
        o.patientId,
        { type: "respond", offerId: o.id, accept: true },
        { now },
      ),
    ),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.booking.count({
      where: { slotId: "earlier", status: "CONFIRMED" },
    }),
  ).toBe(1);
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(0);
  expect((await db.notificationBatch.findFirstOrThrow()).status).toBe(
    "COMPLETED",
  );
});
it("keeps the group hold when one patient declines and others can respond", async () => {
  const plan = await prepare();
  plan.priorityIds.push(...plan.generalIds);
  plan.generalIds = [];
  await performAction("staff-cedar", plan, { now });
  const offer = await db.offer.findFirstOrThrow({
    where: { slotId: "earlier", patientId: "patient-2" },
  });
  await performAction(
    "patient-2",
    { type: "respond", offerId: offer.id, accept: false },
    { now },
  );
  expect(
    (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
  ).toBe("HELD");
  await expect(
    performAction("patient-1", { type: "book", slotId: "earlier" }, { now }),
  ).rejects.toThrow();
});
it("revalidates queued patients and skips withdrawn requests", async () => {
  const plan = await prepare();
  await performAction("staff-cedar", plan, { now });
  await performAction(
    "avery",
    { type: "withdraw", waitlistId: plan.generalIds[0] },
    { now },
  );
  await maintainNotifications(new Date(+now + 61000));
  expect(
    await db.offer.count({ where: { slotId: "earlier", patientId: "avery" } }),
  ).toBe(0);
  expect((await db.notificationBatch.findFirstOrThrow()).status).toBe(
    "EXHAUSTED",
  );
});
it("restricts approval/cancellation to the owning clinic and supports retries", async () => {
  const plan = await prepare();
  await expect(performAction("staff-harbor", plan, { now })).rejects.toThrow(
    "permissions",
  );
  await performAction("staff-cedar", plan, { now });
  await performAction("staff-cedar", plan, { now });
  expect(await db.notificationBatch.count()).toBe(1);
  expect(await db.offer.count({ where: { slotId: "earlier" } })).toBe(1);
  const batch = await db.notificationBatch.findFirstOrThrow();
  await expect(
    performAction(
      "staff-harbor",
      { type: "cancelBatch", batchId: batch.id },
      { now },
    ),
  ).rejects.toThrow("permissions");
  await performAction(
    "staff-cedar",
    { type: "cancelBatch", batchId: batch.id },
    { now },
  );
  await maintainNotifications(new Date(+now + 61000));
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(0);
  expect(
    (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
  ).toBe("AVAILABLE");
});
it("rejects duplicate group membership and unqualified candidates", async () => {
  const plan = await prepare();
  await expect(
    performAction("staff-cedar", { ...plan, generalIds: ["wait-2"] }, { now }),
  ).rejects.toThrow("distinct");
  await expect(
    performAction("staff-cedar", { ...plan, priorityIds: ["wait-3"] }, { now }),
  ).rejects.toThrow("eligibility");
});
it("rolls back all group effects if acceptance fails midway", async () => {
  const plan = await prepare();
  plan.priorityIds = [...plan.generalIds, "wait-2"];
  plan.generalIds = [];
  await performAction("staff-cedar", plan, { now });
  const o = await db.offer.findFirstOrThrow({
    where: { patientId: "avery", slotId: "earlier" },
  });
  await expect(
    performAction(
      "avery",
      { type: "respond", offerId: o.id, accept: true },
      { now, failAfterReplacement: true },
    ),
  ).rejects.toThrow();
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(2);
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
      .status,
  ).toBe("CONFIRMED");
});

it("the background worker advances persisted deadlines without any browser or API request", async () => {
  const plan = await prepare();
  await performAction("staff-cedar", plan, { now });
  await db.offer.updateMany({
    where: { slotId: "earlier", status: "PENDING" },
    data: { expiresAt: new Date(0) },
  });
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/notification-worker.ts"],
    { env: { ...process.env }, stdio: "ignore" },
  );
  try {
    await expect
      .poll(
        () =>
          db.offer.count({
            where: { slotId: "earlier", patientId: "avery", status: "PENDING" },
          }),
        { timeout: 10000, interval: 100 },
      )
      .toBe(1);
    expect((await db.notificationBatch.findFirstOrThrow()).round).toBe(2);
  } finally {
    const done = new Promise<void>((resolve) =>
      worker.once("exit", () => resolve()),
    );
    worker.kill("SIGTERM");
    await done;
  }
});

it("database constraints reject a standalone invitation mixed with a group hold", async () => {
  const plan = await prepare();
  await performAction("staff-cedar", plan, { now });
  await expect(
    db.offer.create({
      data: {
        slotId: "earlier",
        patientId: "avery",
        waitlistId: plan.generalIds[0],
        reason: "Cannot bypass group hold",
        expiresAt: new Date(+now + 60000),
      },
    }),
  ).rejects.toThrow();
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(1);
});

it("expanded services enforce configured duration, provider conflicts and accepted plans", async () => {
  const start = new Date(+now + 40 * 86400000);
  const create = {
    type: "createSlot",
    service: "Physical therapy",
    provider: "Demo therapist",
    durationMinutes: 60,
    plans: ["Aster Health"],
    start,
    price: 9000,
  };
  await performAction("staff-cedar", create, { now });
  const slot = await db.slot.findFirstOrThrow({
    where: { provider: "Demo therapist" },
  });
  expect(+slot.end - +slot.start).toBe(60 * 60000);
  await expect(
    performAction(
      "staff-cedar",
      { ...create, start: new Date(+start + 30 * 60000) },
      { now },
    ),
  ).rejects.toThrow("already has a slot");
  await expect(
    performAction("avery", { type: "book", slotId: slot.id }, { now }),
  ).rejects.toThrow("insurance");
  await performAction("patient-1", { type: "book", slotId: slot.id }, { now });
  expect(
    await db.booking.count({ where: { slotId: slot.id, status: "CONFIRMED" } }),
  ).toBe(1);
});
