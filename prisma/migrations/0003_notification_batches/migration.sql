CREATE TABLE "NotificationBatch" (
  "id" TEXT PRIMARY KEY,
  "slotId" TEXT NOT NULL REFERENCES "Slot"("id"),
  "priorityIds" TEXT[] NOT NULL,
  "generalIds" TEXT[] NOT NULL,
  "intervalMinutes" INTEGER NOT NULL CHECK ("intervalMinutes" BETWEEN 1 AND 60),
  "round" INTEGER NOT NULL DEFAULT 0 CHECK ("round" BETWEEN 0 AND 2),
  "nextAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','COMPLETED','CANCELLED','EXHAUSTED')),
  "reason" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "slotId")
);
ALTER TABLE "Offer" ADD COLUMN "batchId" TEXT;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_batch_slot_fkey" FOREIGN KEY ("batchId", "slotId") REFERENCES "NotificationBatch"("id", "slotId");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_batch_waitlist_unique" UNIQUE ("batchId", "waitlistId");
CREATE UNIQUE INDEX "one_active_batch_per_slot" ON "NotificationBatch"("slotId") WHERE "status"='ACTIVE';
DROP INDEX "one_pending_offer_per_slot";
CREATE UNIQUE INDEX "one_pending_offer_per_slot" ON "Offer"("slotId") WHERE "status"='PENDING' AND "batchId" IS NULL;
-- Pending offers may share a slot only within the same staff-approved batch.
-- Application transactions take the scheduling advisory lock; this trigger also
-- prevents direct writes mixing standalone or different-batch holds.
CREATE FUNCTION careousel_check_offer_hold() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'PENDING' THEN
    PERFORM pg_advisory_xact_lock(728194);
    IF EXISTS (SELECT 1 FROM "Offer" o WHERE o."slotId"=NEW."slotId" AND o."status"='PENDING' AND o."id"<>NEW."id" AND (NEW."batchId" IS NULL OR o."batchId" IS DISTINCT FROM NEW."batchId")) THEN
      RAISE EXCEPTION 'Slot already held by another invitation' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER careousel_offer_hold BEFORE INSERT OR UPDATE ON "Offer" FOR EACH ROW EXECUTE FUNCTION careousel_check_offer_hold();
