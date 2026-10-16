-- Apply after Prisma's initial CREATE TABLE migration.
-- Partial unique indexes protect active state without erasing history.
CREATE UNIQUE INDEX "Booking_one_confirmed_per_slot"
  ON "Booking" ("slotId") WHERE "status" = 'CONFIRMED';
CREATE UNIQUE INDEX "Offer_one_pending_per_slot"
  ON "Offer" ("slotId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "Waitlist_one_active_per_patient_service"
  ON "WaitlistRequest" ("patientId", "serviceId") WHERE "status" = 'ACTIVE';
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_positive_duration" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ClinicService" ADD CONSTRAINT "ClinicService_positive_duration_price"
  CHECK ("durationMinutes" > 0 AND "estimatedPriceCents" >= 0);
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "Waitlist_nonnegative_budget"
  CHECK ("maxPriceCents" >= 0);
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "Waitlist_time_bounds"
  CHECK (("earliestTimeMinutes" IS NULL OR "earliestTimeMinutes" BETWEEN 0 AND 1439)
     AND ("latestTimeMinutes" IS NULL OR "latestTimeMinutes" BETWEEN 1 AND 1440));
-- Application services MUST still lock the patient and slot in one transaction.
-- Cross-slot overlapping bookings cannot be prevented by these indexes alone.
