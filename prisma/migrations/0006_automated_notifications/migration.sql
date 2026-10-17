ALTER TABLE "Slot" ADD COLUMN "requiresReferral" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "requiresAuthorization" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WaitlistPriority" ADD COLUMN "referralApproved" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "authorizationApproved" BOOLEAN NOT NULL DEFAULT false;
-- Additive: old rows/migrations remain unchanged. Legacy exclusive offers stay exclusive.
CREATE TABLE "NotificationSequence" (
 "id" TEXT PRIMARY KEY, "slotId" TEXT NOT NULL UNIQUE REFERENCES "Slot"("id"),
 "authorizedById" TEXT NOT NULL REFERENCES "User"("id"),
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
 "nextSendAt" TIMESTAMP(3), "lastSentAt" TIMESTAMP(3), "firstGroup" INTEGER NOT NULL CHECK ("firstGroup" BETWEEN 1 AND 4),
 "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NotificationSequence_state_nextSendAt_idx" ON "NotificationSequence"("state","nextSendAt");
CREATE TABLE "NotificationGroup" (
 "id" TEXT PRIMARY KEY, "sequenceId" TEXT NOT NULL REFERENCES "NotificationSequence"("id"),
 "level" TEXT NOT NULL CHECK ("level" IN ('P1','P2','P3','P4')),
 "status" TEXT NOT NULL DEFAULT 'APPROVED' CHECK ("status" IN ('APPROVED','SENT','SKIPPED','CANCELLED')),
 "recipients" JSONB NOT NULL, "sentAt" TIMESTAMP(3), "note" TEXT NOT NULL DEFAULT '',
 UNIQUE("sequenceId","level"), CHECK (("status"='SENT') = ("sentAt" IS NOT NULL))
);
ALTER TABLE "Offer" ADD COLUMN "groupId" TEXT REFERENCES "NotificationGroup"("id");
DROP INDEX "one_pending_offer_per_slot";
CREATE UNIQUE INDEX "one_pending_legacy_offer_per_slot" ON "Offer"("slotId") WHERE "status"='PENDING' AND "groupId" IS NULL;
CREATE UNIQUE INDEX "one_group_invitation_per_request" ON "Offer"("groupId","waitlistId") WHERE "groupId" IS NOT NULL;
-- Serialize direct SQL inserts too; prevent legacy/group mixing and group-slot forgery.
CREATE FUNCTION check_offer_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(728194);
 IF NEW."groupId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "NotificationGroup" g JOIN "NotificationSequence" s ON s.id=g."sequenceId"
  WHERE g.id=NEW."groupId" AND s."slotId"=NEW."slotId"
 ) THEN RAISE EXCEPTION 'Invitation group must belong to opening'; END IF;
 IF NEW.status='PENDING' AND EXISTS (
  SELECT 1 FROM "Offer" o WHERE o."slotId"=NEW."slotId" AND o.status='PENDING' AND o.id<>NEW.id
  AND ((o."groupId" IS NULL) <> (NEW."groupId" IS NULL))
 ) THEN RAISE EXCEPTION 'Cannot mix exclusive and group invitations'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offer_group_integrity BEFORE INSERT OR UPDATE ON "Offer" FOR EACH ROW EXECUTE FUNCTION check_offer_group();
