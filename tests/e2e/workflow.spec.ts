import { test, expect } from "./demo-fixture";
async function reset(request: import("@playwright/test").APIRequestContext) {
  await request.post("/api/session", {
    data: { id: "staff-cedar", demo: true },
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

async function enterBooking(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("button", { name: "My appointments", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Appointment calendar" }),
  ).toBeVisible();
}

test("complete patient → cancellation → staff approval → accepted replacement", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await enterBooking(page);
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Join a waitlist", exact: true })
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
  await enterBooking(page);
  const openings = page.locator(".cal-pop li button[data-slot-id]");
  await expect(
    page.getByRole("region", { name: "Appointment calendar" }),
  ).toBeVisible();
  const baseline = await openings.count();
  expect(baseline).toBeGreaterThan(0);
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Cardiology");
  await page.getByLabel("Location", { exact: true }).selectOption("Oakland");
  await page.getByLabel("Maximum cost ($)").fill("1");
  await expect(
    page.getByText("No openings match these filters.", { exact: false }),
  ).toBeVisible();
  await expect(openings).toHaveCount(baseline);
  expect(
    await page.locator(".cal-pop li button[data-slot-id]:not(.dim)").count(),
  ).toBe(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(openings).toHaveCount(baseline);
  await page
    .getByLabel("Insurance", { exact: true })
    .selectOption("Blue Horizon");
  const matching = page.locator(".cal-pop li button[data-slot-id]:not(.dim)");
  await expect.poll(() => matching.count()).toBeGreaterThan(0);
  expect(await matching.count()).toBeLessThan(baseline);
  const id = await matching.first().getAttribute("data-slot-id");
  const snapshot = await (await page.request.get("/api/state")).json();
  const first = snapshot.slots.find((slot: { id: string }) => slot.id === id);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(first.start));
  await page.getByLabel("Appointment date", { exact: true }).fill(date);
  await expect.poll(() => matching.count()).toBeGreaterThan(0);
  for (const slotId of await matching.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-slot-id")),
  )) {
    const slot = snapshot.slots.find((s: { id: string }) => s.id === slotId);
    expect(slot.plans).toContain("Blue Horizon");
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: slot.clinic.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(slot.start)),
    ).toBe(date);
  }
  await page.getByRole("button", { name: "Clear filters" }).click();
  const chosen = page.locator(`button[data-slot-id="${id}"]`);
  await chosen
    .locator("xpath=ancestor::div[contains(@class,'cal-clinic')]")
    .getByRole("button")
    .first()
    .click();
  await chosen.click();
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
        data: { id: "avery", demo: true },
        headers: { origin: "https://wrong.example" },
      })
    ).status(),
  ).toBe(403);
});

async function prepareInvitation(
  request: import("@playwright/test").APIRequestContext,
) {
  const headers = { origin: "http://localhost:3100" };
  await request.post("/api/session", {
    data: { id: "avery", demo: true },
    headers,
  });
  const intake = await request.post("/api/actions", {
    headers,
    data: {
      type: "intake",
      symptoms: [
        { area: "skin", pain: 4, duration: "month", worsening: false },
      ],
      warningSigns: [],
    },
  });
  expect(intake.ok(), await intake.text()).toBe(true);
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
  await request.post("/api/session", {
    data: { id: "staff-cedar", demo: true },
    headers,
  });
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
  await request.post("/api/session", {
    data: { id: "avery", demo: true },
    headers,
  });
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
