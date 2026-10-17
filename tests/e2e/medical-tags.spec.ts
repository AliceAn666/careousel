import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
async function fixtures(admin = false) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/careousel_test")
    throw new Error("Isolated database required");
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { db } = await import("../../src/server/db");
  await db.slot.create({
    data: {
      id: "phase8-browser-slot",
      clinicId: "cedar",
      service: "Dermatology",
      provider: "Synthetic clinician",
      start: new Date(Date.now() - 86400000),
      end: new Date(Date.now() - 84000000),
      price: 10000,
      plans: ["Blue Horizon"],
      status: "BOOKED",
    },
  });
  await db.booking.create({
    data: {
      id: "phase8-browser-visit",
      patientId: "avery",
      slotId: "phase8-browser-slot",
    },
  });
  if (admin) {
    const { provisionMockAdministrator } =
      await import("../../src/server/auth/accounts");
    await provisionMockAdministrator({
      clinicId: "cedar",
      username: "tags.admin",
      name: "Synthetic Admin",
      email: "tags@example.test",
      password: "SyntheticPassword!123",
    });
  }
}
test.beforeEach(async ({ request }) => {
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
});
test("clinician creates, reviews and edits visit evidence; patient sees only approved records and can still search", async ({
  page,
}) => {
  await fixtures();
  await page.request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
  await page.goto("/clinic/medical-tags");
  await page.getByLabel("Visit source").selectOption("phase8-browser-visit");
  await page
    .getByLabel("Medical need title", { exact: true })
    .fill("Skin follow-up");
  await page
    .getByLabel("Tag label", { exact: true })
    .fill("Synthetic follow-up recommendation");
  await page
    .getByLabel("Clinical notes", { exact: false })
    .fill("Synthetic private visit note");
  await page
    .getByLabel("Scheduling follow-up recommendation", { exact: false })
    .fill("Schedule the follow-up recommended at this visit");
  await page.getByLabel("Recommended by (UTC date)").fill("2030-12-31");
  await page
    .getByLabel("Audit reason", { exact: true })
    .fill("Documented synthetic visit");
  await page.getByRole("button", { name: "Save draft medical tag" }).click();
  const card = page.getByRole("article", {
    name: "Medical tag Synthetic follow-up recommendation",
  });
  await expect(card).toContainText("DRAFT");
  await expect(page.getByLabel("Tag label", { exact: true })).toHaveValue("");
  page.once("dialog", (dialog) =>
    dialog.accept("Reviewed synthetic visit evidence"),
  );
  await card.getByRole("button", { name: "Approve medical tag" }).click();
  await expect(card).toContainText("APPROVED");
  await card.getByText("Medical tag audit history", { exact: true }).click();
  await expect(card).toContainText("Version 2");
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  await page.goto("/health-information");
  await expect(
    page.getByText("Synthetic private visit note", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit medical tag" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
  await page.goto("/clinic/medical-tags");
  await card.getByRole("button", { name: "Edit medical tag" }).click();
  await page
    .getByLabel("Tag label", { exact: true })
    .fill("Corrected follow-up recommendation");
  await page
    .getByLabel("Audit reason", { exact: true })
    .fill("Corrected source recommendation");
  await page.getByRole("button", { name: "Save draft medical tag" }).click();
  await expect(
    page.getByRole("article", {
      name: "Medical tag Corrected follow-up recommendation",
    }),
  ).toContainText("DRAFT");
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  await page.goto("/health-information");
  await expect(
    page.getByText("No approved medical tags available.", { exact: false }),
  ).toBeVisible();
  await page.goto("/search");
  await expect(page.getByText("Tell us how you’re feeling")).toHaveCount(0);
});
test("administrator explicitly grants and revokes clinical author permission; unauthenticated and patient writes denied", async ({
  page,
  request,
}) => {
  await fixtures(true);
  await page.request.delete("/api/session", { headers });
  expect((await page.request.get("/api/medical-tags")).status()).toBe(401);
  const login = await page.request.post("/api/auth/login", {
    headers,
    data: {
      username: "tags.admin",
      password: "SyntheticPassword!123",
      entrance: "STAFF",
    },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/clinic/medical-tags");
  await expect(
    page.getByText("Read-only approved scheduling evidence.", { exact: false }),
  ).toBeVisible();
  await page.goto("/clinic/access");
  page.once("dialog", (dialog) =>
    dialog.accept("Synthetic clinical credentials reviewed"),
  );
  await page
    .getByRole("button", { name: "Grant clinical author permission" })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke clinical author permission" }),
  ).toBeVisible();
  await page.goto("/clinic/medical-tags");
  await expect(page.getByLabel("Visit source")).toBeVisible();
  await page.goto("/clinic/access");
  page.once("dialog", (dialog) => dialog.accept("Clinical duties withdrawn"));
  await page
    .getByRole("button", { name: "Revoke clinical author permission" })
    .click();
  await expect(
    page.getByRole("button", { name: "Grant clinical author permission" }),
  ).toBeVisible();
  await page.goto("/clinic/medical-tags");
  await expect(page.getByLabel("Visit source")).toHaveCount(0);
  await request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  const denied = await request.post("/api/medical-tags", {
    headers,
    data: {
      type: "approve",
      tagId: "forged",
      expectedVersion: 1,
      reason: "Patient cannot approve",
    },
  });
  expect(denied.status()).toBe(403);
  const crossOrigin = await request.post("/api/medical-tags", {
    headers: { origin: "https://untrusted.example" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
});
