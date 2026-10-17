import { test, expect } from "@playwright/test";
const headers = { origin: "http://localhost:3100" };
test("staff reviews one request, patient sees it across refresh and original booking remains safe", async ({
  browser,
  request,
}) => {
  await request.post("/api/session", { headers, data: { id: "staff-cedar" } });
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "reset", confirmation: "RESET" },
      })
    ).ok(),
  ).toBe(true);
  const patient = await browser.newContext(),
    staff = await browser.newContext();
  try {
    await patient.request.post("/api/session", {
      headers,
      data: { id: "avery" },
    });
    expect(
      (
        await patient.request.post("/api/actions", {
          headers,
          data: {
            type: "intake",
            symptoms: [
              { area: "skin", pain: 4, duration: "week", worsening: false },
            ],
            warningSigns: [],
          },
        })
      ).ok(),
    ).toBe(true);
    const p = await patient.newPage();
    await p.goto("/appointments");
    await p
      .getByRole("button", { name: "Join a waitlist", exact: true })
      .click();
    await p
      .getByLabel("Existing appointment to replace (optional)")
      .selectOption("avery-original");
    await p.getByRole("button", { name: "Join waitlist", exact: true }).click();
    await expect(p.getByRole("status")).toContainText(
      "Waitlist preferences saved",
    );
    const before = await (await patient.request.get("/api/state")).json();
    const w = before.waitlists.find(
      (r: { bookingId: string }) => r.bookingId === "avery-original",
    );
    expect(w).toBeTruthy();
    const forbidden = await patient.request.post("/api/actions", {
      headers,
      data: {
        type: "setWaitlistPriority",
        waitlistId: w.id,
        clinicId: "cedar",
        level: "P1",
        expectedVersion: 0,
        reason: "Patient cannot self assign",
      },
    });
    expect(forbidden.status()).toBe(403);
    await staff.request.post("/api/session", {
      headers,
      data: { id: "staff-cedar" },
    });
    expect(
      (
        await staff.request.post("/api/actions", {
          headers,
          data: { type: "cancel", bookingId: "cedar-cancellation" },
        })
      ).ok(),
    ).toBe(true);
    const c = await staff.newPage();
    await c.goto("/clinic/priorities");
    await expect(
      c.getByRole("heading", { name: "Request priorities." }),
    ).toBeVisible();
    const card = c.getByRole("article", {
      name: "Avery Morgan Dermatology request",
    });
    await expect(card).toContainText("Awaiting staff review");
    await card
      .getByLabel("Request priority", { exact: true })
      .selectOption("P2");
    await card
      .getByLabel("Assignment reason (synthetic information only)")
      .fill("Synthetic professional information reviewed");
    await card
      .getByRole("button", { name: "Approve request priority" })
      .click();
    await expect(c.getByRole("status")).toContainText("Request priority saved");
    await expect(card).toContainText("P2 — High Priority");
    await card.getByText("Priority history (1)", { exact: true }).click();
    await expect(card).toContainText(
      "Synthetic professional information reviewed",
    );
    await c.reload();
    await expect(card).toContainText("P2 — High Priority");
    await p.reload();
    await expect(
      p.locator(".request-card").filter({ hasText: "Dermatology" }),
    ).toContainText("Cedar Health: P2 — High Priority");
    await expect(
      p.locator(".booking-card").filter({ hasText: "Harbor Medical" }),
    ).toContainText("confirmed");
    const after = await (await patient.request.get("/api/state")).json();
    expect(
      after.bookings.find((b: { id: string }) => b.id === "avery-original")
        .status,
    ).toBe("CONFIRMED");
    expect(after.offers).toHaveLength(0);
    await p.setViewportSize({ width: 375, height: 812 });
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await c.setViewportSize({ width: 375, height: 812 });
    expect(
      await c.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await c.getByLabel("Show priority group").selectOption("P4");
    await expect(
      c.getByText("No requests in this group", { exact: true }),
    ).toBeVisible();
    await c.getByLabel("Show priority group").selectOption("P2");
    await expect(card).toBeVisible();
  } finally {
    await patient.close();
    await staff.close();
  }
});
