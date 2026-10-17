-- New patient-managed scheduling contexts; no backfill or replacement of clinical needs.
CREATE TABLE "ExternalAppointment" (
 id TEXT PRIMARY KEY,"patientId" TEXT NOT NULL REFERENCES "User"(id),"clinicName" TEXT NOT NULL,
 "reportKey" TEXT NOT NULL,UNIQUE("patientId","reportKey"),service TEXT NOT NULL,start TIMESTAMP(3) NOT NULL,"end" TIMESTAMP(3) NOT NULL,location TEXT NOT NULL,
 reference TEXT NOT NULL,"reportedConfirmed" BOOLEAN NOT NULL,"reportedCancelled" BOOLEAN NOT NULL DEFAULT false,
 verification TEXT NOT NULL DEFAULT 'PATIENT_REPORTED_UNVERIFIED' CHECK(verification='PATIENT_REPORTED_UNVERIFIED'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE(id,"patientId"),CHECK("end">start)
);
CREATE TABLE "PatientNeed" (
 id TEXT PRIMARY KEY,"patientId" TEXT NOT NULL REFERENCES "User"(id),title TEXT NOT NULL,service TEXT NOT NULL,
 preferences JSONB NOT NULL,"requiresReferral" BOOLEAN NOT NULL DEFAULT false,"requiresAuthorization" BOOLEAN NOT NULL DEFAULT false,
 state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','SECURED','COMPLETED','CLOSED')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "originalBookingId" TEXT UNIQUE,"currentBookingId" TEXT UNIQUE,"externalAppointmentId" TEXT UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE(id,"patientId"),UNIQUE("originalBookingId","patientId"),UNIQUE("currentBookingId","patientId"),UNIQUE("externalAppointmentId","patientId"),
 FOREIGN KEY("originalBookingId","patientId") REFERENCES "Booking"(id,"patientId"),
 FOREIGN KEY("currentBookingId","patientId") REFERENCES "Booking"(id,"patientId"),
 FOREIGN KEY("externalAppointmentId","patientId") REFERENCES "ExternalAppointment"(id,"patientId"),
 CHECK("originalBookingId" IS NULL OR "externalAppointmentId" IS NULL)
);
ALTER TABLE "Booking" ADD COLUMN "needId" TEXT,
 ADD FOREIGN KEY("needId","patientId") REFERENCES "PatientNeed"(id,"patientId");
ALTER TABLE "Waitlist" ADD COLUMN "needId" TEXT,ADD COLUMN "externalAppointmentId" TEXT,
 ADD COLUMN "requiresReferral" BOOLEAN NOT NULL DEFAULT false,ADD COLUMN "requiresAuthorization" BOOLEAN NOT NULL DEFAULT false,
 ADD FOREIGN KEY("needId","patientId") REFERENCES "PatientNeed"(id,"patientId"),
 ADD FOREIGN KEY("externalAppointmentId","patientId") REFERENCES "ExternalAppointment"(id,"patientId"),
 ADD CHECK("bookingId" IS NULL OR "externalAppointmentId" IS NULL);
DROP INDEX "one_active_waitlist_per_service";
CREATE UNIQUE INDEX one_active_legacy_waitlist_per_service ON "Waitlist"("patientId",service) WHERE status='ACTIVE' AND "needId" IS NULL;
CREATE UNIQUE INDEX one_active_waitlist_per_need ON "Waitlist"("needId") WHERE status='ACTIVE' AND "needId" IS NOT NULL;
CREATE UNIQUE INDEX one_active_replacement_per_booking ON "Waitlist"("bookingId") WHERE status='ACTIVE' AND "bookingId" IS NOT NULL;
CREATE UNIQUE INDEX one_active_replacement_per_external ON "Waitlist"("externalAppointmentId") WHERE status='ACTIVE' AND "externalAppointmentId" IS NOT NULL;
ALTER TABLE "MedicalTag" ADD UNIQUE(id,"patientId");
CREATE TABLE "PatientNeedEvidence" (
 "needId" TEXT NOT NULL,"patientId" TEXT NOT NULL,"tagId" TEXT NOT NULL,PRIMARY KEY("needId","tagId"),
 FOREIGN KEY("needId","patientId") REFERENCES "PatientNeed"(id,"patientId"),
 FOREIGN KEY("tagId","patientId") REFERENCES "MedicalTag"(id,"patientId")
);
CREATE TABLE "PatientNeedHistory" (
 id TEXT PRIMARY KEY,"needId" TEXT NOT NULL REFERENCES "PatientNeed"(id),version INTEGER NOT NULL,
 "actorId" TEXT NOT NULL REFERENCES "User"(id),action TEXT NOT NULL,details JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("needId",version)
);
CREATE TRIGGER patient_need_history_immutable BEFORE UPDATE OR DELETE ON "PatientNeedHistory" FOR EACH ROW EXECUTE FUNCTION careousel_medical_history_guard();
CREATE FUNCTION careousel_patient_need_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."patientId",NEW.service,NEW."originalBookingId",NEW."externalAppointmentId",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."patientId",OLD.service,OLD."originalBookingId",OLD."externalAppointmentId",OLD."createdAt") THEN RAISE EXCEPTION 'Need provenance is immutable'; END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Need version must advance by one'; END IF;
 END IF;
 IF NEW."currentBookingId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Booking" b JOIN "Slot" s ON s.id=b."slotId" WHERE b.id=NEW."currentBookingId" AND b."patientId"=NEW."patientId" AND s.service=NEW.service AND (b."needId" IS NULL OR b."needId"=NEW.id)) THEN RAISE EXCEPTION 'Need booking must match owner and service'; END IF;
 IF NEW."externalAppointmentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ExternalAppointment" e WHERE e.id=NEW."externalAppointmentId" AND e."patientId"=NEW."patientId" AND e.service=NEW.service) THEN RAISE EXCEPTION 'External appointment must match owner and service'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER patient_need_guard BEFORE INSERT OR UPDATE ON "PatientNeed" FOR EACH ROW EXECUTE FUNCTION careousel_patient_need_guard();
