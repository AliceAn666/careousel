import { test, expect, type Page } from "@playwright/test";
const headers = { origin: "http://localhost:3100" };
const credentials = {
  username: "record.patient",
  email: "recordpatient@example.test",
  name: "Synthetic Record Patient",
  password: "SyntheticPassword!123",
  plan: "Blue Horizon",
};
async function patient(page: Page) {
  await page.request.delete("/api/session", { headers });
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: {
          username: credentials.username,
          password: credentials.password,
          entrance: "PATIENT",
        },
      })
    ).ok(),
  ).toBe(true);
}
async function staff(page: Page, id = "staff-cedar") {
  await page.request.delete("/api/session", { headers });
  await page.request.post("/api/demo/context", {
    headers,
    data: { confirm: true },
  });
  expect(
    (
      await page.request.post("/api/session", {
        headers,
        data: { id, demo: true },
      })
    ).ok(),
  ).toBe(true);
}
test.beforeEach(async ({ request, page }) => {
  await request.post("/api/demo/context", { headers, data: { confirm: true } });
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
  expect(
    (
      await page.request.post("/api/auth/register", {
        headers,
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  await patient(page);
});
test("new patient authorizes samples, searches and extracts; clinician corrects/approves/rejects; revocation removes clinic evidence immediately", async ({
  page,
}) => {
  await page.goto("/health-information");
  await page
    .getByLabel("Clinic allowed to use this import")
    .selectOption("cedar");
  await page
    .getByRole("button", { name: "Authorize and import synthetic records" })
    .click();
  expect(
    (await (await page.request.get("/api/medical-records")).json()).imports,
  ).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: "I authorize importing", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Authorize and import synthetic records" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Synthetic medical records", exact: true })
      .getByRole("status"),
  ).toContainText("Synthetic FHIR-compatible records imported");
  await page.getByLabel("Search imported record text").fill("eczema");
  await page.getByLabel("Record search method").selectOption("keyword");
  await page
    .getByRole("button", { name: "Search records", exact: true })
    .click();
  await expect(
    page.getByText("Condition · historical-condition", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ServiceRequest · skin-follow-up", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Try optional local AI with fallback" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Synthetic medical records", exact: true })
      .getByRole("status"),
  ).toContainText("Deterministic local fallback");
  await expect(
    page.getByRole("article", { name: /Record suggestion / }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Approve extracted tag" }),
  ).toHaveCount(0);
  const before = await (await page.request.get("/api/state")).json();
  expect(before.user.intakeCompleted).toBe(false);
  expect(before.bookings).toHaveLength(0);
  await staff(page);
  await page.goto("/clinic/medical-records");
  const skin = page.getByRole("article", {
    name: "Record suggestion Dermatology",
    exact: true,
  });
  await skin
    .getByLabel("Review tag label")
    .fill("Reviewed sample dermatology follow-up");
  await skin
    .getByLabel("Review reason")
    .fill("Corrected sample recommendation");
  await skin.getByRole("button", { name: "Save corrected suggestion" }).click();
  await expect(skin).toContainText("Version 2");
  await skin
    .getByLabel("Review reason")
    .fill("Source reviewed by synthetic clinician");
  await skin.getByRole("button", { name: "Approve extracted tag" }).click();
  await expect(skin).toContainText("CLINICIAN CONFIRMED");
  const heart = page.getByRole("article", {
    name: "Record suggestion Cardiology",
    exact: true,
  });
  await heart
    .getByLabel("Review reason")
    .fill("Not relevant to this sample scheduling request");
  await heart.getByRole("button", { name: "Reject suggestion" }).click();
  await expect(heart).toContainText("REJECTED");
  await page.goto("/clinic/medical-tags");
  await expect(
    page.getByRole("heading", {
      name: "Reviewed sample dermatology follow-up · APPROVED",
    }),
  ).toBeVisible();
  await expect(page.getByText("Source:", { exact: false })).toContainText(
    "clinician-reviewed synthetic record import",
  );
  await patient(page);
  await page.goto("/health-information");
  await expect(
    page.getByRole("heading", {
      name: "Reviewed sample dermatology follow-up · APPROVED",
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Revoke record consent" }).click();
  await expect(
    page
      .getByRole("region", { name: "Synthetic medical records", exact: true })
      .getByRole("status"),
  ).toContainText("Consent revoked");
  await expect(
    page.getByRole("heading", {
      name: "Reviewed sample dermatology follow-up · APPROVED",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Archived for your private inspection.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Cedar Health · REVOKED", { exact: true }),
  ).toBeVisible();
  await staff(page);
  await page.goto("/clinic/medical-records");
  await expect(
    page.getByText("No authorized imports yet.", { exact: false }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/medical-records")).json()).records,
  ).toHaveLength(0);
});
test("record endpoints reject anonymous access, forged source URLs, cross-origin writes and ordinary staff reads", async ({
  page,
}) => {
  await page.request.delete("/api/session", { headers });
  expect((await page.request.get("/api/medical-records")).status()).toBe(401);
  await patient(page);
  const payload = {
    type: "authorizeImport",
    clinicId: "cedar",
    source: "CAREOUSEL_SYNTHETIC_FHIR_V1",
    consent: true,
    consentVersion: "SYNTHETIC_V1",
    requestId: crypto.randomUUID(),
  };
  expect(
    (
      await page.request.post("/api/medical-records", {
        headers,
        data: { ...payload, url: "https://real-hospital.example/records" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/medical-records", {
        headers: { origin: "https://foreign.example" },
        data: payload,
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.get("/api/medical-records?patientId=avery")).status(),
  ).toBe(400);
  await staff(page, "staff-harbor");
  const denied = await page.request.get("/api/medical-records");
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain("historical-condition");
});
