import { test, expect } from "@playwright/test";
const headers = { origin: "http://localhost:3100" };
test.beforeEach(async ({ request }) => {
  await request.post("/api/session", { data: { id: "staff-cedar" }, headers });
  const r = await request.post("/api/actions", {
    data: { type: "reset", confirmation: "RESET" },
    headers,
  });
  expect(r.ok()).toBe(true);
});
test("Chinese switching survives refresh and expanded services remain bookable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: "以 Avery 患者身份进入" }).click();
  await page
    .getByRole("combobox", { name: "服务类别", exact: true })
    .selectOption("Vaccination");
  await expect(page.locator(".appointment-card").first()).toContainText(
    "疫苗接种",
  );
  await expect(page.locator(".appointment-card").first()).not.toContainText(
    "Vaccination",
  );
  await page
    .locator(".appointment-card")
    .first()
    .getByRole("button", { name: "查看并预约" })
    .click();
  await page.getByRole("button", { name: "确认预约", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("预约已确认");
  await expect(
    page.locator(".booking-card").filter({ hasText: "疫苗接种" }),
  ).toContainText("已确认");
  await page.reload();
  await expect(page.getByRole("heading", { name: /^我的预约/ })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("button", { name: "English", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.locator(".booking-card").filter({ hasText: "Vaccination" }),
  ).toContainText("confirmed");
});
test("staff approves two groups; declining priority automatically notifies general", async ({
  page,
  request,
}) => {
  await request.post("/api/session", { data: { id: "avery" }, headers });
  const now = new Date();
  expect(
    (
      await request.post("/api/actions", {
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
      })
    ).ok(),
  ).toBe(true);
  await request.post("/api/session", { data: { id: "staff-cedar" }, headers });
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "cancel", bookingId: "cedar-cancellation" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "Cedar Health workspace" }).click();
  await page
    .getByRole("button", { name: "Waitlist matches", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Notification group for Sam Rivera" })
    .selectOption("priority");
  await page
    .getByRole("combobox", { name: "Notification group for Avery Morgan" })
    .selectOption("general");
  await page
    .getByLabel("Staff approval reason")
    .fill("Reviewed eligibility and staff priority group");
  await page
    .getByRole("button", { name: "Approve & start groups", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Group notification plan approved",
  );
  await expect(page.locator(".batch-plans")).toContainText(
    "Priority group notified",
  );
  await request.post("/api/session", { data: { id: "patient-2" }, headers });
  const state = await (await request.get("/api/state")).json();
  const offer = state.offers.find(
    (o: { slotId: string; status: string }) =>
      o.slotId === "earlier" && o.status === "PENDING",
  );
  expect(offer).toBeTruthy();
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "respond", offerId: offer.id, accept: false },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.locator(".batch-plans")).toContainText(
    "General group notified",
  );
  await page.locator(".persona-switch select").selectOption("avery");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.locator(".offer-box")).toContainText("Group invitation");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Accept earlier appointment", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Earlier appointment confirmed",
  );
});
