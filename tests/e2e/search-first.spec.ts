import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test("clinic-first service grouping, selectable times, and optional waitlist preserve identity and original booking", async ({
  page,
  request,
}) => {
  await request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "reset", confirmation: "RESET" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Medical service or specialty")).toBeVisible();
  await expect(
    page.getByText("Tell us how you’re feeling", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Appointment calendar" }),
  ).toHaveCount(0);
  const state = await (await page.request.get("/api/state")).json();
  expect(state.user.intakeCompleted).toBe(false);
  const cards = page.locator(".search-result");
  await expect.poll(() => cards.count()).toBeGreaterThan(0);
  const ids = await page
    .locator(".appointment-results [data-slot-id]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-slot-id")));
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids)
    expect(state.slots.some((s: { id: string }) => s.id === id)).toBe(true);
  for (const card of await cards.all()) {
    await expect(card.getByRole("heading")).toBeVisible();
    await expect(card.locator(".clinic-time-choice").first()).toBeVisible();
    await expect(
      card.getByRole("button", { name: "View details & book" }),
    ).toHaveCount(0);
  }
  // Every opening is visible and opens confirmation for that exact time.
  const cedarCard = cards
    .filter({ hasText: "Cedar Health" })
    .filter({ hasText: "Cardiology" })
    .first();
  const choices = cedarCard.locator("button[data-slot-id]");
  await expect.poll(() => choices.count()).toBeGreaterThan(3);
  const chosenId = await choices.nth(2).getAttribute("data-slot-id");
  const chosenSlot = state.slots.find((s: { id: string }) => s.id === chosenId);
  await choices.nth(2).click();
  const bookingDialog = page.getByRole("dialog", { name: "Appointment details" });
  await expect(bookingDialog).toContainText(chosenSlot.provider);
  await expect(
    bookingDialog.getByRole("group", { name: "Available appointment times" }),
  ).toHaveCount(0);
  await bookingDialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Medical service or specialty").fill("cardiology");
  await expect.poll(() => cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all())
    await expect(card.locator(".eyebrow")).toHaveText("Cardiology");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Vaccinations", exact: true }).click();
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all())
    await expect(card.locator(".eyebrow")).toHaveText("Vaccination");
  await page
    .getByRole("button", { name: "Join a waitlist", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Specialty", exact: true }),
  ).toHaveValue("Vaccination");
  await dialog
    .getByRole("button", { name: "Join waitlist", exact: true })
    .click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole("status")).toContainText("Waitlist");
  await page.reload();
  const after = await (await page.request.get("/api/state")).json();
  expect(after.user.id).toBe(state.user.id);
  expect(after.user.intakeCompleted).toBe(false);
  expect(
    after.waitlists.some(
      (w: { service: string }) => w.service === "Vaccination",
    ),
  ).toBe(true);
  expect(
    after.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  await page
    .getByRole("button", { name: "Find an Earlier Appointment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/waitlists$/);
  await expect(
    page.getByRole("heading", {
      name: "Find an Earlier Appointment.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".sidebar .nav-item.active")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Create earlier appointment request" })
    .click();
  await page
    .getByLabel("Existing appointment to replace (optional)")
    .selectOption("avery-original");
  await expect(
    page.getByLabel("Existing appointment to replace (optional)"),
  ).toHaveValue("avery-original");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", {
      name: "Manage My Appointments and Waitlists",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/appointments$/);
  await page
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/search-first-mobile.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "work/search-first-desktop.png",
    fullPage: false,
  });
});
