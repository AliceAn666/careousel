import { seedData } from "../../prisma/seed-data";
import {
  locked,
  performAction,
  refreshMatches,
} from "../../src/server/services/scheduling";
import {
  previewSequence,
  sequenceAction,
} from "../../src/server/services/notification-sequences";
// Synthetic scenario is test-only. No public clock control or shared-data reset.
export async function notificationScenario(now: Date) {
  if (
    !process.env.DATABASE_URL ||
    new URL(process.env.DATABASE_URL).pathname !== "/careousel_test"
  )
    throw new Error("Scenario requires isolated careousel_test.");
  await locked(async (tx) => {
    await seedData(tx, now);
    await tx.user.update({
      where: { id: "avery" },
      data: { visitType: "FOLLOW_UP" },
    });
    const earlier = await tx.slot.findUniqueOrThrow({
      where: { id: "earlier" },
    });
    for (const [i, patientId] of [
      "avery",
      "patient-2",
      "patient-3",
      "patient-4",
    ].entries()) {
      const bookingId = i === 0 ? "avery-original" : `phase7-original-${i}`;
      if (i !== 0) {
        const start = new Date(+earlier.start + 20 * 86400000);
        await tx.slot.create({
          data: {
            id: `phase7-later-${i}`,
            clinicId: ["harbor", "summit", "willow", "cedar"][i],
            service: "Dermatology",
            provider: `Synthetic doctor ${i}`,
            start,
            end: new Date(+start + 1800000),
            price: 12000,
            plans: ["Blue Horizon"],
            status: "BOOKED",
          },
        });
        await tx.booking.create({
          data: { id: bookingId, patientId, slotId: `phase7-later-${i}` },
        });
      }
      await tx.waitlist.deleteMany({
        where: { patientId, service: "Dermatology" },
      });
      await tx.waitlist.create({
        data: {
          id: `phase7-w${i + 1}`,
          patientId,
          service: "Dermatology",
          plan: "Blue Horizon",
          clinicIds: [],
          city: "",
          maxPrice: 20000,
          earliest: now,
          latest: new Date(+earlier.start + 30 * 86400000),
          startHour: 0,
          endHour: 24,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          bookingId,
        },
      });
    }
  });
  await performAction(
    "staff-cedar",
    { type: "cancel", bookingId: "cedar-cancellation" },
    { now },
  );
  await locked((tx) => refreshMatches(tx, now));
  for (let n = 1; n <= 4; n++)
    await performAction(
      "staff-cedar",
      {
        type: "setWaitlistPriority",
        waitlistId: `phase7-w${n}`,
        clinicId: "cedar",
        level: `P${n}`,
        expectedVersion: 0,
        reason: "Synthetic clinician-approved demonstration",
      },
      { now },
    );
  return {
    now,
    slotId: "earlier",
    waitlists: [1, 2, 3, 4].map((n) => `phase7-w${n}`),
  };
}
export async function startScenario(
  now: Date,
  ids = [1, 2, 3, 4].map((n) => `phase7-w${n}`),
) {
  const preview = await locked((tx) =>
    previewSequence(tx, "staff-cedar", "earlier", now),
  );
  return sequenceAction(
    "staff-cedar",
    {
      operation: "start",
      slotId: "earlier",
      previewToken: preview.previewToken,
      firstGroup: 1,
      approvedWaitlistIds: ids,
      reason: "Reviewed complete automatic sequence",
    },
    { now },
  );
}
