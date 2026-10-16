import { spawn } from "node:child_process";
const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") throw new Error("Choose dev or start");
const worker = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/notification-worker.ts"],
  { stdio: "inherit" },
);
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    mode,
    "--hostname",
    "0.0.0.0",
    ...process.argv.slice(3),
  ],
  { stdio: "inherit" },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  app.kill("SIGTERM");
  worker.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
app.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 0;
});
worker.on("exit", (code) => {
  if (!stopping) {
    console.error("Notification worker exited unexpectedly.");
    stop();
    process.exitCode = code || 1;
  }
});
