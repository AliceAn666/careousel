ALTER TABLE "User" ADD COLUMN "visitType" TEXT CHECK ("visitType" IN ('FIRST','FOLLOW_UP'));
CREATE TABLE "Intake" ("patientId" TEXT PRIMARY KEY REFERENCES "User"("id"),"answers" JSONB NOT NULL,"completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "SymptomTag" ("id" TEXT PRIMARY KEY,"patientId" TEXT NOT NULL REFERENCES "User"("id"),"label" TEXT NOT NULL CHECK (char_length("label") BETWEEN 1 AND 40),"score" INTEGER NOT NULL CHECK ("score" BETWEEN 1 AND 10),"source" TEXT NOT NULL CHECK ("source" IN ('QUESTIONNAIRE','CLINIC')),"clinicId" TEXT REFERENCES "Clinic"("id"),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK (("source"='CLINIC') = ("clinicId" IS NOT NULL)));
CREATE INDEX "SymptomTag_patientId_idx" ON "SymptomTag"("patientId");
CREATE UNIQUE INDEX "one_tag_label_per_source" ON "SymptomTag"("patientId","source",COALESCE("clinicId",''),lower("label"));
