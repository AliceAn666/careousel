import "dotenv/config";
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(728194)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS careousel_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("prisma/migrations")).sort()) {
    const sql = await readFile(
      `prisma/migrations/${name}/migration.sql`,
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum FROM careousel_migrations WHERE name=$1",
      [name],
    );
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum)
        throw new Error(
          `Applied migration ${name} was changed. Add a new migration instead.`,
        );
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO careousel_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    console.log(`Applied ${name}`);
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
