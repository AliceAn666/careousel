-- Additive extension. Never backfill medical evidence from legacy symptom scores.
CREATE TABLE "MedicalRecordImport" (
 "id" TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "User"(id),
 "clinicId" TEXT NOT NULL REFERENCES "Clinic"(id), "requestId" TEXT NOT NULL,
 "source" TEXT NOT NULL DEFAULT 'CAREOUSEL_SYNTHETIC_FHIR_V1' CHECK (source='CAREOUSEL_SYNTHETIC_FHIR_V1'),
 "consentVersion" TEXT NOT NULL DEFAULT 'SYNTHETIC_V1' CHECK ("consentVersion"='SYNTHETIC_V1'),
 "state" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REVOKED')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
 UNIQUE("patientId","requestId"), UNIQUE(id,"patientId","clinicId"),
 CHECK ((state='REVOKED')=("revokedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_synthetic_import ON "MedicalRecordImport"("patientId","clinicId") WHERE state='ACTIVE';
CREATE TABLE "ImportedMedicalRecord" (
 id TEXT PRIMARY KEY, "importId" TEXT NOT NULL REFERENCES "MedicalRecordImport"(id),
 "resourceId" TEXT NOT NULL, "resourceType" TEXT NOT NULL, text TEXT NOT NULL,
 resource JSONB NOT NULL, "contentHash" TEXT NOT NULL,
 UNIQUE(id,"importId"), UNIQUE("importId","resourceId")
);
CREATE INDEX imported_record_fulltext ON "ImportedMedicalRecord" USING gin(to_tsvector('english',text));
CREATE TABLE "ImportedTagSuggestion" (
 id TEXT PRIMARY KEY, "importId" TEXT NOT NULL REFERENCES "MedicalRecordImport"(id),
 "recordId" TEXT NOT NULL UNIQUE, excerpt TEXT NOT NULL, "originalFields" JSONB NOT NULL, fields JSONB NOT NULL,
 method TEXT NOT NULL CHECK (method IN ('LOCAL_RULES','LOCAL_AI')), explanation TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','APPROVED','REJECTED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0), "reviewedById" TEXT REFERENCES "User"(id),
 "reviewedAt" TIMESTAMP(3), "tagId" TEXT UNIQUE REFERENCES "MedicalTag"(id),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("recordId","importId"),
 FOREIGN KEY ("recordId","importId") REFERENCES "ImportedMedicalRecord"(id,"importId"),
 CHECK ((state='APPROVED')=("tagId" IS NOT NULL)),
 CHECK (state='PENDING' OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL))
);
CREATE TABLE "MedicalRecordAudit" (
 id TEXT PRIMARY KEY, "importId" TEXT NOT NULL REFERENCES "MedicalRecordImport"(id),
 "actorId" TEXT NOT NULL REFERENCES "User"(id), action TEXT NOT NULL,
 details JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MedicalRecordAudit_importId_createdAt_idx" ON "MedicalRecordAudit"("importId","createdAt");
ALTER TABLE "MedicalNeed" ALTER COLUMN "sourceBookingId" DROP NOT NULL;
ALTER TABLE "MedicalTag" ALTER COLUMN "sourceBookingId" DROP NOT NULL;
ALTER TABLE "MedicalNeed" ADD COLUMN "sourceImportId" TEXT,
 ADD FOREIGN KEY ("sourceImportId","patientId","clinicId") REFERENCES "MedicalRecordImport"(id,"patientId","clinicId");
ALTER TABLE "MedicalTag" ADD COLUMN "sourceImportId" TEXT, ADD COLUMN "sourceRecordId" TEXT, ADD COLUMN "sourceExcerpt" TEXT,
 ADD FOREIGN KEY ("sourceImportId","patientId","clinicId") REFERENCES "MedicalRecordImport"(id,"patientId","clinicId"),
 ADD FOREIGN KEY ("sourceRecordId","sourceImportId") REFERENCES "ImportedMedicalRecord"(id,"importId");
ALTER TABLE "MedicalTag" DROP CONSTRAINT "MedicalTag_sourceType_check";
ALTER TABLE "MedicalTag" ADD CHECK ("sourceType" IN ('CLINICIAN_VISIT','SYNTHETIC_RECORD_REVIEW'));
ALTER TABLE "MedicalNeed" ADD CHECK (("sourceBookingId" IS NOT NULL) <> ("sourceImportId" IS NOT NULL));
ALTER TABLE "MedicalTag" ADD CHECK (("sourceBookingId" IS NOT NULL) <> ("sourceImportId" IS NOT NULL));
CREATE OR REPLACE FUNCTION careousel_check_medical_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sourceBookingId" IS NOT NULL THEN
  IF NEW."sourceImportId" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "Booking" b JOIN "Slot" s ON s.id=b."slotId" WHERE b.id=NEW."sourceBookingId" AND b."patientId"=NEW."patientId" AND s."clinicId"=NEW."clinicId") THEN
   RAISE EXCEPTION 'Medical source must belong to patient and clinic';
  END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM "MedicalRecordImport" i WHERE i.id=NEW."sourceImportId" AND i."patientId"=NEW."patientId" AND i."clinicId"=NEW."clinicId" AND i.state='ACTIVE') THEN
   RAISE EXCEPTION 'Active patient consent at this clinic is required';
  END IF;
 END IF;
 IF TG_TABLE_NAME='MedicalTag' THEN
  IF NEW."sourceBookingId" IS NOT NULL THEN
   IF NEW."sourceType"<>'CLINICIAN_VISIT' OR NEW."sourceRecordId" IS NOT NULL OR NEW."sourceExcerpt" IS NOT NULL THEN RAISE EXCEPTION 'Invalid visit provenance'; END IF;
  ELSE
   IF NEW."sourceType"<>'SYNTHETIC_RECORD_REVIEW' OR NEW."sourceRecordId" IS NULL OR NEW."sourceExcerpt" IS NULL OR NOT EXISTS (SELECT 1 FROM "ImportedMedicalRecord" r WHERE r.id=NEW."sourceRecordId" AND r."importId"=NEW."sourceImportId" AND length(NEW."sourceExcerpt")>0 AND strpos(r.text,NEW."sourceExcerpt")>0) THEN RAISE EXCEPTION 'Reviewed record requires original source excerpt'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION careousel_medical_provenance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."needId",NEW."patientId",NEW."clinicId",NEW."sourceBookingId",NEW."sourceImportId",NEW."sourceRecordId",NEW."sourceExcerpt",NEW."authorId",NEW."createdAt",NEW."sourceType") IS DISTINCT FROM ROW(OLD."needId",OLD."patientId",OLD."clinicId",OLD."sourceBookingId",OLD."sourceImportId",OLD."sourceRecordId",OLD."sourceExcerpt",OLD."authorId",OLD."createdAt",OLD."sourceType") THEN RAISE EXCEPTION 'Medical tag provenance is immutable'; END IF;
 IF NEW.version <> OLD.version+1 THEN RAISE EXCEPTION 'Medical tag version must advance by one'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER record_archive_immutable BEFORE UPDATE OR DELETE ON "ImportedMedicalRecord" FOR EACH ROW EXECUTE FUNCTION careousel_medical_history_guard();
CREATE TRIGGER record_audit_immutable BEFORE UPDATE OR DELETE ON "MedicalRecordAudit" FOR EACH ROW EXECUTE FUNCTION careousel_medical_history_guard();
CREATE FUNCTION careousel_consent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='REVOKED' OR NEW.state<>'REVOKED' OR NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW."patientId",NEW."clinicId",NEW."requestId",NEW.source,NEW."consentVersion",NEW."consentedAt") IS DISTINCT FROM ROW(OLD.id,OLD."patientId",OLD."clinicId",OLD."requestId",OLD.source,OLD."consentVersion",OLD."consentedAt") THEN RAISE EXCEPTION 'Consent is immutable except explicit versioned revocation'; END IF;
 IF EXISTS(SELECT 1 FROM "MedicalTag" WHERE "sourceImportId"=OLD.id AND state<>'RETIRED') THEN RAISE EXCEPTION 'Imported tags must be retired before revocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER record_consent_guard BEFORE UPDATE ON "MedicalRecordImport" FOR EACH ROW EXECUTE FUNCTION careousel_consent_guard();
