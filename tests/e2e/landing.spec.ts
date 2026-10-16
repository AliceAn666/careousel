import { test, expect } from "@playwright/test";

// The Playwright configuration restricts this server to its isolated test DB.
test.beforeAll(async ({ request }) => {
  const headers = { origin: "http://localhost:3100" };
  const session = await request.post("/api/session", {
    data: { id: "staff-cedar" },
    headers,
  });
  expect(session.ok()).toBe(true);
  const reset = await request.post("/api/actions", {
    data: { type: "reset", confirmation: "RESET" },
    headers,
  });
  expect(reset.ok()).toBe(true);
});

test("public home, anchors, role entrances and retained sessions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Better care.Sooner.✳",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "How It Works" })
    .click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(
    page.getByRole("heading", { name: "Find the right care" }),
  ).toBeInViewport();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "For Clinics" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open clinic demo" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Open clinic demo" }).click();
  await expect(page).toHaveURL(/\/clinic\/schedule$/);
  await expect(page.getByLabel("Switch demo persona")).toHaveValue(
    "staff-cedar",
  );
  await page.getByRole("link", { name: "Careousel home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Better care.",
  );
  await page.reload();
  await page.getByRole("button", { name: "For Clinics", exact: true }).click();
  await expect(page).toHaveURL(/\/clinic\/schedule$/);
  await page.getByRole("link", { name: "Careousel home" }).click();
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByLabel("Switch demo persona")).toHaveValue("avery");
  await page.getByLabel("Switch demo persona").selectOption("patient-2");
  await expect(page.getByLabel("Switch demo persona")).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Switch demo persona")).toHaveValue("patient-2");
  await page.getByRole("link", { name: "Careousel home" }).click();
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Switch demo persona")).toHaveValue("patient-2");
});

test("mobile/tablet home, keyboard entry and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Find Care", exact: true }).first(),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Get care sooner" }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Find Care", exact: true }).first(),
  ).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search$/);
});

test("homepage survives state failure and offers a working retry", async ({
  page,
}) => {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Demo temporarily unavailable" }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Better care.",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Demo temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Find Care", exact: true }).first(),
  ).toBeDisabled();
  await page.unroute("**/api/state");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(
    page.getByRole("button", { name: "Find Care", exact: true }).first(),
  ).toBeEnabled();
  await page.getByText("Explore other demo personas", { exact: true }).click();
  await page.getByLabel("Choose a demo persona").selectOption("avery");
  await expect(page).toHaveURL(/\/search$/);
});
