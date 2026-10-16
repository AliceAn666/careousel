import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import {
  getState,
  locked,
  performAction,
} from "../../src/server/services/scheduling";
const now = new Date();
const preferences = {
  type: "waitlist",
  service: "Dermatology",
  plan: "Blue Horizon",
  city: "",
  clinicIds: [],
  maxPrice: 20000,
  earliest: now.toISOString(),
  latest: new Date(+now + 35 * 86400000).toISOString(),
  startHour: 0,
  endHour: 24,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  bookingId: "avery-original",
};
const intake = {
  type: "intake",
  symptoms: [{ area: "skin", pain: 4, duration: "month", worsening: false }],
  warningSigns: [],
};
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
  // Avery is a first-visit patient and must finish intake before scheduling.
  await performAction("avery", intake);
});
afterAll(async () => {
  await db.$disconnect();
});
async function offer() {
  await performAction("avery", preferences);
  await performAction("staff-cedar", {
    type: "cancel",
    bookingId: "cedar-cancellation",
  });
  const w = await db.waitlist.findFirstOrThrow({
    where: { patientId: "avery", status: "ACTIVE" },
  });
  await performAction("staff-cedar", {
    type: "approve",
    slotId: "earlier",
    waitlistId: w.id,
    reason: "Reviewed eligibility",
  });
  return db.offer.findFirstOrThrow({
    where: { patientId: "avery", status: "PENDING" },
  });
}
describe("real PostgreSQL scheduling", () => {
  it("completes the cross-clinic workflow and persists notification/audit", async () => {
    const o = await offer();
    expect(await db.notification.count({ where: { patientId: "avery" } })).toBe(
      1,
    );
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("CONFIRMED");
    await performAction("avery", {
      type: "respond",
      offerId: o.id,
      accept: true,
    });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("RESCHEDULED");
    const replacement = await db.booking.findFirstOrThrow({
      where: { patientId: "avery", slotId: "earlier", status: "CONFIRMED" },
      include: { replaces: true },
    });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .replacementId,
    ).toBe(replacement.id);
    expect(replacement.replaces?.id).toBe("avery-original");
    expect(
      await db.booking.count({
        where: { patientId: "avery", status: "CONFIRMED", slotId: "earlier" },
      }),
    ).toBe(1);
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: "later" } })).status,
    ).toBe("AVAILABLE");
    expect(
      (await db.waitlist.findUniqueOrThrow({ where: { id: o.waitlistId } }))
        .status,
    ).toBe("FULFILLED");
    expect(await db.audit.count()).toBeGreaterThan(2);
  });
  it("allows only one winner for competing direct bookings", async () => {
    const results = await Promise.allSettled(
      ["avery", "patient-4"].map((id) =>
        performAction(id, { type: "book", slotId: "slot-0" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.booking.count({
        where: { slotId: "slot-0", status: "CONFIRMED" },
      }),
    ).toBe(1);
  });
  it("makes repeated booking and acceptance idempotent", async () => {
    const o = await offer();
    await Promise.all([
      performAction("avery", { type: "respond", offerId: o.id, accept: true }),
      performAction("avery", { type: "respond", offerId: o.id, accept: true }),
    ]);
    expect(
      await db.booking.count({
        where: { slotId: "earlier", status: "CONFIRMED" },
      }),
    ).toBe(1);
    expect(await db.notification.count({ where: { patientId: "avery" } })).toBe(
      2,
    );
  });
  it("rolls back every replacement write on failure", async () => {
    const o = await offer();
    await expect(
      performAction(
        "avery",
        { type: "respond", offerId: o.id, accept: true },
        { failAfterReplacement: true },
      ),
    ).rejects.toThrow("Injected");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("CONFIRMED");
    expect(
      await db.booking.count({
        where: { slotId: "earlier", status: "CONFIRMED" },
      }),
    ).toBe(0);
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("PENDING");
  });
  it("preserves original booking on decline and excludes the declined candidate for the same slot", async () => {
    const o = await offer();
    await performAction("avery", {
      type: "respond",
      offerId: o.id,
      accept: false,
    });
    const auditsAfterDecline = await db.audit.count();
    const repeated = await performAction("avery", {
      type: "respond",
      offerId: o.id,
      accept: false,
    });
    expect(repeated.message).toContain("already declined");
    expect(await db.audit.count()).toBe(auditsAfterDecline);
    await expect(
      performAction("avery", {
        type: "respond",
        offerId: o.id,
        accept: true,
      }),
    ).rejects.toThrow("no longer active");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("CONFIRMED");
    const staff = await db.user.findUniqueOrThrow({
      where: { id: "staff-cedar" },
    });
    expect(
      (await getState(staff)).candidates.some(
        (c) => c.slotId === "earlier" && c.waitlistId === o.waitlistId,
      ),
    ).toBe(false);
  });
  it("keeps a complete history across repeated rescheduling", async () => {
    const firstOffer = await offer();
    await performAction("avery", {
      type: "respond",
      offerId: firstOffer.id,
      accept: true,
    });
    const firstReplacement = await db.booking.findFirstOrThrow({
      where: { patientId: "avery", slotId: "earlier", status: "CONFIRMED" },
    });

    await performAction("avery", {
      ...preferences,
      bookingId: firstReplacement.id,
    });
    const start = new Date(+now + 3 * 86400000);
    await db.slot.create({
      data: {
        id: "even-earlier",
        clinicId: "willow",
        service: "Dermatology",
        provider: "Dr. Maya Lin",
        start,
        end: new Date(+start + 1800000),
        price: 12000,
        plans: ["Blue Horizon", "Self-pay"],
      },
    });
    const waitlist = await db.waitlist.findFirstOrThrow({
      where: { patientId: "avery", status: "ACTIVE" },
    });
    await performAction("staff-willow", {
      type: "approve",
      slotId: "even-earlier",
      waitlistId: waitlist.id,
      reason: "Reviewed an earlier opening",
    });
    const secondOffer = await db.offer.findFirstOrThrow({
      where: {
        patientId: "avery",
        slotId: "even-earlier",
        status: "PENDING",
      },
    });
    await performAction("avery", {
      type: "respond",
      offerId: secondOffer.id,
      accept: true,
    });

    const original = await db.booking.findUniqueOrThrow({
      where: { id: "avery-original" },
    });
    const linkedReplacement = await db.booking.findUniqueOrThrow({
      where: { id: firstReplacement.id },
    });
    const finalBooking = await db.booking.findFirstOrThrow({
      where: { patientId: "avery", slotId: "even-earlier" },
    });
    expect(original.replacementId).toBe(firstReplacement.id);
    expect(linkedReplacement.status).toBe("RESCHEDULED");
    expect(linkedReplacement.replacementId).toBe(finalBooking.id);
    expect(finalBooking.status).toBe("CONFIRMED");
  });
  it("expires offers using server time and rejects stale acceptance", async () => {
    const o = await offer();
    await expect(
      performAction(
        "avery",
        { type: "respond", offerId: o.id, accept: true },
        { now: new Date(+o.expiresAt + 1) },
      ),
    ).rejects.toThrow("no longer active");
    await db.offer.update({
      where: { id: o.id },
      data: { expiresAt: new Date(0) },
    });
    await getState(await db.user.findUniqueOrThrow({ where: { id: "avery" } }));
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("EXPIRED");
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
    ).toBe("AVAILABLE");
  });
  it("uses execution time after waiting for the scheduling lock", async () => {
    const o = await offer();
    const expiresAt = new Date(Date.now() + 60000);
    await db.offer.update({ where: { id: o.id }, data: { expiresAt } });

    let releaseLock!: () => void;
    let signalLockAcquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });
    const lockRelease = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holdingLock = locked(async () => {
      signalLockAcquired();
      await lockRelease;
    });
    await lockAcquired;

    let executionTime = new Date(+expiresAt - 1);
    const action = performAction(
      "avery",
      { type: "respond", offerId: o.id, accept: true },
      { clock: () => executionTime },
    );
    executionTime = new Date(+expiresAt + 1);
    releaseLock();
    await holdingLock;

    await expect(action).rejects.toThrow("no longer active");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
        .status,
    ).toBe("CONFIRMED");
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("PENDING");
  });
  it("denies cross-clinic cancellation and cross-patient offer acceptance", async () => {
    await expect(
      performAction("staff-harbor", {
        type: "cancel",
        bookingId: "cedar-cancellation",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const o = await offer();
    await expect(
      performAction("patient-1", {
        type: "respond",
        offerId: o.id,
        accept: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("filters incompatible candidates and preserves FIFO ordering", async () => {
    await performAction("staff-cedar", {
      type: "cancel",
      bookingId: "cedar-cancellation",
    });
    const state = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
    );
    const matches = state.candidates.filter((c) => c.slotId === "earlier");
    expect(matches.map((c) => c.name)).toEqual(["Sam Rivera"]);
  });
  it("creates exactly one invitation when staff approves twice", async () => {
    await performAction("staff-cedar", {
      type: "cancel",
      bookingId: "cedar-cancellation",
    });
    const notificationsBefore = await db.notification.count();
    const action = {
      type: "approve",
      slotId: "earlier",
      waitlistId: "wait-2",
      reason: "Reviewed preferences",
    };
    await Promise.all([
      performAction("staff-cedar", action),
      performAction("staff-cedar", action),
    ]);
    expect(
      await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
    ).toBe(1);
    expect(await db.notification.count()).toBe(notificationsBefore + 1);
  });
  it("serializes overlapping bookings for the same patient across slots", async () => {
    const s = await db.slot.findUniqueOrThrow({ where: { id: "slot-0" } });
    await db.slot.create({ data: { ...s, id: "overlap", clinicId: "cedar" } });
    const results = await Promise.allSettled(
      ["slot-0", "overlap"].map((slotId) =>
        performAction("avery", { type: "book", slotId }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("revokes pending offers when a waitlist is withdrawn", async () => {
    const o = await offer();
    await performAction("avery", {
      type: "withdraw",
      waitlistId: o.waitlistId,
    });
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("REVOKED");
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
    ).toBe("AVAILABLE");
  });
  it("revokes affected offers when preferences change", async () => {
    const o = await offer();
    await performAction("avery", {
      ...preferences,
      waitlistId: o.waitlistId,
      maxPrice: 5000,
    });
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("REVOKED");
  });
  it("withdraws the linked request when original booking is cancelled", async () => {
    const o = await offer();
    await performAction("avery", {
      type: "cancel",
      bookingId: "avery-original",
    });
    expect(
      (await db.waitlist.findUniqueOrThrow({ where: { id: o.waitlistId } }))
        .status,
    ).toBe("WITHDRAWN");
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("REVOKED");
  });
  it("commits cancellation when match refresh fails and retries safely", async () => {
    await performAction("avery", preferences);
    const result = await performAction(
      "staff-cedar",
      { type: "cancel", bookingId: "cedar-cancellation" },
      { failRefreshMatches: true },
    );

    expect(result.message).toContain("retry on the next refresh");
    expect(
      (
        await db.booking.findUniqueOrThrow({
          where: { id: "cedar-cancellation" },
        })
      ).status,
    ).toBe("CANCELLED");
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: "earlier" } })).status,
    ).toBe("AVAILABLE");

    const staff = await db.user.findUniqueOrThrow({
      where: { id: "staff-cedar" },
    });
    const refreshed = await getState(staff);
    expect(
      refreshed.candidates.some((candidate) => candidate.slotId === "earlier"),
    ).toBe(true);
    const suggestionCount = await db.suggestion.count();
    await getState(staff);
    expect(await db.suggestion.count()).toBe(suggestionCount);
  });
  it("rejects active duplicate requests and foreign booking links", async () => {
    await performAction("avery", preferences);
    await expect(performAction("avery", preferences)).rejects.toThrow(
      "already have",
    );
    await expect(performAction("patient-1", preferences)).rejects.toThrow(
      "Choose your confirmed",
    );
  });
  it("enforces slot uniqueness directly at database level", async () => {
    await expect(
      db.$executeRaw`
        INSERT INTO "Booking" ("id", "patientId", "slotId")
        VALUES ('direct-duplicate-slot', 'patient-2', 'later')
      `,
    ).rejects.toThrow();
  });
  it("enforces one pending hold per slot through direct SQL", async () => {
    await db.$executeRaw`
      UPDATE "Slot" SET "status" = 'HELD' WHERE "id" = 'seed-expired-slot'
    `;
    await db.$executeRaw`
      INSERT INTO "Offer" (
        "id", "slotId", "waitlistId", "patientId", "reason", "expiresAt"
      ) VALUES (
        'direct-first-hold', 'seed-expired-slot', 'seed-offer-waitlist',
        'patient-11', 'first hold', ${new Date(+now + 60000)}
      )
    `;
    await expect(db.$executeRaw`
      INSERT INTO "Offer" (
        "id", "slotId", "waitlistId", "patientId", "reason", "expiresAt"
      ) VALUES (
        'direct-second-hold', 'seed-expired-slot', 'wait-2',
        'patient-2', 'competing hold', ${new Date(+now + 60000)}
      )
    `).rejects.toThrow();
    expect(
      await db.offer.count({
        where: { slotId: "seed-expired-slot", status: "PENDING" },
      }),
    ).toBe(1);
  });
  it("rejects cross-patient links through direct SQL constraints", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "Waitlist" (
        "id", "patientId", "service", "plan", "clinicIds", "maxPrice",
        "earliest", "latest", "weekdays", "bookingId"
      ) VALUES (
        'direct-cross-patient-waitlist', 'patient-1', 'Dermatology',
        'Blue Horizon', ARRAY[]::TEXT[], 20000, ${now},
        ${new Date(+now + 86400000)}, ARRAY[0,1,2,3,4,5,6]::INTEGER[],
        'avery-original'
      )
    `).rejects.toThrow();

    await expect(db.$executeRaw`
      INSERT INTO "Offer" (
        "id", "slotId", "waitlistId", "patientId", "reason", "expiresAt"
      ) VALUES (
        'direct-cross-patient-offer', 'seed-expired-slot',
        'seed-offer-waitlist', 'patient-10', 'test', ${new Date(+now + 60000)}
      )
    `).rejects.toThrow();

    await db.booking.create({
      data: {
        id: "direct-foreign-replacement",
        patientId: "patient-10",
        slotId: "slot-0",
      },
    });
    await expect(db.$executeRaw`
      UPDATE "Booking"
      SET "status" = 'RESCHEDULED', "replacementId" = 'direct-foreign-replacement'
      WHERE "id" = 'avery-original'
    `).rejects.toThrow();
  });
  it("isolates staff and patient state payloads", async () => {
    const staff = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
    );
    expect(staff.bookings.every((b) => b.slot.clinicId === "cedar")).toBe(true);
    expect(staff.waitlists).toHaveLength(0);
    const patient = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "avery" } }),
    );
    expect(patient.bookings.every((b) => b.patientId === "avery")).toBe(true);
    expect(patient.candidates).toHaveLength(0);
  });
  it("gates reset by role and demo mode", async () => {
    await expect(
      performAction("avery", { type: "reset", confirmation: "RESET" }),
    ).rejects.toMatchObject({ status: 403 });
    process.env.DEMO_MODE = "false";
    try {
      await expect(
        performAction("staff-cedar", { type: "reset", confirmation: "RESET" }),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      process.env.DEMO_MODE = "true";
    }
  });
  it("seeds deterministic offer, overlap, tie, preference, and no-match scenarios", async () => {
    expect(
      (
        await db.offer.findUniqueOrThrow({
          where: { id: "seed-pending-offer" },
        })
      ).status,
    ).toBe("PENDING");
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: "seed-pending-slot" } }))
        .status,
    ).toBe("HELD");
    expect(
      (
        await db.offer.findUniqueOrThrow({
          where: { id: "seed-expired-offer" },
        })
      ).status,
    ).toBe("EXPIRED");
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: "seed-expired-slot" } }))
        .status,
    ).toBe("AVAILABLE");

    const summit = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-summit" } }),
    );
    expect(
      summit.candidates
        .filter((candidate) => candidate.slotId === "seed-tie-slot")
        .map((candidate) => candidate.waitlistId),
    ).toEqual(["seed-tie-a", "seed-tie-b"]);

    await performAction("staff-cedar", {
      type: "cancel",
      bookingId: "cedar-cancellation",
    });
    const cedar = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
    );
    expect(
      cedar.candidates.some(
        (candidate) =>
          candidate.waitlistId === "seed-service-mismatch" &&
          candidate.slotId === "earlier",
      ),
    ).toBe(false);

    await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-harbor" } }),
    );
    expect(
      await db.suggestion.findUnique({
        where: {
          slotId_waitlistId: {
            slotId: "seed-overlap-candidate",
            waitlistId: "seed-overlap-waitlist",
          },
        },
      }),
    ).toBeNull();
    const willow = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-willow" } }),
    );
    expect(
      willow.candidates.some(
        (candidate) => candidate.waitlistId === "seed-time-mismatch",
      ),
    ).toBe(false);

    await performAction("staff-summit", {
      type: "cancel",
      bookingId: "seed-no-match-booking",
    });
    const afterCancellation = await getState(
      await db.user.findUniqueOrThrow({ where: { id: "staff-summit" } }),
    );
    expect(
      afterCancellation.candidates.filter(
        (candidate) => candidate.slotId === "seed-no-match-slot",
      ),
    ).toEqual([]);
  });
});

it("preserves a fulfilled request when a stale withdrawal is retried", async () => {
  const o = await offer();
  await performAction("avery", {
    type: "respond",
    offerId: o.id,
    accept: true,
  });
  await performAction("avery", { type: "withdraw", waitlistId: o.waitlistId });
  expect(
    (await db.waitlist.findUniqueOrThrow({ where: { id: o.waitlistId } }))
      .status,
  ).toBe("FULFILLED");
});
it("denies another patient notification read access", async () => {
  await offer();
  const notification = await db.notification.findFirstOrThrow();
  await expect(
    performAction("patient-1", {
      type: "read",
      notificationId: notification.id,
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (
      await db.notification.findUniqueOrThrow({
        where: { id: notification.id },
      })
    ).read,
  ).toBe(false);
});
it("uses stable IDs to break FIFO ties", async () => {
  const same = await db.waitlist.findUniqueOrThrow({ where: { id: "wait-2" } });
  await db.waitlist.create({
    data: { ...same, id: "wait-0", patientId: "patient-6" },
  });
  await performAction("staff-cedar", {
    type: "cancel",
    bookingId: "cedar-cancellation",
  });
  const state = await getState(
    await db.user.findUniqueOrThrow({ where: { id: "staff-cedar" } }),
  );
  expect(
    state.candidates
      .filter((c) => c.slotId === "earlier")
      .map((c) => c.waitlistId),
  ).toEqual(["wait-0", "wait-2"]);
});
it("allows only one staff winner when approving different patients for the same slot", async () => {
  await performAction("avery", preferences);
  await performAction("staff-cedar", {
    type: "cancel",
    bookingId: "cedar-cancellation",
  });
  const w = await db.waitlist.findFirstOrThrow({
    where: { patientId: "avery" },
  });
  const results = await Promise.allSettled(
    [w.id, "wait-2"].map((waitlistId) =>
      performAction("staff-cedar", {
        type: "approve",
        slotId: "earlier",
        waitlistId,
        reason: "Reviewed candidate",
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.offer.count({ where: { slotId: "earlier", status: "PENDING" } }),
  ).toBe(1);
});
