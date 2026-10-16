#!/bin/bash
set -euo pipefail
stage="checking prerequisites"
trap 'printf "\nSetup stopped while %s (line %s). Copy the error above for troubleshooting.\n" "$stage" "$LINENO" >&2' ERR
export NPM_CONFIG_CACHE="${TMPDIR:-/tmp}/careousel-npm-cache"
export NEXT_TELEMETRY_DISABLED=1
cd "$(dirname "${BASH_SOURCE[0]}")/.."
printf '[1/6] Checking Node.js and Docker...\n'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12))throw new Error("Node 22.12+ required")'
if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is missing. This setup requires a Codespace with Docker and Compose.\n' >&2
  exit 1
fi
docker info --format '{{.ServerVersion}}' >/dev/null
docker compose version >/dev/null
node scripts/check-dev-server.mjs
stage="installing dependencies"
printf '[2/6] Installing locked dependencies; this may take a few minutes...\n'
npm ci --ignore-scripts
stage="generating the database client"
printf '[3/6] Generating the database client and local configuration...\n'
node --input-type=module <<'JS'
import fs from "node:fs";
import crypto from "node:crypto";
if (!fs.existsSync(".env")) {
  const text = fs.readFileSync(".env.example", "utf8").replace("replace-with-at-least-32-random-characters", crypto.randomBytes(48).toString("hex"));
  fs.writeFileSync(".env", text, {mode: 0o600});
}
JS
npm run db:generate
stage="starting PostgreSQL"
printf '[4/6] Starting PostgreSQL...\n'
docker compose up -d --wait --wait-timeout 120 db
stage="preparing the database"
printf '[5/6] Applying migrations and preparing synthetic data...\n'
npm run db:migrate
# Initialize only an empty demo database. Never reset existing data.
node --input-type=module <<'JS'
import "dotenv/config";
import pg from "pg";
import {spawnSync} from "node:child_process";
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/careousel" || process.env.DEMO_MODE !== "true") throw new Error("Automatic initialization is limited to the local synthetic careousel demo.");
const pool = new pg.Pool({connectionString: url.toString()});
try {
  const {rows} = await pool.query('SELECT count(*)::int AS count FROM "User"');
  if (rows[0].count === 0) {
    const r = spawnSync("npm", ["run", "db:seed"], {stdio:"inherit",env:{...process.env,SEED_CONFIRM:"RESET_SYNTHETIC_DATA"}});
    if (r.status !== 0) throw new Error("Demo initialization failed");
  }
} finally { await pool.end(); }
JS
node --import tsx scripts/add-expanded-services.ts
stage="preparing the separate test database"
printf '[6/6] Preparing the separate test database...\n'
npm run db:test:prepare
printf "Demo setup complete. Start the website with: npm run dev\n"
