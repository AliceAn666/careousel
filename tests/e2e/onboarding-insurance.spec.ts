import { test, expect, type Page } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test.beforeEach(async ({ request }) => {
  expect(
    (
      await request.post("/api/session", {
        headers,
        data: { id: "staff-cedar", demo: true },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post("/api/actions", {
        headers,
        data: { type: "reset", confirmation: "RESET" },
      })
    ).ok(),
  ).toBe(true);
});
async function enterPatient(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find Care", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Quick tour", exact: true }),
  ).toBeEnabled();

  await expect(
    page.getByRole("region", { name: "Appointment search" }),
  ).toBeVisible();
}
const state = async (page: Page) =>
  (await page.request.get("/api/state")).json();

test("patient guide follows current screens, resumes after refresh, and never changes bookings", async ({
  page,
}) => {
  await enterPatient(page);
  const before = await state(page);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "careousel_session",
  )?.value;
  await page.getByRole("button", { name: "Quick tour" }).click();
  const guide = page.getByRole("dialog", { name: "Careousel quick tour" });
  await expect(guide.getByRole("heading")).toHaveText("Find care that fits");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText(
    "Understand your demo benefits",
  );
  await guide.getByRole("button", { name: "Back", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText("Find care that fits");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(guide).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Quick tour" })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText(
    "Understand your demo benefits",
  );
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/appointments$/);
  await expect(guide).toContainText("independent medical need");
  await expect(guide).toContainText("cannot cancel external appointments");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/notifications$/);
  await guide.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(guide).not.toBeVisible();
  const after = await state(page);
  expect(
    after.bookings.map((b: { id: string; status: string }) => [b.id, b.status]),
  ).toEqual(
    before.bookings.map((b: { id: string; status: string }) => [
      b.id,
      b.status,
    ]),
  );
  expect(after.waitlists).toEqual(before.waitlists);
  expect(
    after.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  expect(
    (await page.context().cookies()).find((c) => c.name === "careousel_session")
      ?.value,
  ).toBe(cookie);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText("Find care that fits");
  const box = await guide.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await guide.getByRole("button", { name: "Close guide" }).click();
});

test("signed-in insurer automatically flags only incompatible clinics without preventing self-pay booking", async ({
  page,
}) => {
  await enterPatient(page);
  const cards = page.locator(".appointment-results .search-result");
  const account = page.getByRole("region", {
    name: "Insurance from your account",
  });
  await expect(account).toContainText("Blue Horizon");
  await expect(page.getByLabel("Insurance company (demo)")).toHaveCount(0);
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Cardiology");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".insurance-match-good")).toHaveCount(0);
  await expect(page.locator(".insurance-match-warning")).toHaveCount(0);

  // HMO changes the fictional network scenario, but never hides clinics.
  await page.getByLabel("Insurance plan type").selectOption("HMO");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".insurance-match-warning")).toHaveCount(4);
  const cedar = cards.filter({ hasText: "Cedar Health" });
  await expect(cedar.locator(".insurance-match-warning")).toContainText(
    "does not cover this service",
  );
  const summit = cards.filter({ hasText: "Summit" });
  await expect(summit.locator(".insurance-match-warning")).toContainText(
    "is not accepted at this clinic",
  );
  await expect(
    cards.first().getByRole("button", { name: "View details & book" }),
  ).toHaveCount(0);

  // Every displayed opening is selectable without first opening another menu.
  const chosen = cedar.locator("button[data-slot-id]").first();
  const chosenId = await chosen.getAttribute("data-slot-id");
  await chosen.click();
  const details = page.getByRole("dialog", { name: "Appointment details" });
  await expect(details).toContainText("Blue Horizon");
  await expect(
    details.getByLabel("Insurance company for appointment"),
  ).toHaveCount(0);
  await expect(details.locator(".insurance-booking-warning")).toContainText(
    "full listed price",
  );
  await details
    .getByRole("button", { name: /Confirm self-pay appointment/ })
    .click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole("status")).toContainText(
    "self-pay acknowledgment",
  );
  const afterBooking = await state(page);
  expect(afterBooking.user.plan).toBe("Blue Horizon");
  expect(
    afterBooking.bookings.some(
      (b: { slotId: string; status: string }) =>
        b.slotId === chosenId && b.status === "CONFIRMED",
    ),
  ).toBe(true);

  await page.goto("/search");
  await page.reload();
  await expect(account).toContainText("Blue Horizon");
  await page.getByLabel("Switch demo persona").selectOption("patient-1");
  await expect(account).toContainText("Aster Health");
  await expect(page.locator(".insurance-match-warning").first()).toBeVisible();
  await page.getByLabel("Switch demo persona").selectOption("avery");
  await expect(account).toContainText("Blue Horizon");
  await expect(page.getByLabel("Insurance company (demo)")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("clinic guide uses current priority navigation and keeps clinic session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open clinic demo" }).click();
  await expect(page).toHaveURL(/clinic\/schedule$/);
  await page.getByRole("button", { name: "Quick tour", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Careousel quick tour" });
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/clinic\/waitlists$/);
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/clinic\/waitlists\?tab=priorities$/);
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/clinic\/waitlists\?tab=notifications$/);
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/clinic\/records$/);
  await guide.getByRole("button", { name: "Finish", exact: true }).click();
  expect((await state(page)).user.clinicId).toBe("cedar");
  await page.reload();
  await page.getByRole("button", { name: "Careousel home page" }).click();
  await page.getByRole("button", { name: "For Clinics", exact: true }).click();
  expect((await state(page)).user.clinicId).toBe("cedar");
});
