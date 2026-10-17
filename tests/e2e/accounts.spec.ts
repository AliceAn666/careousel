import { test, expect } from "@playwright/test";
const headers = { origin: "http://localhost:3100" };
const password = "SyntheticPassword!123";
async function bootstrapAdmin() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/careousel_test")
    throw new Error("Isolated test database required.");
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { provisionMockAdministrator } =
    await import("../../src/server/auth/accounts");
  await provisionMockAdministrator({
    clinicId: "cedar",
    username: "cedar.admin",
    email: "admin@cedar.example.test",
    name: "Synthetic Cedar Admin",
    password,
  });
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
  await request.delete("/api/session", { headers });
});
test("patient individual account, onboarding, logout and navigation never switch roles or reset shared appointments", async ({
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
        data: { type: "cancel", bookingId: "cedar-cancellation" },
      })
    ).ok(),
  ).toBe(true);
  await request.delete("/api/session", { headers });
  const before = await (await request.get("/api/state")).json();
  expect(
    before.slots.some((slot: { id: string }) => slot.id === "earlier"),
  ).toBe(true);
  expect(
    (
      await request.post("/api/session", {
        headers,
        data: { id: "staff-cedar" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/");
  await expect(page.getByLabel("Choose a demo persona")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Patient Login", exact: true })
    .click();
  await page.getByRole("button", { name: "Create patient account" }).click();
  await page.getByLabel("Username", { exact: true }).fill("patient.one");
  await page
    .getByLabel("Display name (fictional)")
    .fill("Synthetic New Patient");
  await page.getByLabel("Email (fictional)").fill("patient@example.test");
  await page.getByLabel("Password (at least 12 characters)").fill(password);
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Patient account created",
  );
  await page.getByLabel("Username", { exact: true }).fill("patient.one");
  await page.getByLabel("Password (at least 12 characters)").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(
    page.getByText("Synthetic New Patient", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Switch demo persona")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "My Appointments & Waitlists",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByText("Tell us how you’re feeling", { exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(
    page.getByText(/Signed in as Synthetic New Patient/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clinic Staff Login", exact: true })
    .click();
  await expect(page).toHaveURL(/login\/staff$/);
  await expect(page.getByText("Log out before signing in")).toBeVisible();
  const still = await (await page.request.get("/api/state")).json();
  expect(still.user.role).toBe("PATIENT");
  expect(
    (
      await page.request.post("/api/demo/context", {
        headers,
        data: { confirm: true },
      })
    ).status(),
  ).toBe(409);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "careousel_session",
  )!.value;
  const logoutResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/session") &&
      response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  expect((await logoutResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  const stale = await request.get("/api/state", {
    headers: { cookie: `careousel_session=${cookie}` },
  });
  expect((await stale.json()).user).toBeNull();
  const after = await (await request.get("/api/state")).json();
  // Equal-time openings have no guaranteed database tie order. Compare the
  // actual preserved appointment facts, independently of that incidental order.
  const slotFacts = (
    slots: { id: string; status: string; start: string; end: string }[],
  ) =>
    slots
      .map(({ id, status, start, end }) => ({ id, status, start, end }))
      .sort((a, b) => a.id.localeCompare(b.id));
  expect(slotFacts(after.slots)).toEqual(slotFacts(before.slots));
  await page
    .getByRole("button", { name: "Enter Demo Mode", exact: true })
    .click();
  await expect(
    page.getByText(/Demo Mode · synthetic personas only/),
  ).toBeVisible();
});
for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  test(`administrator invites, staff registers, admin approves, staff logs in and loses access after revocation (${viewport.name})`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(viewport);
    await bootstrapAdmin();
    await page.goto("/login/staff");
    await page.getByLabel("Username", { exact: true }).fill("cedar.admin");
    await page.getByLabel("Password (at least 12 characters)").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Staff access", exact: true })
      .click();
    await page
      .getByLabel("Staff work email (mock)")
      .fill("nurse@cedar.example.test");
    await page.getByRole("button", { name: "Create mock invitation" }).click();
    await expect(page.getByRole("status")).toContainText("No email was sent");
    const token = await page
      .locator("div")
      .filter({
        has: page.getByText("Copy this one-time invitation token now", {
          exact: true,
        }),
      })
      .last()
      .locator("p")
      .first()
      .innerText();
    const context = await browser.newContext({ viewport });
    try {
      const staff = await context.newPage();
      await staff.goto("/login/staff");
      await staff
        .getByRole("button", { name: "Redeem staff invitation" })
        .click();
      await staff.getByLabel("Username", { exact: true }).fill("cedar.nurse");
      await staff
        .getByLabel("Display name (fictional)")
        .fill("Synthetic Nurse");
      await staff
        .getByLabel("Invited work email (mock)")
        .fill("nurse@cedar.example.test");
      await staff.getByLabel("Invitation token").fill(`  ${token}  `);
      await staff
        .getByLabel("Password (at least 12 characters)")
        .fill(password);
      await staff
        .getByRole("button", { name: "Create invited staff account" })
        .click();
      await expect(staff.getByRole("status")).toContainText(
        "administrator approval",
      );
      await expect(staff.getByRole("status")).toHaveText(
        "Staff account created. Awaiting administrator approval.",
      );
      await expect(
        staff.getByRole("heading", { name: "Clinic Staff Login", exact: true }),
      ).toBeVisible();
      expect(
        await staff.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.reload();
      const member = page
        .getByRole("article")
        .filter({ hasText: "Synthetic Nurse" });
      await member
        .getByRole("button", { name: "Approve staff access" })
        .click();
      await expect(member).toContainText("ACTIVE");
      await staff.getByLabel("Username", { exact: true }).fill("cedar.nurse");
      await staff
        .getByLabel("Password (at least 12 characters)")
        .fill(password);
      await staff.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(staff).toHaveURL(/clinic\/schedule$/);
      await expect(staff.getByLabel("Switch demo persona")).toHaveCount(0);
      const snapshot = await (await staff.request.get("/api/state")).json();
      expect(snapshot.user.clinicId).toBe("cedar");
      expect(
        snapshot.slots.every(
          (s: { clinicId: string }) => s.clinicId === "cedar",
        ),
      ).toBe(true);
      expect((await staff.request.get("/api/clinic/access")).status()).toBe(
        403,
      );
      page.once("dialog", (d) => d.accept());
      await member.getByRole("button", { name: "Revoke access" }).click();
      await expect(member).toContainText("REVOKED");
      expect(
        (await (await staff.request.get("/api/state")).json()).user,
      ).toBeNull();
      expect(
        (
          await staff.request.post("/api/actions", {
            headers,
            data: { type: "cancel", bookingId: "cedar-cancellation" },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await context.close();
    }
  });
}

test("account endpoints enforce CSRF, prevent self-granted staff and reject expired sessions", async ({
  request,
}) => {
  const body = {
    username: "security.patient",
    name: "Synthetic Security Patient",
    email: "security@example.test",
    password,
    plan: "Blue Horizon",
  };
  expect(
    (
      await request.post("/api/auth/register", {
        headers,
        data: { ...body, role: "STAFF", clinicId: "cedar" },
      })
    ).status(),
  ).toBe(400);
  for (const path of [
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/staff-register",
    "/api/clinic/access",
    "/api/demo/context",
  ])
    expect(
      (
        await request.post(path, {
          headers: { origin: "https://untrusted.example.test" },
          data: body,
        })
      ).status(),
    ).toBe(403);
  expect(
    (
      await request.post("/api/auth/register", { headers, data: body })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post("/api/auth/login", {
        headers,
        data: { username: body.username, password, entrance: "PATIENT" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post("/api/auth/login", {
        headers,
        data: { username: "another.user", password, entrance: "STAFF" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post("/api/session", {
        headers,
        data: { id: "staff-cedar", demo: true },
      })
    ).status(),
  ).toBe(409);
  const state = await (await request.get("/api/state")).json();
  expect(state.auth.mode).toBe("account");
  expect(state.personas).toHaveLength(0);
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/careousel_test")
    throw new Error("Isolated expiry fixture required.");
  process.env.DATABASE_URL = url;
  const { db } = await import("../../src/server/db");
  await db.accountSession.updateMany({
    where: { account: { username: body.username } },
    data: { expiresAt: new Date(0) },
  });
  expect((await (await request.get("/api/state")).json()).user).toBeNull();
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "book", slotId: "slot-0" },
      })
    ).status(),
  ).toBe(401);
});

test("account forms show email validation beside the field and failed login below the password", async ({
  page,
}) => {
  await page.goto("/login/patient");
  await page.getByRole("button", { name: "Create patient account" }).click();
  await page.getByLabel("Username", { exact: true }).fill("form.patient");
  await page
    .getByLabel("Display name (fictional)")
    .fill("Synthetic Form Patient");
  await page.getByLabel("Email (fictional)").fill("person@gmail.com");
  await page.getByLabel("Password (at least 12 characters)").fill(password);
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Only fictional example/test email addresses",
  );
  await expect(page.getByLabel("Email (fictional)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Email (fictional)").fill("form@example.test");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Patient account created",
  );
  await page.getByLabel("Username", { exact: true }).fill("form.patient");
  await page
    .getByLabel("Password (at least 12 characters)")
    .fill("IncorrectPassword!123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Invalid username or password.",
  );
  await expect(
    page.getByLabel("Password (at least 12 characters)"),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Password (at least 12 characters)").fill(password);
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
});

test("password visibility works for patient and staff login/registration without losing typed text", async ({
  page,
}) => {
  for (const entrance of ["patient", "staff"] as const) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/login/${entrance}`);
    const passwordInput = page.locator('input[name="password"]');
    const value = "DemoVisibility!123";
    await passwordInput.fill(value);
    await expect(passwordInput).toHaveAttribute("type", "password");
    const show = page.getByRole("button", { name: "Show password" });
    await expect(show).toHaveAttribute("type", "button");
    await show.click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await expect(passwordInput).toHaveValue(value);
    const hide = page.getByRole("button", { name: "Hide password" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await hide.focus();
    await page.keyboard.press("Enter");
    await expect(passwordInput).toHaveAttribute("type", "password");
    await expect(passwordInput).toHaveValue(value);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page
      .getByRole("button", {
        name:
          entrance === "patient"
            ? "Create patient account"
            : "Redeem staff invitation",
      })
      .click();
    await expect(passwordInput).toHaveAttribute("type", "password");
    await passwordInput.fill(value);
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await expect(passwordInput).toHaveValue(value);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
    await expect(passwordInput).toHaveValue(value);
  }
});
