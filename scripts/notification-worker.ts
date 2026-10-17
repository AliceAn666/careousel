import "dotenv/config";
import { setTimeout as pause } from "node:timers/promises";
import { processNotificationSequences } from "../src/server/services/notification-sequences";
import { db } from "../src/server/db";
// Run under a process supervisor, or use --once from cron. No public HTTP worker.
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
try {
  do {
    try {
      console.log("Notification worker:", await processNotificationSequences());
    } catch (error) {
      console.error(
        "Notification worker failed; durable work will retry:",
        error instanceof Error ? error.name : "UnknownError",
      );
      if (process.argv.includes("--once")) throw error;
    }
    if (process.argv.includes("--once") || stopping) break;
    await pause(15_000);
  } while (!stopping);
} finally {
  await db.$disconnect();
}
