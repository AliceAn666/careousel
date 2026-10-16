import "dotenv/config";
import { maintainNotifications } from "../src/server/services/scheduling";
import { db } from "../src/server/db";
import { setTimeout } from "node:timers/promises";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
while (!stopping) {
  try {
    await maintainNotifications();
  } catch {
    console.error("Notification maintenance failed; retrying in 5 seconds.");
  }
  await setTimeout(5000);
}
await db.$disconnect();
