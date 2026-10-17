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
  await page
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Patient getting started" }),
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
  await page.getByRole("button", { name: "Start patient guide" }).click();
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
  await expect(
    page.getByRole("button", { name: "Start patient guide" }),
  ).toBeFocused();
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

test("fictional PPO/HMO calendar filters and costs persist per identity without changing the saved plan", async ({
  page,
}) => {
  await enterPatient(page);
  const matching = page.locator(".cal-pop li button[data-slot-id]:not(.dim)");
  await page
    .getByLabel("Insurance", { exact: true })
    .selectOption("Blue Horizon");
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Cardiology");
  await page.getByLabel("Plan type", { exact: true }).selectOption("HMO");
  await page.getByLabel("Show only in-network demo scenarios").check();
  await expect(
    page.getByText("No openings match these filters.", { exact: false }),
  ).toBeVisible();
  await expect(matching).toHaveCount(0);
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Dermatology");
  await page.getByLabel("Location", { exact: true }).selectOption("Berkeley");
  await expect(matching).toHaveCount(0);
  // HMO has no fictional network access at the Berkeley clinic.
  await page.getByLabel("Location", { exact: true }).selectOption("");
  await page.getByLabel("Maximum estimated patient cost ($)").fill("29");
  await expect(matching).toHaveCount(0);
  await page.getByLabel("Maximum estimated patient cost ($)").fill("30");
  await expect.poll(() => matching.count()).toBeGreaterThan(0);
  const snapshot = await state(page);
  const ids = await matching.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-slot-id")),
  );
  for (const id of ids) {
    const slot = snapshot.slots.find((s: { id: string }) => s.id === id);
    expect(["cedar", "harbor"]).toContain(slot.clinicId);
    expect(slot.service).toBe("Dermatology");
  }
  const selected = matching.first();
  await selected
    .locator("xpath=ancestor::div[contains(@class,'cal-clinic')]")
    .getByRole("button")
    .first()
    .click();
  await selected.click();
  const details = page.getByRole("dialog", { name: "Appointment details" });
  await expect(details.locator(".coverage-summary")).toContainText("$30");
  await expect(details).toContainText("Not a quote or guarantee");
  await expect(details).toContainText(
    "Booking uses your saved persona plan, Blue Horizon",
  );
  await details.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await expect(page.getByLabel("Plan type", { exact: true })).toHaveValue(
    "HMO",
  );
  await expect(
    page.getByLabel("Maximum estimated patient cost ($)"),
  ).toHaveValue("30");
  await page.getByLabel("Switch demo persona").selectOption("patient-1");
  await page
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await expect(page.getByLabel("Insurance", { exact: true })).toHaveValue("");
  await page.getByLabel("Switch demo persona").selectOption("avery");
  await page
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await expect(page.getByLabel("Plan type", { exact: true })).toHaveValue(
    "HMO",
  );
  await page
    .getByLabel("Insurance", { exact: true })
    .selectOption("Aster Health");
  expect((await state(page)).user.plan).toBe("Blue Horizon");
  expect(
    (await state(page)).bookings.find(
      (b: { id: string }) => b.id === "avery-original",
    ).status,
  ).toBe("CONFIRMED");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Plan type", { exact: true })).toHaveValue(
    "PPO",
  );
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
