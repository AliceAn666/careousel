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
    await post("/api/session", { id: "staff-cedar", demo: true })
  ).headers
    .get("set-cookie")!
    .split(";")[0];
  await post(
    "/api/actions",
    { type: "reset", confirmation: "RESET" },
    staffCookie,
  );
  const patientCookie = (
    await post("/api/session", { id: "avery", demo: true })
  ).headers
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
  await post("/api/auth/register", {
    username: "persistence.patient",
    email: "persistence@example.test",
    name: "Synthetic Persistence Patient",
    password: "SyntheticPersistence!123",
    plan: "Blue Horizon",
  });
  const accountCookie = (
    await post("/api/auth/login", {
      username: "persistence.patient",
      password: "SyntheticPersistence!123",
      entrance: "PATIENT",
    })
  ).headers
    .get("set-cookie")!
    .split(";")[0];
  await stop();
  await start();
  const accountState = await (
    await fetch(base + "/api/state", { headers: { cookie: accountCookie } })
  ).json();
  if (
    accountState.auth?.mode !== "account" ||
    accountState.auth.username !== "persistence.patient" ||
    accountState.user?.name !== "Synthetic Persistence Patient"
  )
    throw new Error(
      "Individual account session did not survive production restart.",
    );
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
  // Phase 7: seed ONLY the explicitly guarded test database. Authorize a
  // sequence with controlled past time, stop the web server, execute a fresh
  // worker process, then inspect persisted actual sends after another restart.
  await stop();
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { notificationScenario, startScenario } =
    await import("../tests/helpers/notification-scenario");
  const { GROUP_INTERVAL_MS } =
    await import("../src/server/services/notification-sequences");
  const { db } = await import("../src/server/db");
  const simulated = new Date(Date.now() - GROUP_INTERVAL_MS - 1000);
  await notificationScenario(simulated);
  await startScenario(simulated);
  await db.$disconnect();
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/notification-worker.ts", "--once"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url!, DEMO_MODE: "true" },
    },
  );
  const workerCode = await new Promise<number | null>((resolve) =>
    worker.once("exit", resolve),
  );
  if (workerCode !== 0) throw new Error("Restarted worker failed.");
  await start();
  const scheduledState = await (
    await fetch(base + "/api/state", { headers: { cookie: staffCookie } })
  ).json();
  const scheduled = scheduledState.sequences.find(
    (s: { slotId: string }) => s.slotId === "earlier",
  );
  if (
    !scheduled ||
    scheduled.groups.filter((g: { status: string }) => g.status === "SENT")
      .length !== 2 ||
    !scheduled.nextSendAt
  )
    throw new Error(
      "Authorized sequence failed to recover overdue P2 after worker/server restart.",
    );
  await stop();
  console.log(
    "PASS: booking, account/demo sessions, request priority/history and authorized automatic sequence survived production restart; independent restarted worker sent overdue P2 with no browser/web server running.",
  );
} finally {
  await stop();
}
