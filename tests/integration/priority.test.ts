import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import {
  getState,
  locked,
  performAction,
  restartDemo,
} from "../../src/server/services/scheduling";
const now = new Date();
const intake = {
  type: "intake",
  symptoms: [{ area: "skin", pain: 7, duration: "week", worsening: true }],
  warningSigns: [],
};
const user = (id: string) => db.user.findUniqueOrThrow({ where: { id } });
const assign = (
  level = "P3",
  expectedVersion = 0,
  waitlistId = "wait-2",
  clinicId = "cedar",
) => ({
  type: "setWaitlistPriority",
  waitlistId,
  clinicId,
  level,
  expectedVersion,
  reason: "Synthetic request reviewed by authorized staff",
});
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
  // Direct-booking fixtures use a basic service; specialist invitation fixtures stay unchanged.
  await db.slot.update({
    where: { id: "slot-0" },
    data: { service: "Vaccination" },
  });
  // The staff UI obtains this authorized candidate projection before editing.
  await getState(await user("staff-cedar"));
});
afterAll(async () => {
  await db.$disconnect();
});

describe("request-scoped four-level priority", () => {
  it("allows booking without intake and preserves historical raw answers without assigning clinical priority", async () => {
    await performAction("avery", { type: "book", slotId: "slot-0" });
    expect(await db.intake.count({ where: { patientId: "avery" } })).toBe(0);
    await performAction("avery", intake);
    await performAction("avery", {
      ...intake,
      symptoms: [{ area: "back", pain: 0, duration: "day", worsening: false }],
    });
    expect(
      (await db.intake.findUniqueOrThrow({ where: { patientId: "avery" } }))
        .answers,
    ).toEqual({ symptoms: intake.symptoms, warningSigns: [] });
    expect(await db.symptomTag.count({ where: { patientId: "avery" } })).toBe(
      0,
    );
    expect(await db.waitlistPriority.count()).toBe(0);
    await performAction("avery", { type: "book", slotId: "slot-0" });
    expect((await getState(await user("avery"))).user?.intakeCompleted).toBe(
      true,
    );
    await performAction("patient-1", intake);
    expect(await db.intake.count({ where: { patientId: "patient-1" } })).toBe(
      1,
    );
    expect(await db.waitlistPriority.count()).toBe(0);
  });

  it("saves all four levels on one request with provenance and complete history, preserving legacy rows", async () => {
    const before = await db.symptomTag.findMany({ orderBy: { id: "asc" } });
    for (const [index, level] of ["P1", "P2", "P3", "P4"].entries())
      await performAction("staff-cedar", assign(level, index));
    const saved = await db.waitlistPriority.findUniqueOrThrow({
      where: {
        waitlistId_clinicId: { waitlistId: "wait-2", clinicId: "cedar" },
      },
      include: { history: { orderBy: { version: "asc" } } },
    });
    expect([
      saved.level,
      saved.reviewState,
      saved.assignedById,
      saved.version,
    ]).toEqual(["P4", "APPROVED", "staff-cedar", 4]);
    expect(
      saved.history.map((h) => [h.previousLevel, h.level, h.actorId]),
    ).toEqual([
      [null, "P1", "staff-cedar"],
      ["P1", "P2", "staff-cedar"],
      ["P2", "P3", "staff-cedar"],
      ["P3", "P4", "staff-cedar"],
    ]);
    expect(await db.symptomTag.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );
    const patient = await getState(await user("patient-2"));
    expect(
      patient.waitlists.find((w) => w.id === "wait-2")?.priorities[0].level,
    ).toBe("P4");
    expect(
      (await getState(await user("patient-1"))).waitlists.some(
        (w) => w.id === "wait-2",
      ),
    ).toBe(false);
  });

  it("rejects patient/AI/foreign clinic/inactive/unrelated request assignments and legacy numeric mutations", async () => {
    await expect(performAction("patient-2", assign())).rejects.toThrow(
      /clinic permissions/,
    );
    await expect(performAction("ai", assign())).rejects.toThrow(/persona/);
    await expect(performAction("staff-harbor", assign())).rejects.toThrow(
      /clinic permissions/,
    );
    await expect(
      performAction("staff-cedar", assign("P1", 0, "seed-tie-a")),
    ).rejects.toThrow(/scope/);
    await expect(performAction("staff-cedar", assign("P5"))).rejects.toThrow();
    await expect(
      performAction("staff-cedar", {
        type: "setTag",
        patientId: "patient-2",
        label: "Risk",
        score: 10,
      }),
    ).rejects.toThrow();
    await db.waitlist.update({
      where: { id: "wait-2" },
      data: { status: "WITHDRAWN" },
    });
    await expect(performAction("staff-cedar", assign())).rejects.toThrow(
      /inactive/,
    );
  });

  it("keeps independent requests and clinics independent, without changing eligibility or original bookings", async () => {
    const w = await db.waitlist.findUniqueOrThrow({ where: { id: "wait-2" } });
    await db.waitlist.create({
      data: {
        ...w,
        id: "independent-need",
        service: "Cardiology",
        clinicIds: ["cedar"],
      },
    });
    const before = await db.booking.findMany({ orderBy: { id: "asc" } });
    await performAction("staff-cedar", assign("P1"));
    await performAction("staff-cedar", assign("P4", 0, "independent-need"));
    await performAction("staff-harbor", assign("P2", 0, "wait-2", "harbor"));
    const priorities = await db.waitlistPriority.findMany({
      orderBy: [{ waitlistId: "asc" }, { clinicId: "asc" }],
    });
    expect(priorities.map((p) => [p.waitlistId, p.clinicId, p.level])).toEqual([
      ["independent-need", "cedar", "P4"],
      ["wait-2", "cedar", "P1"],
      ["wait-2", "harbor", "P2"],
    ]);
    const cedar = await getState(await user("staff-cedar"));
    expect(
      cedar.priorityRequests
        .flatMap((w) => w.priorities)
        .every((p) => p.clinicId === "cedar"),
    ).toBe(true);
    expect(JSON.stringify(cedar.candidates)).not.toContain("Eczema flare");
    expect(await db.booking.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );
    expect(await db.offer.count({ where: { waitlistId: "wait-2" } })).toBe(0);
  });

  it("handles repeated saves and competing staff edits without duplicate history or lost updates", async () => {
    await Promise.all([
      performAction("staff-cedar", assign("P1")),
      performAction("staff-cedar", assign("P1")),
    ]);
    expect(await db.priorityHistory.count()).toBe(1);
    await expect(performAction("staff-cedar", assign("P2", 0))).rejects.toThrow(
      /changed/,
    );
    const results = await Promise.allSettled([
      performAction("staff-cedar", assign("P2", 1)),
      performAction("staff-cedar", assign("P4", 1)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.priorityHistory.count()).toBe(2);
  });

  it("invalidates approval on preference edits while retaining history and original appointment", async () => {
    await performAction("staff-cedar", assign("P1"));
    const w = await db.waitlist.findUniqueOrThrow({ where: { id: "wait-2" } });
    await performAction("patient-2", {
      type: "waitlist",
      waitlistId: w.id,
      service: w.service,
      plan: w.plan,
      city: w.city,
      clinicIds: w.clinicIds,
      maxPrice: w.maxPrice,
      earliest: w.earliest,
      latest: w.latest,
      startHour: w.startHour,
      endHour: w.endHour,
      weekdays: w.weekdays,
    });
    const p = await db.waitlistPriority.findFirstOrThrow({
      include: { history: { orderBy: { version: "asc" } } },
    });
    expect([p.level, p.reviewState, p.assignedById, p.version]).toEqual([
      null,
      "UNREVIEWED",
      null,
      2,
    ]);
    expect(p.history.map((h) => h.level)).toEqual(["P1", null]);
    await expect(performAction("staff-cedar", assign("P2", 1))).rejects.toThrow(
      /changed/,
    );
    await performAction("staff-cedar", assign("P3", 2));
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("CONFIRMED");
  });

  it("does not turn historical scores into assignments and preserves FIFO candidate order", async () => {
    await performAction("staff-cedar", {
      type: "cancel",
      bookingId: "cedar-cancellation",
    });
    const before = (
      await getState(await user("staff-cedar"))
    ).candidates.filter((c) => c.slotId === "earlier");
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((c) => c.priority === null)).toBe(true);
    await performAction("staff-cedar", assign("P1"));
    const after = (await getState(await user("staff-cedar"))).candidates.filter(
      (c) => c.slotId === "earlier",
    );
    expect(after.map((c) => c.waitlistId)).toEqual(
      before.map((c) => c.waitlistId),
    );
    expect(after.find((c) => c.waitlistId === "wait-2")?.priority?.level).toBe(
      "P1",
    );
  });

  it("enforces valid levels, state consistency and staff ownership through direct SQL", async () => {
    await expect(
      db.$executeRaw`INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level,"reviewState","assignedById","assignedAt",reason,version) VALUES ('bad-priority','wait-2','cedar','P5','APPROVED','staff-cedar',CURRENT_TIMESTAMP,'synthetic',1)`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level,"reviewState","assignedById","assignedAt",reason,version) VALUES ('bad-priority','wait-2','cedar','P1','APPROVED','patient-2',CURRENT_TIMESTAMP,'synthetic',1)`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level,"reviewState","assignedById","assignedAt",reason,version) VALUES ('bad-priority','wait-2','cedar','P1','APPROVED','staff-harbor',CURRENT_TIMESTAMP,'synthetic',1)`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level) VALUES ('bad-priority','wait-2','cedar','P1')`,
    ).rejects.toThrow();
    expect(await db.waitlistPriority.count()).toBe(0);
  });

  it("rolls back assignment and audit if the history write fails", async () => {
    const auditCount = await db.audit.count();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION priority_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='Injected history failure' THEN RAISE EXCEPTION 'Injected history failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER priority_test_failure BEFORE INSERT ON "PriorityHistory" FOR EACH ROW EXECUTE FUNCTION priority_test_failure()`,
    );
    try {
      await expect(
        performAction("staff-cedar", {
          ...assign(),
          reason: "Injected history failure",
        }),
      ).rejects.toThrow();
      expect(await db.waitlistPriority.count()).toBe(0);
      expect(await db.priorityHistory.count()).toBe(0);
      expect(await db.audit.count()).toBe(auditCount);
      expect(
        (
          await db.booking.findUniqueOrThrow({
            where: { id: "avery-original" },
          })
        ).status,
      ).toBe("CONFIRMED");
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER priority_test_failure ON "PriorityHistory"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION priority_test_failure()");
    }
  });

  it("retains explicit isolated reset behavior and never changes demo persona inventory", async () => {
    await performAction("staff-cedar", assign());
    const state = await getState(await user("staff-cedar"));
    expect(state.personas.map((p) => p.id)).toEqual([
      "avery",
      "patient-1",
      "staff-cedar",
      "staff-harbor",
    ]);
    await restartDemo("staff-cedar", { confirmation: "RESET" }, { now });
    expect(await db.waitlistPriority.count()).toBe(0);
    expect(await db.priorityHistory.count()).toBe(0);
    expect(await db.symptomTag.count()).toBe(6);
  });
});
