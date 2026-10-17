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
  await post(
    "/api/actions",
    { type: "book", slotId: "demo-open-cedar-3-0-0" },
    patientCookie,
  );
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
  // New records are synthetic and confined to the isolated URL guarded above.
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { db: medicalDb } = await import("../src/server/db");
  const { mutateMedicalTag, medicalTagsDashboard } =
    await import("../src/server/services/medical-tags");
  await medicalDb.slot.create({
    data: {
      id: "persistence-medical-slot",
      clinicId: "cedar",
      service: "Dermatology",
      provider: "Synthetic clinician",
      start: new Date(Date.now() - 86400000),
      end: new Date(Date.now() - 84000000),
      price: 10000,
      plans: ["Blue Horizon"],
      status: "BOOKED",
    },
  });
  await medicalDb.booking.create({
    data: {
      id: "persistence-medical-visit",
      patientId: "avery",
      slotId: "persistence-medical-slot",
    },
  });
  const medical = await mutateMedicalTag("staff-cedar", {
    type: "create",
    sourceBookingId: "persistence-medical-visit",
    needTitle: "Persistent follow-up",
    kind: "FOLLOW_UP",
    label: "Persistent clinical tag",
    clinicalNotes: "Synthetic private persistence note",
    followUpRecommendation: "Arrange synthetic follow-up",
    recommendedFrom: null,
    recommendedBy: null,
    requiresReferral: false,
    requiresAuthorization: false,
    reason: "Synthetic persistence rehearsal",
  });
  await mutateMedicalTag("staff-cedar", {
    type: "approve",
    tagId: medical.tagId,
    expectedVersion: 1,
    reason: "Synthetic clinician reviewed",
  });
  const { mutateMedicalRecords } =
    await import("../src/server/services/medical-records");
  const recordPatient = await medicalDb.account.findUniqueOrThrow({
    where: { username: "persistence.patient" },
  });
  const recordImport = await mutateMedicalRecords(recordPatient.userId, {
    type: "authorizeImport",
    clinicId: "cedar",
    source: "CAREOUSEL_SYNTHETIC_FHIR_V1",
    consent: true,
    consentVersion: "SYNTHETIC_V1",
    requestId: crypto.randomUUID(),
  });
  await mutateMedicalRecords(recordPatient.userId, {
    type: "extract",
    importId: recordImport.importId,
    mode: "LOCAL_RULES",
  });
  const proposed = await medicalDb.importedTagSuggestion.findFirstOrThrow({
    where: { importId: recordImport.importId },
  });
  const reviewedRecord = await mutateMedicalRecords("staff-cedar", {
    type: "review",
    suggestionId: proposed.id,
    expectedVersion: proposed.version,
    decision: "APPROVE",
    fields: proposed.fields,
    reason: "Persistent synthetic source reviewed",
  });
  const sourceBefore = JSON.stringify(
    await medicalDb.importedMedicalRecord.findMany({
      where: { importId: recordImport.importId },
      orderBy: { resourceId: "asc" },
    }),
  );
  const suggestionsBefore = JSON.stringify(
    await medicalDb.importedTagSuggestion.findMany({
      where: { importId: recordImport.importId },
      orderBy: { createdAt: "asc" },
    }),
  );
  const medicalBefore = JSON.stringify(
    (await medicalTagsDashboard("staff-cedar")).tags,
  );
  // Two independent external reports and one secured replacement survive a real process restart.
  const needsNow = new Date();
  for (const [index, title] of [
    "Persistent need A",
    "Persistent need B",
  ].entries()) {
    const start = new Date(+needsNow + (25 + index) * 86400000);
    await post(
      "/api/patient-needs",
      {
        type: "createNeed",
        title,
        service: "Vaccination",
        preferences: {
          plan: "Blue Horizon",
          city: "",
          clinicIds: [],
          maxPrice: 30000,
          earliest: needsNow,
          latest: new Date(+needsNow + 90 * 86400000),
          startHour: 0,
          endHour: 24,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
        requiresReferral: false,
        requiresAuthorization: false,
        tagIds: [],
        original: {
          type: "EXTERNAL",
          appointment: {
            clinicName: "Synthetic outside clinic",
            start,
            end: new Date(+start + 1800000),
            location: "Synthetic location",
            reference: `PERSIST-${index}`,
            reportedConfirmed: true,
          },
        },
      },
      accountCookie,
    );
  }
  const ownNeeds = await medicalDb.patientNeed.findMany({
    where: { patientId: recordPatient.userId },
    orderBy: { title: "asc" },
  });
  await medicalDb.slot.create({
    data: {
      id: "persistent-need-slot",
      clinicId: "cedar",
      service: "Vaccination",
      provider: "Synthetic",
      start: new Date(+needsNow + 7 * 86400000),
      end: new Date(+needsNow + 7 * 86400000 + 1800000),
      price: 1000,
      plans: ["Blue Horizon"],
      status: "AVAILABLE",
    },
  });
  await post(
    "/api/actions",
    {
      type: "book",
      slotId: "persistent-need-slot",
      needId: ownNeeds[0].id,
      expectedNeedVersion: ownNeeds[0].version,
    },
    accountCookie,
  );
  await post(
    "/api/patient-needs",
    {
      type: "requestNeed",
      needId: ownNeeds[1].id,
      expectedVersion: ownNeeds[1].version,
    },
    accountCookie,
  );
  const needsBefore = await (
    await fetch(base + "/api/patient-needs", {
      headers: { cookie: accountCookie },
    })
  ).json();
  await stop();
  await start();
  const needsAfter = await (
    await fetch(base + "/api/patient-needs", {
      headers: { cookie: accountCookie },
    })
  ).json();
  if (
    JSON.stringify(needsAfter.needs) !== JSON.stringify(needsBefore.needs) ||
    needsAfter.needs.length !== 2 ||
    !needsAfter.needs.some((n: { state: string }) => n.state === "SECURED") ||
    !needsAfter.needs.some((n: { waitlists: { status: string }[] }) =>
      n.waitlists.some((w) => w.status === "ACTIVE"),
    )
  )
    throw new Error(
      "Independent needs, external reports, linked booking, waitlist or immutable history failed restart.",
    );
  console.log(
    "Independent needs, unverified external appointments and scoped replacement persisted across production restart.",
  );
  const medicalAfter = await (
    await fetch(base + "/api/medical-tags", {
      headers: { cookie: staffCookie },
    })
  ).json();
  if (JSON.stringify(medicalAfter.tags) !== medicalBefore)
    throw new Error(
      "Medical tags, needs or revision history did not survive production restart.",
    );
  const patientMedical = await (
    await fetch(base + "/api/medical-tags", {
      headers: { cookie: patientCookie },
    })
  ).json();
  if (
    !patientMedical.tags.some(
      (tag: { id: string; state: string }) =>
        tag.id === medical.tagId && tag.state === "APPROVED",
    )
  )
    throw new Error(
      "Patient approved clinical information did not survive restart.",
    );
  const persistedRecords = await (
    await fetch(base + "/api/medical-records", {
      headers: { cookie: accountCookie },
    })
  ).json();
  if (
    persistedRecords.imports[0]?.state !== "ACTIVE" ||
    JSON.stringify(persistedRecords.records) !== sourceBefore ||
    JSON.stringify(persistedRecords.suggestions) !== suggestionsBefore ||
    !persistedRecords.audits.some(
      (a: { action: string }) => a.action === "APPROVE",
    )
  )
    throw new Error(
      "Record consent, FHIR sources, suggestions or clinician review failed production restart.",
    );
  await post(
    "/api/medical-records",
    { type: "revoke", importId: recordImport.importId, expectedVersion: 1 },
    accountCookie,
  );
  await stop();
  await start();
  const archived = await (
    await fetch(base + "/api/medical-records", {
      headers: { cookie: accountCookie },
    })
  ).json();
  const revokedClinic = await (
    await fetch(base + "/api/medical-records", {
      headers: { cookie: staffCookie },
    })
  ).json();
  const revokedTags = await (
    await fetch(base + "/api/medical-tags", {
      headers: { cookie: staffCookie },
    })
  ).json();
  if (
    archived.imports[0]?.state !== "REVOKED" ||
    archived.records.length !== 4 ||
    !archived.audits.some((a: { action: string }) => a.action === "REVOKE") ||
    revokedClinic.records.length ||
    revokedTags.tags.some(
      (tag: { id: string }) => tag.id === reviewedRecord.tagId,
    )
  )
    throw new Error(
      "Record revocation or clinic isolation did not survive restart.",
    );
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
        b.slotId === "demo-open-cedar-3-0-0" && b.status === "CONFIRMED",
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
    "PASS: synthetic record consent/FHIR archive/review/revocation, medical tags/needs/revision history, booking, account/demo sessions, request priority/history and authorized automatic sequence survived production restart; independent restarted worker sent overdue P2 with no browser/web server running.",
  );
} finally {
  await stop();
}
