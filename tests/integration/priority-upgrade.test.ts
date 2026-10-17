import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { expect, it } from "vitest";

it("upgrades existing SQL data without inventing priorities or dropping historical information", async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA priority_upgrade_test");
    await client.query("SET LOCAL search_path TO priority_upgrade_test");
    for (const name of [
      "0001_init",
      "0002_booking_history_patient_integrity",
      "0003_priority_scoring",
    ])
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
    await client.query(`INSERT INTO "Clinic" (id,name,city,address,description) VALUES ('cedar','Cedar','Demo','Demo','Synthetic'),('harbor','Harbor','Demo','Demo','Synthetic');
      INSERT INTO "User" (id,name,role) VALUES ('legacy-patient','Synthetic Patient','PATIENT');
      INSERT INTO "Waitlist" (id,"patientId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays)
      VALUES ('legacy-request','legacy-patient','Dermatology','Blue Horizon',ARRAY['cedar'],10000,'2030-01-01','2030-02-01',ARRAY[1]),
             ('legacy-unscoped','legacy-patient','Cardiology','Blue Horizon',ARRAY[]::text[],10000,'2030-01-01','2030-02-01',ARRAY[1]);
      INSERT INTO "SymptomTag" (id,"patientId",label,score,source) VALUES ('legacy-tag','legacy-patient','Historical self-report',10,'QUESTIONNAIRE');
      INSERT INTO "Intake" ("patientId",answers) VALUES ('legacy-patient','{"legacy":true}');`);
    await client.query(`
      INSERT INTO "Slot" (id,"clinicId",service,provider,start,"end",price,plans,status) VALUES
      ('legacy-booked-slot','harbor','Dermatology','Synthetic','2030-01-20 17:00','2030-01-20 17:30',10000,ARRAY['Blue Horizon'],'BOOKED'),
      ('legacy-old-slot','harbor','Dermatology','Synthetic','2030-01-25 17:00','2030-01-25 17:30',10000,ARRAY['Blue Horizon'],'AVAILABLE'),
      ('legacy-offer-slot','cedar','Dermatology','Synthetic','2030-01-10 17:00','2030-01-10 17:30',10000,ARRAY['Blue Horizon'],'HELD');
      INSERT INTO "Booking" (id,"patientId","slotId",status) VALUES ('legacy-booking','legacy-patient','legacy-booked-slot','CONFIRMED');
      INSERT INTO "Booking" (id,"patientId","slotId",status,"replacementId") VALUES ('legacy-old-booking','legacy-patient','legacy-old-slot','RESCHEDULED','legacy-booking');
      UPDATE "Waitlist" SET "bookingId"='legacy-booking' WHERE id='legacy-request';
      INSERT INTO "Offer" (id,"slotId","waitlistId","patientId",reason,"expiresAt") VALUES ('legacy-offer','legacy-offer-slot','legacy-request','legacy-patient','Synthetic existing offer','2030-01-10 16:00');
      INSERT INTO "Notification" (id,"patientId","offerId",title,body) VALUES ('legacy-notice','legacy-patient','legacy-offer','Synthetic','Existing notice');
    `);
    const original = new Map<string, unknown[]>();
    for (const table of [
      "Waitlist",
      "Booking",
      "Offer",
      "Notification",
      "Intake",
      "SymptomTag",
    ])
      original.set(
        table,
        (await client.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows,
      );
    const before = await client.query('SELECT * FROM "SymptomTag"');
    await client.query(
      await readFile(
        "prisma/migrations/0004_waitlist_priority_levels/migration.sql",
        "utf8",
      ),
    );
    expect(
      (
        await client.query(
          'SELECT "waitlistId","clinicId",level,"reviewState",version FROM "WaitlistPriority" ORDER BY "clinicId"',
        )
      ).rows,
    ).toEqual([
      {
        waitlistId: "legacy-request",
        clinicId: "cedar",
        level: null,
        reviewState: "UNREVIEWED",
        version: 0,
      },
      {
        waitlistId: "legacy-request",
        clinicId: "harbor",
        level: null,
        reviewState: "UNREVIEWED",
        version: 0,
      },
    ]);
    await client.query(
      await readFile(
        "prisma/migrations/0005_accounts_clinic_access/migration.sql",
        "utf8",
      ),
    );
    expect(
      (await client.query('SELECT count(*)::int AS total FROM "Account"'))
        .rows[0].total,
    ).toBe(0);
    expect(
      (
        await client.query(
          'SELECT count(*)::int AS total FROM "ClinicMembership"',
        )
      ).rows[0].total,
    ).toBe(0);
    for (const [table, rows] of original)
      expect(
        (await client.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows,
      ).toEqual(rows);
    expect((await client.query('SELECT * FROM "SymptomTag"')).rows).toEqual(
      before.rows,
    );
    expect((await client.query('SELECT answers FROM "Intake"')).rows).toEqual([
      { answers: { legacy: true } },
    ]);
    expect(
      (await client.query('SELECT count(*)::int AS total FROM "Waitlist"'))
        .rows[0].total,
    ).toBe(2);
    expect(
      (
        await client.query(
          'SELECT count(*)::int AS total FROM "PriorityHistory"',
        )
      ).rows[0].total,
    ).toBe(0);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
