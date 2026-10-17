import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test.beforeEach(async ({ request, page }) => {
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
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
});
for (const service of ["Vaccination", "Blood test", "Routine examination"])
  test(`${service} can be directly booked without intake`, async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Specialty", { exact: true }).selectOption(service);
    const card = page
      .locator(".search-result")
      .filter({ hasText: "Cedar Health" });
    const time = card.locator("button[data-slot-id]").first();
    const id = await time.getAttribute("data-slot-id");
    await time.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm appointment", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Appointment confirmed",
    );
    const state = await (await page.request.get("/api/state")).json();
    expect(
      state.bookings.some(
        (b: { slotId: string; status: string }) =>
          b.slotId === id && b.status === "CONFIRMED",
      ),
    ).toBe(true);
    expect(state.user.intakeCompleted).toBe(false);
  });
for (const service of ["Dermatology", "Cardiology", "Primary care"])
  test(`${service} exposes reviewed waitlist only and rejects ordinary and need-specific API booking`, async ({
    page,
  }) => {
    await page.goto("/search");
    await page.getByLabel("Specialty", { exact: true }).selectOption(service);
    const cards = page.locator(".search-result");
    await expect(cards.first()).toBeVisible();
    await expect(cards.locator("button[data-slot-id]")).toHaveCount(0);
    await expect(
      cards.first().getByRole("button", { name: "Join Waitlist", exact: true }),
    ).toBeVisible();
    await expect(cards.first()).toContainText(
      "clinic-reviewed waitlist invitations",
    );
    const state = await (await page.request.get("/api/state")).json();
    const slot = state.slots.find(
      (s: { service: string }) => s.service === service,
    );
    const preferences = {
      plan: state.user.plan,
      city: "",
      clinicIds: [],
      maxPrice: 50000,
      earliest: new Date(),
      latest: new Date(Date.now() + 90 * 86400000),
      startHour: 0,
      endHour: 24,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    expect(
      (
        await page.request.post("/api/patient-needs", {
          headers,
          data: {
            type: "createNeed",
            title: `Reviewed ${service} need`,
            service,
            preferences,
            requiresReferral: false,
            requiresAuthorization: false,
            tagIds: [],
            original: { type: "NONE" },
          },
        })
      ).ok(),
    ).toBe(true);
    const need = (await (await page.request.get("/api/patient-needs")).json())
      .needs[0];
    for (const extra of [
      {},
      { needId: need.id, expectedNeedVersion: need.version },
      { selfPayAcknowledged: true, insuranceProvider: "Self-pay" },
    ]) {
      const r = await page.request.post("/api/actions", {
        headers,
        data: { type: "book", slotId: slot.id, ...extra },
      });
      expect(r.status()).toBe(403);
      expect((await r.json()).error).toContain(
        "clinic-reviewed waitlist invitations",
      );
    }
    await page.goto("/needs");
    const n = page.getByRole("article", {
      name: `Medical need Reviewed ${service} need`,
      exact: true,
    });
    await n.getByRole("button", { name: "How to find reviewed care" }).click();
    await expect(
      n.getByRole("button", { name: "Book for this need" }),
    ).toHaveCount(0);
    await n
      .getByRole("button", { name: "Find earlier — join this need’s waitlist" })
      .click();
    await expect(n).toContainText("ACTIVE");
    const after = await (await page.request.get("/api/state")).json();
    expect(after.bookings).toHaveLength(state.bookings.length);
    expect(
      after.bookings.find((b: { id: string }) => b.id === "avery-original")
        .status,
    ).toBe("CONFIRMED");
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
