-- Additive only: old Intake/SymptomTag data and applied migrations are unchanged.
CREATE TABLE "WaitlistPriority" (
  "id" TEXT PRIMARY KEY,
  "waitlistId" TEXT NOT NULL REFERENCES "Waitlist"("id") ON DELETE RESTRICT,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT,
  "level" TEXT CHECK ("level" IN ('P1','P2','P3','P4')),
  "reviewState" TEXT NOT NULL DEFAULT 'UNREVIEWED' CHECK ("reviewState" IN ('UNREVIEWED','APPROVED')),
  "assignedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "assignedAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  UNIQUE ("waitlistId", "clinicId"),
  CHECK (("reviewState"='APPROVED' AND "level" IS NOT NULL AND "assignedById" IS NOT NULL AND "assignedAt" IS NOT NULL AND char_length("reason") BETWEEN 3 AND 500 AND "version">0)
      OR ("reviewState"='UNREVIEWED' AND "level" IS NULL AND "assignedById" IS NULL AND "assignedAt" IS NULL))
);
CREATE TABLE "PriorityHistory" (
  "id" TEXT PRIMARY KEY,
  "priorityId" TEXT NOT NULL REFERENCES "WaitlistPriority"("id") ON DELETE RESTRICT,
  "previousLevel" TEXT CHECK ("previousLevel" IN ('P1','P2','P3','P4')),
  "level" TEXT CHECK ("level" IN ('P1','P2','P3','P4')),
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL CHECK (char_length("reason") BETWEEN 3 AND 500),
  "version" INTEGER NOT NULL CHECK ("version">0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("priorityId", "version")
);
CREATE INDEX "WaitlistPriority_clinicId_idx" ON "WaitlistPriority"("clinicId");
-- Conservatively backfill only explicitly named clinics or the linked booking's
-- clinic. Scores, other historical patient bookings and clinicIds=[] are not
-- evidence of a request's approved priority or network consent.
INSERT INTO "WaitlistPriority" ("id","waitlistId","clinicId")
SELECT 'legacy-priority-' || md5(w."id" || ':' || c."id"), w."id", c."id"
FROM "Waitlist" w CROSS JOIN "Clinic" c
WHERE c."id" = ANY(w."clinicIds") OR EXISTS (
  SELECT 1 FROM "Booking" b JOIN "Slot" s ON s."id"=b."slotId"
  WHERE b."id"=w."bookingId" AND s."clinicId"=c."id"
);
-- Practical safeguard against direct SQL claiming that a patient/foreign clinic
-- assigned an approved level. Future account memberships replace this check
-- additively; current baseline staff belongs to exactly one clinic.
CREATE FUNCTION careousel_check_priority_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."reviewState"='APPROVED' AND NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u."id"=NEW."assignedById"
      AND u."role"='STAFF' AND u."clinicId"=NEW."clinicId"
  ) THEN RAISE EXCEPTION 'Priority requires own-clinic staff' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER careousel_priority_actor BEFORE INSERT OR UPDATE ON "WaitlistPriority"
FOR EACH ROW EXECUTE FUNCTION careousel_check_priority_actor();
