import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test("staff authorizes once, worker advances P2 without browser activity, patient wins and sequence stops", async ({
  page,
  browser,
}, testInfo) => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/careousel_test")
    throw new Error("Isolated database required.");
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { notificationScenario } =
    await import("../helpers/notification-scenario");
  const { processNotificationSequences, GROUP_INTERVAL_MS } =
    await import("../../src/server/services/notification-sequences");
  const { db } = await import("../../src/server/db");
  const now = new Date();
  await notificationScenario(now);
  await page.request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
  const csrf = await page.request.post("/api/notification-sequences", {
    headers: { origin: "https://foreign.example" },
    data: { operation: "pause", slotId: "earlier" },
  });
  expect(csrf.status()).toBe(403);
  await page.goto("/clinic/waitlists");
  const manager = page.getByRole("region", {
    name: "Automatic group notifications",
  });
  await manager.getByLabel("Manage opening").selectOption("earlier");
  await manager
    .getByRole("button", { name: "Preview groups and exclusions" })
    .click();
  await expect(
    manager.getByText("P1 — Time-Sensitive", { exact: true }),
  ).toBeVisible();
  await expect(
    manager.getByText("P4 — Flexible", { exact: true }),
  ).toBeVisible();
  await manager.getByRole("checkbox", { name: /Avery Morgan/ }).check();
  await manager.getByRole("checkbox", { name: /Sam Rivera/ }).check();
  await manager.getByRole("checkbox", { name: /Taylor Chen/ }).check();
  await manager.getByRole("checkbox", { name: /Casey Brooks/ }).check();
  await manager
    .getByLabel("Authorization reason")
    .fill("Reviewed synthetic multi-clinic groups");
  await manager
    .getByRole("button", { name: "Authorize and start automatic sequence" })
    .click();
  await expect(manager.getByText("Sequence: ACTIVE")).toBeVisible();
  await expect(
    manager.getByRole("heading", { name: "P1 · SENT" }),
  ).toBeVisible();
  const p1 = await db.notificationGroup.findFirstOrThrow({
    where: { level: "P1", status: "SENT" },
  });
  // Controlled isolated test time, never an app endpoint or shortened real interval.
  await processNotificationSequences({
    now: new Date(+p1.sentAt! + GROUP_INTERVAL_MS),
  });
  await page.reload();
  await expect(
    manager.getByRole("heading", { name: "P2 · SENT" }),
  ).toBeVisible();
  const patient = await browser.newContext();
  try {
    await patient.request.post("/api/session", {
      headers,
      data: { id: "avery", demo: true },
    });
    const p = await patient.newPage();
    await p.goto("/notifications");
    await expect(p.getByText(/Competitive invitation:/)).toBeVisible();
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Accept earlier appointment" }).click();
    await expect(p.getByRole("status")).toContainText(
      "Earlier appointment confirmed",
    );
    await page.reload();
    await expect(manager.getByText("Sequence: COMPLETED")).toBeVisible();
    await expect(
      manager.getByRole("heading", { name: "P3 · CANCELLED" }),
    ).toBeVisible();
    expect(
      (
        await db.booking.findUniqueOrThrow({
          where: { id: "phase7-original-1" },
        })
      ).status,
    ).toBe("CONFIRMED");
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("notification-management-mobile.png"),
      fullPage: true,
    });
  } finally {
    await patient.close();
    await db.$disconnect();
  }
});
