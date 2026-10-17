import { test, expect, type Page } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };

test.beforeEach(async ({ request }) => {
  expect(
    (
      await request.post("/api/session", {
        headers,
        data: { id: "staff-cedar", demo: true },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "reset", confirmation: "RESET" },
      })
    ).ok(),
  ).toBe(true);
});
const findCare = (page: Page) =>
  page.getByRole("button", { name: "Find Care", exact: true }).first();

test("public anchors, both role entrances, immediate patient access and existing-session continuity", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Better care.",
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
    .getByRole("navigation", { name: "Main navigation" })
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
  await page.getByLabel("Switch demo persona").selectOption("staff-harbor");
  await expect(page.getByLabel("Switch demo persona")).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Switch demo persona")).toHaveValue(
    "staff-harbor",
  );
  const staffCookie = (await page.context().cookies()).find(
    (c) => c.name === "careousel_session",
  )?.value;
  expect(staffCookie).toBeTruthy();
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await page.getByRole("button", { name: "For Clinics", exact: true }).click();
  await expect(page).toHaveURL(/\/clinic\/schedule$/);
  await expect(page.getByLabel("Switch demo persona")).toHaveValue(
    "staff-harbor",
  );
  expect(
    (await page.context().cookies()).find((c) => c.name === "careousel_session")
      ?.value,
  ).toBe(staffCookie);
  const staffState = await (await page.request.get("/api/state")).json();
  expect(staffState.user.clinicId).toBe("harbor");
  expect(
    staffState.slots.every(
      (s: { clinicId: string }) => s.clinicId === "harbor",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await findCare(page).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(
    page.getByRole("heading", { name: "Book an appointment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Manage My Appointments and Waitlists",
      exact: true,
    }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await page.getByText("Explore other demo personas", { exact: true }).click();
  await page
    .getByLabel("Demo workspace type", { exact: true })
    .selectOption("PATIENT");
  await expect(
    page.getByLabel("Choose a demo persona").locator("option"),
  ).toHaveCount(3);
  await page.getByLabel("Choose a demo persona").selectOption("patient-1");
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByLabel("Switch demo persona")).toHaveValue("patient-1");
  const patientCookie = (await page.context().cookies()).find(
    (c) => c.name === "careousel_session",
  )?.value;
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await findCare(page).click();
  await expect(page.getByLabel("Switch demo persona")).toHaveValue("patient-1");
  expect(
    (await page.context().cookies()).find((c) => c.name === "careousel_session")
      ?.value,
  ).toBe(patientCookie);
});

test("responsive home, keyboard skip and patient entry with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(findCare(page)).toBeEnabled();
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
  await expect(findCare(page)).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await findCare(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByLabel("Mobile demo persona")).toHaveValue("avery");
});

test("public home remains visible during state outage and retry restores entrances", async ({
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
  await expect(findCare(page)).toBeDisabled();
  await page.unroute("**/api/state");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(findCare(page)).toBeEnabled();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "For Clinics", exact: true }).click();
  await expect(page).toHaveURL(/\/clinic\/schedule$/);
});
