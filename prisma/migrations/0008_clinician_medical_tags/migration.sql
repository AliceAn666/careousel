ALTER TABLE "ClinicMembership" ADD COLUMN "canAuthorMedicalTags" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "MedicalNeed" (
 "id" TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "User"("id"),
 "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),
 "sourceBookingId" TEXT NOT NULL, "title" TEXT NOT NULL, "service" TEXT NOT NULL,
 "createdById" TEXT NOT NULL REFERENCES "User"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("id", "patientId", "clinicId"),
 FOREIGN KEY ("sourceBookingId", "patientId") REFERENCES "Booking"("id", "patientId")
);
CREATE TABLE "MedicalTag" (
 "id" TEXT PRIMARY KEY, "needId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
 "clinicId" TEXT NOT NULL, "sourceBookingId" TEXT NOT NULL,
 "authorId" TEXT NOT NULL REFERENCES "User"("id"), "updatedById" TEXT NOT NULL REFERENCES "User"("id"),
 "reviewedById" TEXT REFERENCES "User"("id"), "reviewedAt" TIMESTAMP(3),
 "sourceType" TEXT NOT NULL DEFAULT 'CLINICIAN_VISIT' CHECK ("sourceType" = 'CLINICIAN_VISIT'),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('FOLLOW_UP', 'SERVICE_REQUIREMENT', 'CLINICAL_NOTE')),
 "label" TEXT NOT NULL, "clinicalNotes" TEXT NOT NULL, "followUpRecommendation" TEXT NOT NULL,
 "recommendedFrom" TIMESTAMP(3), "recommendedBy" TIMESTAMP(3),
 "requiresReferral" BOOLEAN NOT NULL DEFAULT false, "requiresAuthorization" BOOLEAN NOT NULL DEFAULT false,
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT', 'APPROVED', 'RETIRED')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("needId", "patientId", "clinicId") REFERENCES "MedicalNeed"("id", "patientId", "clinicId"),
 FOREIGN KEY ("sourceBookingId", "patientId") REFERENCES "Booking"("id", "patientId"),
 CHECK ("recommendedFrom" IS NULL OR "recommendedBy" IS NULL OR "recommendedFrom" <= "recommendedBy"),
 CHECK (("state" = 'APPROVED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR "state" <> 'APPROVED')
);
CREATE INDEX "MedicalTag_clinicId_patientId_state_idx" ON "MedicalTag"("clinicId", "patientId", "state");
CREATE TABLE "MedicalTagRevision" (
 "id" TEXT PRIMARY KEY, "tagId" TEXT NOT NULL REFERENCES "MedicalTag"("id"),
 "version" INTEGER NOT NULL, "actorId" TEXT NOT NULL REFERENCES "User"("id"),
 "action" TEXT NOT NULL CHECK ("action" IN ('CREATE', 'EDIT', 'APPROVE', 'RETIRE')),
 "reason" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("tagId", "version")
);
-- Prevent a source from being attributed to a different clinic, including direct SQL writes.
CREATE FUNCTION careousel_check_medical_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Booking" b JOIN "Slot" s ON s.id=b."slotId"
 WHERE b.id=NEW."sourceBookingId" AND b."patientId"=NEW."patientId" AND s."clinicId"=NEW."clinicId") THEN
 RAISE EXCEPTION 'Medical source must belong to patient and clinic';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER medical_need_source BEFORE INSERT OR UPDATE ON "MedicalNeed" FOR EACH ROW EXECUTE FUNCTION careousel_check_medical_source();
CREATE TRIGGER medical_tag_source BEFORE INSERT OR UPDATE ON "MedicalTag" FOR EACH ROW EXECUTE FUNCTION careousel_check_medical_source();
CREATE FUNCTION careousel_medical_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' AND current_setting('careousel.synthetic_reset', true) = 'on' THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Medical tag history is append-only';
END $$;
CREATE TRIGGER medical_history_immutable BEFORE UPDATE OR DELETE ON "MedicalTagRevision" FOR EACH ROW EXECUTE FUNCTION careousel_medical_history_guard();
CREATE FUNCTION careousel_medical_provenance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."needId",NEW."patientId",NEW."clinicId",NEW."sourceBookingId",NEW."authorId",NEW."createdAt",NEW."sourceType") IS DISTINCT FROM ROW(OLD."needId",OLD."patientId",OLD."clinicId",OLD."sourceBookingId",OLD."authorId",OLD."createdAt",OLD."sourceType") THEN
 RAISE EXCEPTION 'Medical tag provenance is immutable';
 END IF;
 IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Medical tag version must advance by one'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER medical_provenance_immutable BEFORE UPDATE ON "MedicalTag" FOR EACH ROW EXECUTE FUNCTION careousel_medical_provenance_guard();
