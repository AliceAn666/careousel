import "dotenv/config";
import { db } from "../src/server/db";
import { locked } from "../src/server/services/scheduling";
import { addExpandedServices } from "../prisma/expanded-services";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.DEMO_MODE !== "true" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/careousel"
)
  throw new Error(
    "Only the local synthetic demo database may receive these fixtures.",
  );
try {
  await locked((tx) => addExpandedServices(tx));
  console.log(
    "Expanded synthetic service slots added; existing data preserved.",
  );
} finally {
  await db.$disconnect();
}
