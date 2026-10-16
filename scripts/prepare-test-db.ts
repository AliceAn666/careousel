import "dotenv/config";
import { Pool } from "pg";
import { spawnSync } from "node:child_process";
const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  new URL(testUrl).pathname !== "/careousel_test" ||
  testUrl === process.env.DATABASE_URL
)
  throw new Error(
    "Set a separate TEST_DATABASE_URL ending in /careousel_test.",
  );
const admin = new URL(testUrl);
admin.pathname = "/postgres";
const pool = new Pool({ connectionString: admin.toString() });
try {
  await pool.query("CREATE DATABASE careousel_test");
} catch (e) {
  if (!(e && typeof e === "object" && "code" in e && e.code === "42P04"))
    throw e;
} finally {
  await pool.end();
}
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/migrate.ts"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: testUrl } },
);
process.exitCode = result.status ?? 1;
