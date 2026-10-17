import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { expect, it } from "vitest";
it("adds independent scheduling without rewriting legacy bookings, active requests, synthetic record sources or priorities", async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("CREATE SCHEMA patient_needs_upgrade");
    await c.query("SET LOCAL search_path TO patient_needs_upgrade");
    const migrations = (await readdir("prisma/migrations")).sort();
    for (const m of migrations.filter((n) => n < "0011"))
      await c.query(
        await readFile(`prisma/migrations/${m}/migration.sql`, "utf8"),
      );
    await c.query(`INSERT INTO "Clinic" (id,name,city,address,description) VALUES ('c','Synthetic','City','Address','Demo');
 INSERT INTO "User" (id,name,role) VALUES ('p','Patient','PATIENT');
 INSERT INTO "User" (id,name,role,"clinicId") VALUES ('a','Clinician','STAFF','c');
 INSERT INTO "Intake" ("patientId",answers) VALUES ('p','{"legacy":"unchanged"}');
 INSERT INTO "Slot" (id,"clinicId",service,provider,start,"end",price,plans,status) VALUES ('s','c','Dermatology','Synthetic','2030-02-20 17:00','2030-02-20 17:30',10000,ARRAY['Blue Horizon'],'BOOKED');
 INSERT INTO "Booking" (id,"patientId","slotId") VALUES ('b','p','s');
 INSERT INTO "MedicalNeed" (id,"patientId","clinicId","sourceBookingId",title,service,"createdById") VALUES ('n','p','c','b','Clinical need','Dermatology','a');
 INSERT INTO "MedicalTag" (id,"needId","patientId","clinicId","sourceBookingId","authorId","updatedById",kind,label,"clinicalNotes","followUpRecommendation","updatedAt") VALUES ('t','n','p','c','b','a','a','FOLLOW_UP','Existing clinician tag','Preserved private note','Preserved recommendation',CURRENT_TIMESTAMP);
 INSERT INTO "MedicalTagRevision" (id,"tagId",version,"actorId",action,reason,snapshot) VALUES ('r','t',1,'a','CREATE','Review','{"preserve":"exact"}');
 INSERT INTO "Waitlist" (id,"patientId","bookingId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays) VALUES ('w','p','b','Dermatology','Blue Horizon',ARRAY['c'],20000,'2030-01-01','2030-02-01',ARRAY[1]);
 INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level,"reviewState","assignedById","assignedAt",reason,version) VALUES ('pr','w','c','P2','APPROVED','a',CURRENT_TIMESTAMP,'Human review',1);`);
    await c.query(`INSERT INTO "MedicalRecordImport" (id,"patientId","clinicId","requestId") VALUES ('import','p','c','request');
 INSERT INTO "ImportedMedicalRecord" (id,"importId","resourceId","resourceType",text,resource,"contentHash") VALUES ('record','import','resource','Condition','Synthetic source preserved','{"resourceType":"Condition"}','synthetic-hash');
 INSERT INTO "MedicalRecordAudit" (id,"importId","actorId",action,details) VALUES ('audit','import','p','CONSENT','{"preserve":"exact"}');`);
    const tables = [
      "User",
      "Intake",
      "Slot",
      "Booking",
      "Waitlist",
      "WaitlistPriority",
      "MedicalNeed",
      "MedicalTag",
      "MedicalTagRevision",
      "MedicalRecordImport",
      "ImportedMedicalRecord",
      "MedicalRecordAudit",
    ];
    const before = [];
    for (const t of tables)
      before.push((await c.query(`SELECT * FROM "${t}" ORDER BY 1`)).rows);
    for (const m of migrations.filter((n) => n >= "0011"))
      await c.query(
        await readFile(`prisma/migrations/${m}/migration.sql`, "utf8"),
      );
    for (const [i, t] of tables.entries()) {
      const added =
        t === "Booking"
          ? { needId: null }
          : t === "Waitlist"
            ? {
                needId: null,
                externalAppointmentId: null,
                requiresReferral: false,
                requiresAuthorization: false,
              }
            : {};
      expect((await c.query(`SELECT * FROM "${t}" ORDER BY 1`)).rows).toEqual(
        before[i].map((row) => ({ ...row, ...added })),
      );
    }
    expect((await c.query('SELECT * FROM "PatientNeed"')).rows).toEqual([]);
    expect((await c.query('SELECT * FROM "ExternalAppointment"')).rows).toEqual(
      [],
    );
    await c.query("SAVEPOINT duplicate");
    await expect(
      c.query(
        `INSERT INTO "Waitlist" (id,"patientId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays) SELECT 'duplicate',"patientId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays FROM "Waitlist" WHERE id='w'`,
      ),
    ).rejects.toThrow();
    await c.query("ROLLBACK TO SAVEPOINT duplicate");
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
  }
});
