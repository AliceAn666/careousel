CREATE TABLE "ClinicNotification" ("id" TEXT PRIMARY KEY,"clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),"title" TEXT NOT NULL,"body" TEXT NOT NULL,"read" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ClinicNotification_clinicId_createdAt_idx" ON "ClinicNotification"("clinicId","createdAt");
