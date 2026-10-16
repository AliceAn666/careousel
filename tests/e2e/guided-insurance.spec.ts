import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  await request.post("/api/session", {
    data: { id: "staff-cedar" },
    headers: { origin: "http://localhost:3100" },
  });
  const response = await request.post("/api/actions", {
    data: { type: "reset", confirmation: "RESET" },
    headers: { origin: "http://localhost:3100" },
  });
  expect(response.ok()).toBe(true);
});
test("patient tour navigates features, closes with Escape and can be replayed on mobile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Avery" }).click();
  const launch = page.getByRole("button", { name: "Quick tour", exact: true });
  await launch.click();
  const tour = page.getByRole("dialog", { name: "Careousel quick tour" });
  await expect(tour.getByRole("heading")).toHaveText("Find care that fits");
  await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour.getByRole("heading")).toHaveText(
    "Understand your demo benefits",
  );
  await tour.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tour.getByRole("heading")).toHaveText("Find care that fits");
  await page.keyboard.press("Escape");
  await expect(tour).not.toBeVisible();
  await expect(launch).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await launch.click();
  for (let i = 0; i < 4; i++)
    await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/notifications$/);
  const bubble = await tour.locator(".tour-bubble").boundingBox();
  expect(bubble).not.toBeNull();
  expect(bubble!.x).toBeGreaterThanOrEqual(0);
  expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(375);
  await tour.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(tour).not.toBeVisible();
});
test("fictional plan benefits distinguish coverage, exclusions and booking identity", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Avery" }).click();
  await page
    .getByRole("combobox", { name: "Insurance", exact: true })
    .selectOption("Blue Horizon");
  await page
    .getByRole("combobox", { name: "Specialty", exact: true })
    .selectOption("Cardiology");
  await expect(
    page.locator(".appointment-card").first().locator(".coverage-summary"),
  ).toContainText("In-network · demo");
  await page.getByRole("combobox", { name: "Plan type" }).selectOption("HMO");
  await expect(
    page
      .locator(".coverage-summary")
      .filter({ hasText: "Service not covered" })
      .first(),
  ).toBeVisible();
  await page.getByLabel("Only show covered demo scenarios").check();
  await expect(page.getByText("No openings match just yet")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("combobox", { name: "Insurance", exact: true })
    .selectOption("Blue Horizon");
  await page
    .locator(".appointment-card")
    .first()
    .getByRole("button", { name: "View & book" })
    .click();
  const detail = page.getByRole("dialog", { name: "Appointment details" });
  await expect(detail).toContainText("Fictional PPO");
  await expect(detail).toContainText("Booking uses your saved persona plan");
});
test("staff tour describes approval and activity without performing mutations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cedar Health workspace" }).click();
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  const tour = page.getByRole("dialog", { name: "Careousel quick tour" });
  await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour).toContainText("Review before sending");
  await expect(page).toHaveURL(/clinic\/waitlists$/);
  await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour).toContainText("Follow the result");
  await tour.getByRole("button", { name: "Finish", exact: true }).click();
});
