import type { Prisma } from "@prisma/client";
import { eligibility } from "./matching";

// Called only inside the scheduling transaction/lock. Time comes from the server
// (or an injected test clock), never from a browser countdown.
export async function advanceBatches(tx: Prisma.TransactionClient, now: Date) {
  const batches = await tx.notificationBatch.findMany({
    where: { status: "ACTIVE" },
    include: { slot: { include: { clinic: true } } },
  });
  for (const batch of batches) {
    if (batch.slot.status === "BOOKED" || batch.slot.start <= now) {
      await tx.offer.updateMany({
        where: { batchId: batch.id, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      await tx.notificationBatch.update({
        where: { id: batch.id },
        data: {
          status: batch.slot.status === "BOOKED" ? "COMPLETED" : "EXHAUSTED",
          nextAt: null,
        },
      });
      if (batch.slot.status !== "BOOKED")
        await tx.slot.update({
          where: { id: batch.slotId },
          data: { status: "AVAILABLE" },
        });
      continue;
    }
    if (
      await tx.offer.count({ where: { batchId: batch.id, status: "PENDING" } })
    )
      continue;
    const bookings = await tx.booking.findMany({
      where: { status: "CONFIRMED" },
      include: { slot: true },
    });
    let round = batch.round;
    let sent = false;
    while (round < 2 && !sent) {
      const ids = round === 0 ? batch.priorityIds : batch.generalIds;
      round++;
      // Shorten the response window when the appointment is about to start.
      const expiresAt = new Date(
        Math.min(+now + batch.intervalMinutes * 60000, +batch.slot.start),
      );
      for (const waitlistId of ids) {
        const w = await tx.waitlist.findUnique({
          where: { id: waitlistId },
          include: { booking: { include: { slot: true } } },
        });
        if (!w || !eligibility(w, batch.slot, bookings, now)) continue;
        const previous = await tx.offer.findFirst({
          where: {
            slotId: batch.slotId,
            waitlistId,
            OR: [{ status: "DECLINED" }, { batchId: batch.id }],
          },
        });
        if (previous) continue;
        const offer = await tx.offer.create({
          data: {
            slotId: batch.slotId,
            waitlistId,
            patientId: w.patientId,
            batchId: batch.id,
            reason: batch.reason,
            expiresAt,
          },
        });
        await tx.notification.create({
          data: {
            patientId: w.patientId,
            offerId: offer.id,
            title: "A group invitation is ready",
            body: "This opening was offered to a staff-approved group. The first eligible confirmation gets the appointment. Your original booking stays safe until you confirm.",
          },
        });
        sent = true;
      }
      await tx.notificationBatch.update({
        where: { id: batch.id },
        data: { round, nextAt: sent ? expiresAt : null },
      });
      if (sent) {
        await tx.slot.update({
          where: { id: batch.slotId },
          data: { status: "HELD" },
        });
        await tx.audit.create({
          data: {
            clinicId: batch.slot.clinicId,
            actor: batch.actor,
            action:
              round === 1
                ? "Priority group notified"
                : "General group notified",
          },
        });
      }
    }
    if (!sent) {
      await tx.notificationBatch.update({
        where: { id: batch.id },
        data: { status: "EXHAUSTED", nextAt: null },
      });
      await tx.slot.update({
        where: { id: batch.slotId },
        data: { status: "AVAILABLE" },
      });
      await tx.audit.create({
        data: {
          clinicId: batch.slot.clinicId,
          actor: "System",
          action: "Notification groups exhausted; slot released",
        },
      });
    }
  }
}
