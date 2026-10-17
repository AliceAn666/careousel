import { afterAll, beforeEach, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { locked, performAction } from "../../src/server/services/scheduling";
import { seedData } from "../../prisma/seed-data";
const now = new Date("2030-01-07T17:00:00Z");
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
  // Direct-booking fixtures use a basic service; specialist invitation fixtures stay unchanged.
  await db.slot.update({
    where: { id: "slot-0" },
    data: { service: "Vaccination" },
  });
});
afterAll(async () => {
  await db.$disconnect();
});
it.each(["Vaccination", "Blood test", "Routine examination"])(
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
it("requires explicit self-pay acknowledgment when the selected demo insurer is incompatible", async () => {
  const request = {
    type: "book" as const,
    slotId: "demo-open-summit-3-0-0",
    insuranceProvider: "Blue Horizon" as const,
    planType: "HMO" as const,
  };
  await expect(performAction("avery", request, { now })).rejects.toThrow(
    "self-pay",
  );
  expect(
    await db.booking.count({ where: { slotId: "demo-open-summit-3-0-0" } }),
  ).toBe(0);
  await performAction(
    "avery",
    { ...request, selfPayAcknowledged: true },
    { now },
  );
  expect(
    await db.booking.count({
      where: {
        slotId: "demo-open-summit-3-0-0",
        patientId: "avery",
        status: "CONFIRMED",
      },
    }),
  ).toBe(1);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: "avery" } })).plan,
  ).toBe("Blue Horizon");
});
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
    data: {
      ...originalSlot,
      id: "ux-overlap",
      service: "Vaccination",
      status: "AVAILABLE",
    },
  });
  await expect(
    performAction("avery", { type: "book", slotId: "ux-overlap" }, { now }),
  ).rejects.toThrow("overlaps");
});
it.each(["Dermatology", "Cardiology", "Primary care"])(
  "blocks %s direct booking, including self-pay and forged need bypass, while allowing shared waitlist invitations",
  async (service) => {
    const s = await db.slot.findFirstOrThrow({
      where: {
        service,
        clinicId: "cedar",
        status: "AVAILABLE",
        start: { gt: now },
      },
      orderBy: { start: "asc" },
    });
    const bookings = await db.booking.count();
    for (const payload of [
      { type: "book", slotId: s.id },
      {
        type: "book",
        slotId: s.id,
        insuranceProvider: "Self-pay",
        selfPayAcknowledged: true,
      },
      { type: "book", slotId: s.id, needId: "forged", expectedNeedVersion: 1 },
    ])
      await expect(performAction("avery", payload, { now })).rejects.toThrow(
        /clinic-reviewed waitlist invitations/,
      );
    expect(await db.booking.count()).toBe(bookings);
    await performAction(
      "avery",
      {
        type: "waitlist",
        service,
        plan: "Blue Horizon",
        city: "",
        clinicIds: [],
        maxPrice: 50000,
        earliest: now,
        latest: new Date(+now + 60 * 86400000),
        startHour: 0,
        endHour: 24,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
      { now },
    );
    const w = await db.waitlist.findFirstOrThrow({
      where: { patientId: "avery", service, status: "ACTIVE" },
    });
    await performAction(
      "staff-cedar",
      {
        type: "approve",
        waitlistId: w.id,
        slotId: s.id,
        reason: "Authorized staff reviewed specialist eligibility",
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
      await db.booking.findFirst({
        where: { patientId: "avery", slotId: s.id, status: "CONFIRMED" },
      }),
    ).not.toBeNull();
    expect(
      await db.booking.findUnique({ where: { id: "avery-original" } }),
    ).toMatchObject({ status: "CONFIRMED" });
  },
);
