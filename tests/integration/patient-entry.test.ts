import { afterAll, beforeEach, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { locked, performAction } from "../../src/server/services/scheduling";
import { seedData } from "../../prisma/seed-data";
const now = new Date("2030-01-07T17:00:00Z");
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
});
afterAll(async () => {
  await db.$disconnect();
});
it.each(["Vaccination", "Blood test", "Routine examination", "Primary care"])(
  "first-visit patient books %s without symptoms or a priority assignment",
  async (service) => {
    const start = new Date("2030-02-18T18:00:00Z");
    await performAction(
      "staff-cedar",
      { type: "createSlot", service, start, price: 10000 },
      { now },
    );
    const slot = await db.slot.findFirstOrThrow({
      where: { start, service, clinicId: "cedar" },
    });
    await performAction("avery", { type: "book", slotId: slot.id }, { now });
    expect(
      await db.booking.count({
        where: { slotId: slot.id, patientId: "avery", status: "CONFIRMED" },
      }),
    ).toBe(1);
    expect(await db.intake.count({ where: { patientId: "avery" } })).toBe(0);
    expect(await db.waitlistPriority.count()).toBe(0);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("CONFIRMED");
  },
);
it("joins a linked waitlist and safely accepts an earlier offer with no intake record", async () => {
  await performAction(
    "avery",
    {
      type: "waitlist",
      service: "Dermatology",
      plan: "Blue Horizon",
      clinicIds: [],
      maxPrice: 20000,
      earliest: now,
      latest: new Date("2030-03-01T00:00:00Z"),
      startHour: 0,
      endHour: 24,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      bookingId: "avery-original",
    },
    { now },
  );
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
      .status,
  ).toBe("CONFIRMED");
  await performAction(
    "staff-cedar",
    { type: "cancel", bookingId: "cedar-cancellation" },
    { now },
  );
  const w = await db.waitlist.findFirstOrThrow({
    where: { patientId: "avery" },
  });
  await performAction(
    "staff-cedar",
    {
      type: "approve",
      slotId: "earlier",
      waitlistId: w.id,
      reason: "Synthetic scheduling review without symptom questionnaire",
    },
    { now },
  );
  const o = await db.offer.findFirstOrThrow({
    where: { waitlistId: w.id, status: "PENDING" },
  });
  await performAction(
    "avery",
    { type: "respond", offerId: o.id, accept: true },
    { now },
  );
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
      .status,
  ).toBe("RESCHEDULED");
  expect(await db.intake.count({ where: { patientId: "avery" } })).toBe(0);
});
it("retains saved intake byte-for-byte across booking and repeated optional submission", async () => {
  const answers = {
    symptoms: [{ area: "skin", pain: 3, duration: "week", worsening: false }],
    warningSigns: [],
  };
  await performAction("avery", { type: "intake", ...answers }, { now });
  const before = await db.intake.findUniqueOrThrow({
    where: { patientId: "avery" },
  });
  await performAction("avery", { type: "book", slotId: "slot-0" }, { now });
  await performAction(
    "avery",
    { type: "intake", ...answers, warningSigns: ["faint"] },
    { now },
  );
  expect(
    await db.intake.findUniqueOrThrow({ where: { patientId: "avery" } }),
  ).toEqual(before);
  expect(await db.waitlistPriority.count()).toBe(0);
});
it("removing symptoms never bypasses service clearance, role or overlap checks", async () => {
  const start = new Date("2030-02-18T18:00:00Z");
  await performAction(
    "staff-cedar",
    {
      type: "createSlot",
      service: "Blood test",
      start,
      price: 10000,
      requiresAuthorization: true,
    },
    { now },
  );
  const slot = await db.slot.findFirstOrThrow({
    where: { start, service: "Blood test" },
  });
  await expect(
    performAction("avery", { type: "book", slotId: slot.id }, { now }),
  ).rejects.toThrow("clearance");
  await expect(
    performAction("staff-cedar", { type: "book", slotId: "slot-0" }, { now }),
  ).rejects.toThrow("patient");
  const originalSlot = await db.slot.findUniqueOrThrow({
    where: { id: "later" },
  });
  await db.slot.create({
    data: { ...originalSlot, id: "ux-overlap", status: "AVAILABLE" },
  });
  await expect(
    performAction("avery", { type: "book", slotId: "ux-overlap" }, { now }),
  ).rejects.toThrow("overlaps");
});
