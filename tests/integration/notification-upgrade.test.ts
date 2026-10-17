import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { expect, it } from "vitest";
it("upgrades legacy pending exclusive offers without changing rows or history", async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA notifications_upgrade_test");
    await client.query("SET LOCAL search_path TO notifications_upgrade_test");
    const migrations = (await readdir("prisma/migrations")).sort();
    for (const name of migrations.filter((n) => n < "0006"))
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
    await client.query(`INSERT INTO "Clinic" (id,name,city,address,description) VALUES ('c','Synthetic','City','Address','Demo');
   INSERT INTO "User" (id,name,role) VALUES ('p','Patient','PATIENT');
   INSERT INTO "Slot" (id,"clinicId",service,provider,start,"end",price,plans,status) VALUES ('s','c','Dermatology','Synthetic','2030-01-20 17:00','2030-01-20 17:30',10000,ARRAY['Blue Horizon'],'HELD');
   INSERT INTO "Waitlist" (id,"patientId",service,plan,"clinicIds","maxPrice",earliest,latest,weekdays) VALUES ('w','p','Dermatology','Blue Horizon',ARRAY['c'],20000,'2030-01-01','2030-02-01',ARRAY[1]);
   INSERT INTO "Offer" (id,"slotId","waitlistId","patientId",reason,"expiresAt") VALUES ('o','s','w','p','Legacy approved offer','2030-01-20 16:50');
   INSERT INTO "Notification" (id,"patientId","offerId",title,body) VALUES ('n','p','o','Legacy notice','Retained');`);
    const before = (await client.query('SELECT * FROM "Offer"')).rows[0];
    const notice = (await client.query('SELECT * FROM "Notification"')).rows;
    for (const name of migrations.filter((n) => n >= "0006"))
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
    expect((await client.query('SELECT * FROM "Offer"')).rows[0]).toEqual({
      ...before,
      groupId: null,
    });
    expect((await client.query('SELECT * FROM "Notification"')).rows).toEqual(
      notice,
    );
    expect(
      (await client.query('SELECT * FROM "NotificationSequence"')).rows,
    ).toEqual([]);
    await expect(
      client.query(
        `INSERT INTO "Offer" (id,"slotId","waitlistId","patientId",reason,"expiresAt") VALUES ('duplicate','s','w','p','Forbidden','2030-01-20 16:55')`,
      ),
    ).rejects.toThrow();
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
