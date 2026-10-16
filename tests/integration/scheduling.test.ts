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
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
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
    expect(await db.notification.count()).toBe(1);
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
      db.booking.create({ data: { patientId: "patient-2", slotId: "later" } }),
    ).rejects.toThrow();
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
