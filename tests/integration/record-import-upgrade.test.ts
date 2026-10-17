import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { expect, it } from "vitest";
it("upgrades populated Part A data without changing bookings, consent-free visit tags, immutable snapshots or priorities", async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA record_import_upgrade");
    await client.query("SET LOCAL search_path TO record_import_upgrade");
    const migrations = (await readdir("prisma/migrations")).sort();
    for (const name of migrations.filter((n) => n < "0009"))
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
    await client.query(`INSERT INTO "Clinic" (id,name,city,address,description) VALUES ('c','Synthetic','City','Address','Demo');
 INSERT INTO "User" (id,name,role) VALUES ('p','Patient','PATIENT');
 INSERT INTO "User" (id,name,role,"clinicId") VALUES ('a','Clinician','STAFF','c');
 INSERT INTO "Account" (id,"userId",username,email,"passwordHash") VALUES ('a','a','admin','a@example.test','synthetic');
 INSERT INTO "ClinicMembership" (id,"accountId","clinicId",role,status,"canAuthorMedicalTags") VALUES ('m','a','c','ADMIN','ACTIVE',true);
 INSERT INTO "Intake" ("patientId",answers) VALUES ('p','{"legacy":"unchanged"}');
 INSERT INTO "Slot" (id,"clinicId",service,provider,start,"end",price,plans,status) VALUES ('s','c','Dermatology','Synthetic','2020-01-20 17:00','2020-01-20 17:30',10000,ARRAY['Blue Horizon'],'BOOKED');
 INSERT INTO "Booking" (id,"patientId","slotId") VALUES ('b','p','s');
 INSERT INTO "MedicalNeed" (id,"patientId","clinicId","sourceBookingId",title,service,"createdById") VALUES ('need','p','c','b','Legacy clinical need','Dermatology','a');
 INSERT INTO "MedicalTag" (id,"needId","patientId","clinicId","sourceBookingId","authorId","updatedById",kind,label,"clinicalNotes","followUpRecommendation","updatedAt") VALUES ('tag','need','p','c','b','a','a','FOLLOW_UP','Legacy follow-up','Preserve notes','Preserve recommendation',CURRENT_TIMESTAMP);
 INSERT INTO "MedicalTagRevision" (id,"tagId",version,"actorId",action,reason,snapshot) VALUES ('revision','tag',1,'a','CREATE','Legacy review','{"preserve":"exact snapshot"}');
 INSERT INTO "Waitlist" (id,"patientId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays) VALUES ('w','p','Dermatology','Blue Horizon',ARRAY['c'],20000,'2030-01-01','2030-02-01',ARRAY[1]);
 INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level,"reviewState","assignedById","assignedAt",reason,version) VALUES ('priority','w','c','P2','APPROVED','a',CURRENT_TIMESTAMP,'Human clinical review',1);`);
    const tables = [
      "User",
      "Account",
      "ClinicMembership",
      "Intake",
      "Booking",
      "MedicalNeed",
      "MedicalTag",
      "MedicalTagRevision",
      "WaitlistPriority",
    ];
    const snapshots = [];
    for (const table of tables)
      snapshots.push(
        (await client.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows,
      );
    for (const name of migrations.filter((n) => n >= "0009"))
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
    for (let i = 0; i < tables.length; i++) {
      const added =
        tables[i] === "MedicalNeed"
          ? { sourceImportId: null }
          : tables[i] === "MedicalTag"
            ? {
                sourceImportId: null,
                sourceRecordId: null,
                sourceExcerpt: null,
              }
            : {};
      expect(
        (await client.query(`SELECT * FROM "${tables[i]}" ORDER BY 1`)).rows,
      ).toEqual(snapshots[i].map((row) => ({ ...row, ...added })));
    }
    expect(
      (await client.query('SELECT * FROM "MedicalRecordImport"')).rows,
    ).toEqual([]);
    await client.query(
      `UPDATE "MedicalTag" SET state='APPROVED',version=2,"reviewedById"='a',"reviewedAt"=CURRENT_TIMESTAMP WHERE id='tag'`,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
