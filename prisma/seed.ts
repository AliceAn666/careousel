import "dotenv/config";
import { db } from "../src/server/db";
import { seedData } from "./seed-data";
if (process.env.DEMO_MODE !== "true")
  throw new Error("Seeding requires DEMO_MODE=true");
if (process.env.SEED_CONFIRM !== "RESET_SYNTHETIC_DATA")
  throw new Error(
    "Set SEED_CONFIRM=RESET_SYNTHETIC_DATA to explicitly reset demo data",
  );
await db.$transaction(
  async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728194)`;
    await seedData(tx);
  },
  { timeout: 30000 },
);
console.log(
  "Seeded 4 clinics, 16 personas, 56 slots, offer states and matching scenarios.",
);
await db.$disconnect();