CREATE FUNCTION careousel_need_links_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT;
BEGIN
 IF TG_TABLE_NAME='Booking' THEN
  IF TG_OP='UPDATE' AND OLD."needId" IS NOT NULL AND NEW."needId" IS DISTINCT FROM OLD."needId" AND current_setting('careousel.synthetic_reset',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Booking need assignment is immutable'; END IF;
  IF NEW."needId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PatientNeed" n JOIN "Slot" s ON s.id=NEW."slotId" WHERE n.id=NEW."needId" AND n."patientId"=NEW."patientId" AND n.service=s.service) THEN RAISE EXCEPTION 'Booking need service mismatch'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND OLD."needId" IS NOT NULL AND ROW(NEW."needId",NEW."patientId",NEW.service,NEW."bookingId",NEW."externalAppointmentId") IS DISTINCT FROM ROW(OLD."needId",OLD."patientId",OLD.service,OLD."bookingId",OLD."externalAppointmentId") THEN RAISE EXCEPTION 'Request need association is immutable'; END IF;
  IF NEW.status='ACTIVE' AND NEW."needId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PatientNeed" n WHERE n.id=NEW."needId" AND n."patientId"=NEW."patientId" AND n.service=NEW.service AND (NEW."bookingId" IS NULL OR n."currentBookingId"=NEW."bookingId") AND (NEW."externalAppointmentId" IS NULL OR n."externalAppointmentId"=NEW."externalAppointmentId")) THEN RAISE EXCEPTION 'Waitlist need source mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_need_guard BEFORE INSERT OR UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION careousel_need_links_guard();
CREATE TRIGGER waitlist_need_guard BEFORE INSERT OR UPDATE ON "Waitlist" FOR EACH ROW EXECUTE FUNCTION careousel_need_links_guard();
CREATE FUNCTION careousel_external_report_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW."patientId",NEW.service,NEW."createdAt",NEW.verification) IS DISTINCT FROM ROW(OLD.id,OLD."patientId",OLD.service,OLD."createdAt",OLD.verification) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'External report requires immutable provenance and versioned changes'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_report_guard BEFORE UPDATE ON "ExternalAppointment" FOR EACH ROW EXECUTE FUNCTION careousel_external_report_guard();
