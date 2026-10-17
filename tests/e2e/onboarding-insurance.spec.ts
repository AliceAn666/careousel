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
async function enterPatient(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Quick tour", exact: true }),
  ).toBeEnabled();

  await expect(
    page.getByRole("region", { name: "Appointment search" }),
  ).toBeVisible();
}
const state = async (page: Page) =>
  (await page.request.get("/api/state")).json();

test("patient guide follows current screens, resumes after refresh, and never changes bookings", async ({
  page,
}) => {
  await enterPatient(page);
  const before = await state(page);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "careousel_session",
  )?.value;
  await page.getByRole("button", { name: "Quick tour" }).click();
  const guide = page.getByRole("dialog", { name: "Careousel quick tour" });
  await expect(guide.getByRole("heading")).toHaveText("Find care that fits");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText(
    "Understand your demo benefits",
  );
  await guide.getByRole("button", { name: "Back", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText("Find care that fits");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(guide).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Quick tour" })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText(
    "Understand your demo benefits",
  );
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/appointments$/);
  await expect(guide).toContainText("Existing appointment to replace");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/notifications$/);
  await guide.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(guide).not.toBeVisible();
  const after = await state(page);
  expect(
    after.bookings.map((b: { id: string; status: string }) => [b.id, b.status]),
  ).toEqual(
    before.bookings.map((b: { id: string; status: string }) => [
      b.id,
      b.status,
    ]),
  );
  expect(after.waitlists).toEqual(before.waitlists);
  expect(
    after.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  expect(
    (await page.context().cookies()).find((c) => c.name === "careousel_session")
      ?.value,
  ).toBe(cookie);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText("Find care that fits");
  const box = await guide.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await guide.getByRole("button", { name: "Close guide" }).click();
});

test("all clinics remain visible and out-of-network booking requires explicit self-pay", async ({
  page,
}) => {
  await enterPatient(page);
  const matching = page.locator(".appointment-results .search-result");
  const insurer = page.getByLabel("Insurance company (demo)");
  await expect(insurer).toHaveValue("Blue Horizon");
  await page.getByLabel("Specialty", { exact: true }).selectOption("Cardiology");
  await page.getByLabel("Insurance plan type").selectOption("HMO");
  await expect(matching).toHaveCount(4);
  await expect(page.locator(".insurance-match-warning")).toHaveCount(4);
  await page.getByLabel("Location", { exact: true }).selectOption("Berkeley");
  await expect(matching).toHaveCount(1);
  await expect(page.locator(".insurance-match-warning")).toContainText(
    "Does not accept Blue Horizon HMO",
  );
  await page.getByLabel("Location", { exact: true }).selectOption("");
  const selected = matching.first().locator(".clinic-time-choice").first();
  await selected.click();
  const details = page.getByRole("dialog", { name: "Appointment details" });
  await expect(details.getByLabel("Insurance company for appointment"))
    .toHaveValue("Blue Horizon");
  await expect(details.locator(".insurance-booking-warning")).toContainText(
    "full listed price",
  );
  await expect(details.locator(".coverage-summary")).toContainText(
    "Not available",
  );
  await details
    .getByRole("button", { name: /Confirm self-pay appointment/ })
    .click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole("status")).toContainText(
    "self-pay acknowledgment",
  );
  const afterBooking = await state(page);
  expect(afterBooking.user.plan).toBe("Blue Horizon");
  await page.getByRole("button", { name: "Book an Appointment" }).click();
  await expect(page.getByLabel("Insurance plan type")).toHaveValue("HMO");
  await expect(insurer).toHaveValue("Blue Horizon");
  await insurer.selectOption("Aster Health");
  expect((await state(page)).user.plan).toBe("Blue Horizon");
  await page.goto("/search");
  await page.reload();
  await expect(insurer).toHaveValue("Aster Health");
  await page.getByLabel("Switch demo persona").selectOption("patient-1");
  await expect(page.getByLabel("Insurance company (demo)")).toHaveValue(
    "Aster Health",
  );
  await page.getByLabel("Switch demo persona").selectOption("avery");
  await expect(page.getByLabel("Insurance company (demo)")).toHaveValue(
    "Aster Health",
  );
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Insurance plan type")).toHaveValue("PPO");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("clinic guide uses current priority navigation and keeps clinic session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open clinic demo" }).click();
  await expect(page).toHaveURL(/clinic\/schedule$/);
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Careousel quick tour" });
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/clinic\/waitlists$/);
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/clinic\/priorities$/);
  await guide.getByRole("button", { name: "Finish", exact: true }).click();
  expect((await state(page)).user.clinicId).toBe("cedar");
  await page.reload();
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await page.getByRole("button", { name: "For Clinics", exact: true }).click();
  expect((await state(page)).user.clinicId).toBe("cedar");
});
