import { test, expect } from "@playwright/test";
async function reset(request: import("@playwright/test").APIRequestContext) {
  await request.post("/api/session", {
    data: { id: "staff-cedar" },
    headers: { origin: "http://localhost:3100" },
  });
  const r = await request.post("/api/actions", {
    data: { type: "reset", confirmation: "RESET" },
    headers: { origin: "http://localhost:3100" },
  });
  expect(r.ok(), await r.text()).toBe(true);
}
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("complete patient → cancellation → staff approval → accepted replacement", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await page.getByRole("button", { name: "Find an earlier time" }).click();
  await page
    .getByRole("button", { name: "Join waitlist", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Waitlist preferences saved",
  );
  await page.getByLabel("Switch demo persona").selectOption("staff-cedar");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Jordan Lee" })
    .getByRole("button", { name: "Cancel & release" })
    .click();
  await expect(page.getByRole("status")).toContainText("Appointment cancelled");
  await page
    .getByRole("button", { name: "Waitlist matches", exact: true })
    .click();
  await page.getByRole("button", { name: "Explain recommendations" }).click();
  await expect(page.getByText("Local rules fallback")).toBeVisible();
  page.once("dialog", (d) => d.accept("Reviewed eligibility and scheduling"));
  await page
    .locator("article.candidate")
    .filter({ hasText: "Avery Morgan" })
    .getByRole("button", { name: "Approve & send offer" })
    .click();
  await expect(page.getByRole("status")).toContainText("Invitation sent");
  await page.getByLabel("Switch demo persona").selectOption("avery");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Accept earlier appointment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Earlier appointment confirmed",
  );
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await expect(page).toHaveURL(/\/appointments$/);
  await page.reload();
  await expect(
    page.locator(".booking-card").filter({ hasText: "Cedar Health" }),
  ).toContainText("confirmed");
  await expect(
    page.locator(".booking-card").filter({ hasText: "Harbor Medical" }),
  ).toContainText("rescheduled");
});
test("search filters, detail review, direct booking and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  const appointmentCards = page.locator(".appointment-card");
  await expect(appointmentCards.first()).toBeVisible();
  const defaultCardCount = await appointmentCards.count();
  expect(defaultCardCount).toBeGreaterThan(0);
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Cardiology");
  await page.getByLabel("Location", { exact: true }).selectOption("Oakland");
  await page.getByLabel("Maximum cost ($)").fill("1");
  await expect(page.getByText("No openings match just yet")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(appointmentCards).toHaveCount(defaultCardCount);
  await page
    .getByLabel("Insurance", { exact: true })
    .selectOption("Blue Horizon");
  await expect
    .poll(() => appointmentCards.count())
    .toBeLessThan(defaultCardCount);
  const insuranceCardCount = await appointmentCards.count();
  expect(insuranceCardCount).toBeGreaterThan(0);
  const snapshot = await (await page.request.get("/api/state")).json();
  const first = snapshot.slots.find((s: { plans: string[] }) =>
    s.plans.includes("Blue Horizon"),
  );
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(first.start));
  await page.getByLabel("Appointment date", { exact: true }).fill(date);
  await expect.poll(() => appointmentCards.count()).toBeGreaterThan(0);
  const dateCardCount = await appointmentCards.count();
  expect(dateCardCount).toBeLessThan(insuranceCardCount);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(appointmentCards).toHaveCount(defaultCardCount);
  await page.getByRole("button", { name: "View & book" }).first().click();
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByRole("status")).toContainText("Appointment confirmed");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Find care", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next appointment." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("API rejects missing session and cross-origin mutations", async ({
  request,
}) => {
  await request.delete("/api/session", {
    headers: { origin: "http://localhost:3100" },
  });
  expect(
    (
      await request.post("/api/actions", {
        data: { type: "book", slotId: "slot-0" },
        headers: { origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/session", {
        data: { id: "avery" },
        headers: { origin: "https://wrong.example" },
      })
    ).status(),
  ).toBe(403);
});

async function prepareInvitation(
  request: import("@playwright/test").APIRequestContext,
) {
  const headers = { origin: "http://localhost:3100" };
  await request.post("/api/session", { data: { id: "avery" }, headers });
  const now = new Date();
  const joined = await request.post("/api/actions", {
    headers,
    data: {
      type: "waitlist",
      service: "Dermatology",
      plan: "Blue Horizon",
      city: "",
      clinicIds: [],
      maxPrice: 20000,
      earliest: now.toISOString(),
      latest: new Date(+now + 35 * 86400000).toISOString(),
      startHour: 0,
      endHour: 24,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      bookingId: "avery-original",
    },
  });
  expect(joined.ok()).toBe(true);
  const patientState = await (await request.get("/api/state")).json();
  const waitlistId = patientState.waitlists[0].id;
  await request.post("/api/session", { data: { id: "staff-cedar" }, headers });
  await request.post("/api/actions", {
    data: { type: "cancel", bookingId: "cedar-cancellation" },
    headers,
  });
  const approved = await request.post("/api/actions", {
    data: {
      type: "approve",
      slotId: "earlier",
      waitlistId,
      reason: "Browser fixture: reviewed eligibility",
    },
    headers,
  });
  expect(approved.ok()).toBe(true);
  await request.post("/api/session", { data: { id: "avery" }, headers });
  return (await (await request.get("/api/state")).json()).offers[0]
    .id as string;
}
test("declining through the inbox preserves the original appointment", async ({
  page,
  request,
}) => {
  await prepareInvitation(request);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Invitation declined");
  await expect(page.locator(".offer-box")).toContainText("declined");
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await expect(
    page.locator(".booking-card").filter({ hasText: "Harbor Medical" }),
  ).toContainText("confirmed");
});
test("expired invitation is visibly inactive after refresh", async ({
  page,
  request,
}) => {
  const offerId = await prepareInvitation(request);
  // Advance only this isolated fixture's expiry; no browser sleeps or production test hook.
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query('UPDATE "Offer" SET "expiresAt"=$1 WHERE "id"=$2', [
      new Date(0),
      offerId,
    ]);
  } finally {
    await pool.end();
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.locator(".offer-box")).toContainText("expired");
  await expect(
    page.getByRole("button", { name: "Accept earlier appointment" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await expect(
    page.locator(".booking-card").filter({ hasText: "Harbor Medical" }),
  ).toContainText("confirmed");
});
