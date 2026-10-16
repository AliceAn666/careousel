DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Waitlist" AS w
    JOIN "Booking" AS b ON b."id" = w."bookingId"
    WHERE w."patientId" <> b."patientId"
  ) THEN
    RAISE EXCEPTION 'Cannot add patient-scoped booking links: mismatched waitlist owner';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "Offer" AS o
    JOIN "Waitlist" AS w ON w."id" = o."waitlistId"
    WHERE o."patientId" <> w."patientId"
  ) THEN
    RAISE EXCEPTION 'Cannot add patient-scoped offer links: mismatched waitlist owner';
  END IF;
END $$;

ALTER TABLE "Booking" ADD COLUMN "replacementId" TEXT;
CREATE UNIQUE INDEX "Booking_id_patientId_key" ON "Booking"("id", "patientId");
CREATE UNIQUE INDEX "Booking_replacementId_patientId_key" ON "Booking"("replacementId", "patientId");
CREATE UNIQUE INDEX "Waitlist_id_patientId_key" ON "Waitlist"("id", "patientId");

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_replacement_patient_fkey"
  FOREIGN KEY ("replacementId", "patientId")
  REFERENCES "Booking"("id", "patientId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_replacement_check"
  CHECK ("replacementId" IS NULL OR ("replacementId" <> "id" AND "status" = 'RESCHEDULED'));

ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_bookingId_fkey";
ALTER TABLE "Waitlist"
  ADD CONSTRAINT "Waitlist_booking_patient_fkey"
  FOREIGN KEY ("bookingId", "patientId")
  REFERENCES "Booking"("id", "patientId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Offer" DROP CONSTRAINT "Offer_waitlistId_fkey";
ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_waitlist_patient_fkey"
  FOREIGN KEY ("waitlistId", "patientId")
  REFERENCES "Waitlist"("id", "patientId")
  ON DELETE RESTRICT ON UPDATE CASCADE;