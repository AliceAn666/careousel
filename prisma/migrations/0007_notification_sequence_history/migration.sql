-- Retain prior sequences when a previously filled appointment is cancelled again.
ALTER TABLE "NotificationSequence" DROP CONSTRAINT "NotificationSequence_slotId_key";
CREATE UNIQUE INDEX "one_live_sequence_per_slot" ON "NotificationSequence"("slotId") WHERE "state" IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED');
CREATE INDEX "NotificationSequence_slotId_createdAt_idx" ON "NotificationSequence"("slotId","createdAt");
