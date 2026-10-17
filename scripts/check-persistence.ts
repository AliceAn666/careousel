import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== "/careousel_test" ||
  url === process.env.DATABASE_URL
)
  throw new Error(
    "Persistence rehearsal requires the isolated careousel_test database.",
  );
const base = "http://127.0.0.1:3200";
let server: ChildProcess | undefined;
async function start() {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--port",
      "3200",
      "--hostname",
      "127.0.0.1",
    ],
    {
      stdio: "ignore",
      env: {
        ...process.env,
        DATABASE_URL: url!,
        DEMO_MODE: "true",
        SESSION_SECRET: "persistence-test-only-secret-at-least-32-characters",
      },
    },
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(base + "/api/state")).ok) return;
    } catch {}
    if (server.exitCode !== null)
      throw new Error("Production server exited before readiness.");
    await pause(250);
  }
  throw new Error("Production server did not become ready.");
}
async function stop() {
  const p = server;
  if (!p || p.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    p.once("exit", () => resolve());
    p.kill("SIGTERM");
  });
  server = undefined;
}
async function post(path: string, data: unknown, cookie = "") {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: base, cookie },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r;
}
try {
  await start();
  const staffCookie = (
    await post("/api/session", { id: "staff-cedar" })
  ).headers
    .get("set-cookie")!
    .split(";")[0];
  await post(
    "/api/actions",
    { type: "reset", confirmation: "RESET" },
    staffCookie,
  );
  const patientCookie = (await post("/api/session", { id: "avery" })).headers
    .get("set-cookie")!
    .split(";")[0];
  await post(
    "/api/actions",
    {
      type: "intake",
      symptoms: [
        { area: "skin", pain: 4, duration: "month", worsening: false },
      ],
      warningSigns: [],
    },
    patientCookie,
  );
  await post("/api/actions", { type: "book", slotId: "slot-0" }, patientCookie);
  // Build the own-clinic candidate projection just as the staff UI does.
  const preview = await fetch(base + "/api/state", {
    headers: { cookie: staffCookie },
  });
  if (!preview.ok) throw new Error("Staff priority preview failed.");
  await post(
    "/api/actions",
    {
      type: "setWaitlistPriority",
      waitlistId: "wait-2",
      clinicId: "cedar",
      level: "P2",
      expectedVersion: 0,
      reason: "Synthetic persistence rehearsal review",
    },
    staffCookie,
  );
  await stop();
  await start();
  const state = await (
    await fetch(base + "/api/state", { headers: { cookie: patientCookie } })
  ).json();
  if (
    !state.bookings.some(
      (b: { slotId: string; status: string }) =>
        b.slotId === "slot-0" && b.status === "CONFIRMED",
    )
  )
    throw new Error("Booking did not survive server restart.");
  const staffState = await (
    await fetch(base + "/api/state", { headers: { cookie: staffCookie } })
  ).json();
  const priority = staffState.priorityRequests.find(
    (request: { id: string }) => request.id === "wait-2",
  )?.priorities[0];
  if (
    priority?.level !== "P2" ||
    priority.assignedById !== "staff-cedar" ||
    priority.history.length !== 1
  )
    throw new Error(
      "Staff request priority/history did not survive server restart.",
    );
  console.log(
    "PASS: confirmed booking, signed patient/staff sessions and request priority/history survived a production-server restart against PostgreSQL.",
  );
} finally {
  await stop();
}
