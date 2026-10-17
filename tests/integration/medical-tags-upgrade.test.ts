import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { expect, it } from "vitest";
it("additively upgrades populated Phase 7 data without changing patient answers, history, priorities or granting clinical roles", async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA medical_upgrade_test");
    await client.query("SET LOCAL search_path TO medical_upgrade_test");
    for (const name of (await readdir("prisma/migrations"))
      .sort()
      .filter((n) => n < "0008"))
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
    await client.query(`INSERT INTO "Clinic" (id,name,city,address,description) VALUES ('c','Synthetic','City','Address','Demo');
  INSERT INTO "User" (id,name,role) VALUES ('p','Patient','PATIENT');
  INSERT INTO "User" (id,name,role,"clinicId") VALUES ('a','Clinician','STAFF','c');
  INSERT INTO "Account" (id,"userId",username,email,"passwordHash") VALUES ('a','a','admin','a@example.test','synthetic');
  INSERT INTO "ClinicMembership" (id,"accountId","clinicId",role,status) VALUES ('m','a','c','ADMIN','ACTIVE');
  INSERT INTO "Intake" ("patientId",answers) VALUES ('p','{"original":"preserve exactly"}');
  INSERT INTO "SymptomTag" (id,"patientId",label,score,source,"updatedAt") VALUES ('legacy','p','Self report',1,'QUESTIONNAIRE',CURRENT_TIMESTAMP);
  INSERT INTO "Slot" (id,"clinicId",service,provider,start,"end",price,plans,status) VALUES ('s','c','Dermatology','Synthetic','2030-01-20 17:00','2030-01-20 17:30',10000,ARRAY['Blue Horizon'],'BOOKED');
  INSERT INTO "Booking" (id,"patientId","slotId") VALUES ('b','p','s');
  INSERT INTO "Waitlist" (id,"patientId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays) VALUES ('w','p','Dermatology','Blue Horizon',ARRAY[]::text[],20000,'2030-01-01','2030-02-01',ARRAY[1]);`);
    await client.query(`INSERT INTO "WaitlistPriority" (id,"waitlistId","clinicId",level,"reviewState","assignedById","assignedAt",reason,version) VALUES ('priority','w','c','P2','APPROVED','a',CURRENT_TIMESTAMP,'Reviewed synthetic record',1);
    INSERT INTO "PriorityHistory" (id,"priorityId",level,"actorId",reason,version) VALUES ('history','priority','P2','a','Reviewed synthetic record',1);
    INSERT INTO "NotificationSequence" (id,"slotId","authorizedById",state,"firstGroup",reason) VALUES ('sequence','s','a','COMPLETED',2,'Preserved completed sequence');`);
    const tables = [
      "User",
      "Intake",
      "SymptomTag",
      "Booking",
      "Waitlist",
      "Account",
      "WaitlistPriority",
      "PriorityHistory",
      "NotificationSequence",
    ];
    const before = await Promise.all(
      tables.map((t) => client.query(`SELECT * FROM "${t}" ORDER BY 1`)),
    );
    const member = (await client.query('SELECT * FROM "ClinicMembership"'))
      .rows[0];
    await client.query(
      await readFile(
        "prisma/migrations/0008_clinician_medical_tags/migration.sql",
        "utf8",
      ),
    );
    for (let i = 0; i < tables.length; i++)
      expect(
        (await client.query(`SELECT * FROM "${tables[i]}" ORDER BY 1`)).rows,
      ).toEqual(before[i].rows);
    expect(
      (await client.query('SELECT * FROM "ClinicMembership"')).rows[0],
    ).toEqual({ ...member, canAuthorMedicalTags: false });
    expect((await client.query('SELECT * FROM "MedicalTag"')).rows).toEqual([]);
    expect((await client.query('SELECT * FROM "MedicalNeed"')).rows).toEqual(
      [],
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
