import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test.beforeEach(async ({ request }) => {
  await request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
  const reset = await request.post("/api/actions", {
    headers,
    data: { type: "reset", confirmation: "RESET" },
  });
  expect(reset.ok()).toBe(true);
});
test("patient joins a linked waitlist directly from entry, with no symptoms and original protected", async ({
  page,
}, testInfo) => {
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  await page.goto("/patient");
  for (const name of [
    "Book an Appointment",
    "Find an Earlier Appointment",
    "Manage My Appointments and Waitlists",
  ])
    await expect(
      page
        .locator(".patient-entry-grid")
        .getByRole("button", { name, exact: true }),
    ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Quick tour", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Tell us how you’re feeling")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("patient-entry-mobile.png"),
    fullPage: true,
  });
  await page
    .locator(".patient-entry-grid")
    .getByRole("button", { name: "Find an Earlier Appointment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Register need and join waitlist" })
    .click();
  await page
    .getByLabel("Existing appointment to replace (optional)")
    .selectOption("avery-original");
  await page
    .getByRole("button", { name: "Join waitlist", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Waitlist preferences saved",
  );
  await page
    .locator(".booking-card")
    .filter({ hasText: "Harbor Medical" })
    .getByRole("button", { name: "Find an earlier time" })
    .click();
  await expect(
    page.getByLabel("Existing appointment to replace (optional)"),
  ).toHaveValue("avery-original");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.user.intakeCompleted).toBe(false);
  expect(
    state.waitlists.some(
      (w: { bookingId: string }) => w.bookingId === "avery-original",
    ),
  ).toBe(true);
  expect(
    state.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  await expect(
    page.getByText("Awaiting staff review", { exact: true }),
  ).toBeVisible();
});
test("basic vaccination booking skips symptoms, health-history route stays read-only after refresh", async ({
  page,
  request,
}) => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(20, 45, 0, 0);
  const created = await request.post("/api/actions", {
    headers,
    data: {
      type: "createSlot",
      service: "Vaccination",
      start: start.toISOString(),
      price: 5000,
    },
  });
  expect(created.ok()).toBe(true);
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  await page.goto("/patient");
  await page
    .locator(".patient-entry-grid")
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Vaccination");
  const state = await (await page.request.get("/api/state")).json();
  const slot = state.slots.find(
    (s: { service: string }) => s.service === "Vaccination",
  );
  const opening = page.locator(`button[data-slot-id="${slot.id}"]`);
  await opening.click();
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByRole("status")).toContainText("Appointment confirmed");
  expect(
    (await (await page.request.get("/api/state")).json()).user.intakeCompleted,
  ).toBe(false);
  await page
    .getByRole("link", { name: "View saved health information" })
    .click();
  await expect(page).toHaveURL(/\/health-information$/);
  await expect(
    page.getByRole("heading", {
      name: "Patient-authorized synthetic medical records",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No saved self-report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit questionnaire" }),
  ).toHaveCount(0);
  const after = await (await page.request.get("/api/state")).json();
  expect(after.user.intakeCompleted).toBe(false);
  expect(
    after.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  expect(
    after.bookings.some(
      (b: { slotId: string; status: string }) =>
        b.slotId === slot.id && b.status === "CONFIRMED",
    ),
  ).toBe(true);
});
