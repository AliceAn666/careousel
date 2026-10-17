import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test.beforeEach(async ({ page }) => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/careousel_test")
    throw new Error("Isolated database required");
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { notificationScenario } =
    await import("../helpers/notification-scenario");
  await notificationScenario(new Date());
  await page.request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
});
test("three clinic sections preserve opening, request, human review and notification draft without navigation sends", async ({
  page,
}) => {
  await page.goto("/clinic/schedule");
  const nav = page.getByRole("navigation", { name: "Clinic navigation" });
  await expect(nav.getByRole("button")).toHaveText([
    "Schedule",
    "Waitlist Management",
    "Clinical Records",
  ]);
  const row = page.locator('tr[data-slot-id="earlier"]');
  await row
    .getByRole("button", { name: "Review Waitlist Matches", exact: true })
    .click();
  await expect(page.getByLabel("Selected opening")).toHaveValue("earlier");
  await expect(
    nav.getByRole("button", { name: "Waitlist Management" }),
  ).toHaveAttribute("aria-current", "page");
  // A previous group filter must not hide an explicitly focused candidate.
  await page
    .getByRole("link", { name: "Priority Review", exact: true })
    .click();
  await page
    .getByLabel("Show priority group", { exact: true })
    .selectOption("P4");
  await page
    .getByRole("region", { name: "Priority Review", exact: true })
    .getByRole("link", { name: "Back to Matches" })
    .click();
  const avery = page.getByRole("article", {
    name: "Avery Morgan matching request",
  });
  await avery.getByRole("link", { name: "Review Priority" }).click();
  await expect(page).toHaveURL(
    /slotId=earlier&requestId=phase7-w1&tab=priorities/,
  );
  const review = page.getByRole("region", {
    name: "Priority Review",
    exact: true,
  });
  await expect(review.getByRole("article")).toHaveCount(1);
  await review
    .getByLabel("Request priority", { exact: true })
    .selectOption("P2");
  await review
    .getByLabel("Assignment reason")
    .fill("Reviewed synthetic follow-up evidence");
  await review
    .getByRole("button", { name: "Approve request priority" })
    .click();
  await expect(
    review
      .getByRole("article")
      .locator("p")
      .filter({ hasText: "P2 — High Priority" }),
  ).toBeVisible();
  await review.getByRole("link", { name: "Back to Matches" }).click();
  await expect(avery).toContainText("P2 — High Priority");
  await expect(avery).toHaveAttribute("data-selected", "true");
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  const manager = page.getByRole("region", {
    name: "Automatic group notifications",
  });
  await expect(
    manager.getByText("P1 — Time-Sensitive", { exact: true }),
  ).toBeVisible();
  await manager.getByRole("checkbox", { name: /Avery Morgan/ }).check();
  await manager
    .getByLabel("Authorization reason")
    .fill("Draft only, not authorized");
  await page.getByRole("link", { name: "Matches", exact: true }).click();
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(
    manager.getByRole("checkbox", { name: /Avery Morgan/ }),
  ).toBeChecked();
  await expect(manager.getByLabel("Authorization reason")).toHaveValue(
    "Draft only, not authorized",
  );
  await page.reload();
  await expect(page.getByLabel("Selected opening")).toHaveValue("earlier");
  const state = await (await page.request.get("/api/state")).json();
  expect(state.sequences).toHaveLength(0);
  expect(state.offers).toHaveLength(0);
  // The original belongs to Harbor and must not be exposed to Cedar staff.
  expect(
    state.bookings.some((b: { id: string }) => b.id === "avery-original"),
  ).toBe(false);
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  const patientState = await (await page.request.get("/api/state")).json();
  expect(
    patientState.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
});
test("legacy routes and clinical permission-aware tabs work at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  for (const [path, active] of [
    [
      "/clinic/priorities?slotId=earlier&requestId=phase7-w1",
      "Waitlist Management",
    ],
    [
      "/clinic/waitlists?slotId=earlier&tab=notifications",
      "Waitlist Management",
    ],
    ["/clinic/medical-records", "Clinical Records"],
    ["/clinic/medical-tags", "Clinical Records"],
    ["/clinic/records", "Clinical Records"],
    ["/clinic/schedule", "Schedule"],
  ]) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Clinic navigation" });
    await expect(
      nav.getByRole("button", { name: active, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    if (active === "Clinical Records") {
      await expect(
        page.getByRole("link", { name: "Record Review", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Medical Tags", exact: true }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await page.goto("/clinic/activity");
  await page
    .getByRole("navigation", { name: "Clinic navigation" })
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await expect(page).toHaveURL(/clinic\/schedule$/);
  await page.request.post("/api/session", {
    headers,
    data: { id: "staff-harbor", demo: true },
  });
  await page.goto("/clinic/medical-records");
  await expect(
    page.getByRole("alert").filter({
      hasText: /explicit clinical author permission|outside your clinic access/,
    }),
  ).toContainText("explicit clinical author permission");
  await expect(
    page.getByRole("link", { name: "Record Review", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/medical-records")).status()).toBe(403);
  await page.getByRole("link", { name: "Medical Tags", exact: true }).click();
  await expect(
    page.getByText("Private clinical notes and drafts are hidden.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create medical tag", exact: true }),
  ).toHaveCount(0);
  await page.goto("/clinic/waitlists?slotId=earlier&tab=notifications");
  await expect(
    page.getByRole("alert").filter({
      hasText: /explicit clinical author permission|outside your clinic access/,
    }),
  ).toContainText("outside your clinic access");
  await expect(
    page.getByRole("region", { name: "Automatic group notifications" }),
  ).toHaveCount(0);
});
test("switching openings clears notification draft and browser Back restores the prior opening", async ({
  page,
}) => {
  await page.goto("/clinic/waitlists?slotId=earlier&tab=notifications");
  const manager = page.getByRole("region", {
    name: "Automatic group notifications",
  });
  await expect(
    manager.getByRole("checkbox", { name: /Avery Morgan/ }),
  ).toBeVisible();
  await manager.getByRole("checkbox", { name: /Avery Morgan/ }).check();
  await manager
    .getByLabel("Authorization reason")
    .fill("Must not carry into another slot");
  const otherId = await page
    .getByLabel("Selected opening")
    .locator('option:not([value="earlier"])')
    .first()
    .getAttribute("value");
  expect(otherId).toBeTruthy();
  await page.getByLabel("Selected opening").selectOption(otherId!);
  await expect(page).toHaveURL(new RegExp(`slotId=${otherId}`));
  await expect(manager.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel("Selected opening")).toHaveValue("earlier");
  await expect(manager.getByLabel("Authorization reason")).toHaveValue("");
  await expect(manager.getByRole("checkbox", { checked: true })).toHaveCount(0);
});
