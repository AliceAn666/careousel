import { test, expect } from "./demo-fixture";

const sameOrigin = { origin: "http://localhost:3100" };
const days = 24 * 60 * 60 * 1000;

test.beforeEach(async ({ request }) => {
  const staff = await request.post("/api/session", {
    headers: sameOrigin,
    data: { id: "staff-cedar", demo: true },
  });
  expect(staff.ok(), await staff.text()).toBe(true);
  const reset = await request.post("/api/actions", {
    headers: sameOrigin,
    data: { type: "reset", confirmation: "RESET" },
  });
  expect(reset.ok(), await reset.text()).toBe(true);
});

test("clinic schedule creates a real opening, persists after refresh, and remains isolated by clinic", async ({
  page,
  browser,
}) => {
  const login = await page.request.post("/api/session", {
    headers: sameOrigin,
    data: { id: "staff-cedar", demo: true },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/clinic/schedule");
  await expect(page.getByRole("heading", { name: "Appointment schedule" })).toBeVisible();
  const previous = await (await page.request.get("/api/state")).json();
  const beforeCount = previous.slots.length;

  const startLocal = await page.evaluate(() => {
    const date = new Date(Date.now() + 50 * 86400000);
    date.setHours(11, 0, 0, 0);
    const part = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
  });
  await page.getByRole("button", { name: "New opening" }).click();
  const modal = page.getByRole("dialog", {
    name: "Create an appointment opening",
  });
  await modal.getByLabel("Specialty").selectOption("Vaccination");
  await modal.getByLabel("Start date & time (your device timezone)").fill(startLocal);
  await modal.getByLabel("Estimated cost ($)").fill("9132");
  await modal.getByRole("button", { name: "Create opening" }).click();
  await expect(page.getByRole("status")).toContainText("New appointment opening created.");
  const updated = await (await page.request.get("/api/state")).json();
  expect(updated.slots).toHaveLength(beforeCount + 1);
  const created = updated.slots.find(
    (slot: { price: number; clinicId: string; service: string }) =>
      slot.price === 913200 && slot.clinicId === "cedar" && slot.service === "Vaccination",
  );
  expect(created).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "$9,132" }),
  ).toContainText("Vaccination");

  const otherClinic = await browser.newContext();
  try {
    const otherLogin = await otherClinic.request.post("/api/session", {
      headers: sameOrigin,
      data: { id: "staff-harbor", demo: true },
    });
    expect(otherLogin.ok()).toBe(true);
    const otherState = await (await otherClinic.request.get("/api/state")).json();
    expect(otherState.user.clinicId).toBe("harbor");
    expect(
      otherState.slots.every((slot: { clinicId: string }) => slot.clinicId === "harbor"),
    ).toBe(true);
    expect(
      otherState.slots.some((slot: { id: string }) => slot.id === created.id),
    ).toBe(false);
    const steal = await otherClinic.request.post("/api/actions", {
      headers: sameOrigin,
      data: { type: "cancel", bookingId: "cedar-cancellation" },
    });
    expect(steal.status()).toBe(403);
    const leak = await otherClinic.request.get(
      "/api/notification-sequences?slotId=earlier",
    );
    expect(leak.status()).toBe(403);
    expect((await otherClinic.request.get("/api/clinic/access")).status()).toBe(403);
  } finally {
    await otherClinic.close();
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/clinic/schedule", "/clinic/waitlists", "/clinic/priorities"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Appointment schedule" }).or(
      page.getByRole("region", { name: "Automatic group notifications" })
    ).or(page.getByText("Staff-reviewed request priorities"))).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Clinic page ${path} must fit narrow viewport`,
    ).toBe(true);
  }
});

test("clinic schedule shows scoped P1–P4 groups and opens exact slot review", async ({
  page,
  browser,
}) => {
  const login = await page.request.post("/api/session", {
    headers: sameOrigin,
    data: { id: "staff-cedar", demo: true },
  });
  expect(login.ok()).toBe(true);
  const state = await (await page.request.get("/api/state")).json();
  expect(state.user.clinicId).toBe("cedar");
  expect(
    state.slots.every((slot: { clinicId: string }) => slot.clinicId === "cedar"),
  ).toBe(true);
  await page.goto("/clinic/schedule");
  await expect(
    page.getByText("Showing Cedar Health appointments only.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("tbody tr[data-slot-id]")).toHaveCount(
    state.slots.length,
  );
  const target = state.slots.find(
    (slot: { id: string; status: string }) =>
      slot.status === "AVAILABLE" &&
      state.candidates.some((c: { slotId: string }) => c.slotId === slot.id),
  );
  expect(target, "Seed should include a matching available Cedar opening").toBeTruthy();
  const row = page.locator(`tbody tr[data-slot-id="${target.id}"]`);
  const groups = row.getByLabel(/Priority groups for/);
  await expect(groups).toContainText("P1:");
  await expect(groups).toContainText("P2:");
  await expect(groups).toContainText("P3:");
  await expect(groups).toContainText("P4:");
  await row.getByRole("button", { name: "Review P1–P4 groups" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/clinic/waitlists\\?slotId=${target.id}`),
  );
  const manager = page.getByRole("region", {
    name: "Automatic group notifications",
  });
  await expect(manager.getByLabel("Manage opening")).toHaveValue(target.id);
  await expect(manager.getByText("P1 — Time-Sensitive", { exact: true }))
    .toBeVisible();
  await expect(manager.getByText("P4 — Flexible", { exact: true }))
    .toBeVisible();

  // A different clinic cannot access the Cedar slot or its preview.
  const other = await browser.newContext();
  try {
    await other.request.post("/api/session", {
      headers: sameOrigin,
      data: { id: "staff-harbor", demo: true },
    });
    const stateOther = await (await other.request.get("/api/state")).json();
    expect(stateOther.slots.every(
      (slot: { clinicId: string }) => slot.clinicId === "harbor",
    )).toBe(true);
    expect(stateOther.slots.some(
      (slot: { id: string }) => slot.id === target.id,
    )).toBe(false);
    const forbidden = await other.request.get(
      `/api/notification-sequences?slotId=${encodeURIComponent(target.id)}`,
    );
    expect(forbidden.status()).toBe(403);
  } finally {
    await other.close();
  }
});

test("patients and anonymous browsers cannot administer clinics or invoke notification workers", async ({
  browser,
}) => {
  const patient = await browser.newContext();
  try {
    await patient.request.post("/api/session", {
      headers: sameOrigin,
      data: { id: "avery", demo: true },
    });
    const impossible = await patient.request.post("/api/actions", {
      headers: sameOrigin,
      data: {
        type: "createSlot",
        service: "Vaccination",
        start: new Date(Date.now() + 60 * days).toISOString(),
        price: 12000,
      },
    });
    expect(impossible.status()).toBe(403);
    const unauthorizedPriority = await patient.request.post("/api/actions", {
      headers: sameOrigin,
      data: {
        type: "setWaitlistPriority",
        waitlistId: "anything",
        clinicId: "cedar",
        level: "P1",
        expectedVersion: 0,
        reason: "Patient attempted escalation",
      },
    });
    expect(unauthorizedPriority.status()).toBe(403);
    expect(
      (await patient.request.get("/api/notification-sequences?slotId=earlier")).status(),
    ).toBe(403);
    expect((await patient.request.get("/api/clinic/access")).status()).toBe(403);
  } finally {
    await patient.close();
  }

  const publicBrowser = await browser.newContext();
  try {
    expect(
      (await publicBrowser.request.post("/api/internal/notifications/process", {
        headers: sameOrigin,
      })).status(),
    ).toBe(401);
    expect(
      (await publicBrowser.request.post("/api/internal/notifications/github", {
        headers: sameOrigin,
      })).status(),
    ).toBe(401);
    expect(
      (await publicBrowser.request.post("/api/actions", {
        headers: sameOrigin,
        data: { type: "createSlot", service: "Vaccination", start: new Date(Date.now() + 60 * days).toISOString(), price: 10000 },
      })).status(),
    ).toBe(401);
    const publicState = await (await publicBrowser.request.get("/api/state")).json();
    expect(publicState.user).toBeNull();
    expect(publicState.bookings).toHaveLength(0);
    expect(publicState.waitlists).toHaveLength(0);
    expect(publicState.offers).toHaveLength(0);
    expect(publicState.activity).toHaveLength(0);
  } finally {
    await publicBrowser.close();
  }
});

test("unreviewed cross-clinic waitlist stays excluded from automatic P1–P4 sends", async ({
  browser,
}) => {
  const patient = await browser.newContext();
  try {
    await patient.request.post("/api/session", {
      headers: sameOrigin,
      data: { id: "avery", demo: true },
    });
    const registered = await patient.request.post("/api/actions", {
      headers: sameOrigin,
      data: {
        type: "waitlist",
        service: "Dermatology",
        plan: "Blue Horizon",
        city: "",
        clinicIds: [],
        maxPrice: 20000,
        earliest: new Date().toISOString(),
        latest: new Date(Date.now() + 35 * days).toISOString(),
        startHour: 0,
        endHour: 24,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        bookingId: "avery-original",
      },
    });
    expect(registered.ok(), await registered.text()).toBe(true);

    const staff = await browser.newContext();
    try {
      await staff.request.post("/api/session", {
        headers: sameOrigin,
        data: { id: "staff-cedar", demo: true },
      });
      const previewResponse = await staff.request.get(
        "/api/notification-sequences?slotId=earlier",
      );
      expect(previewResponse.ok(), await previewResponse.text()).toBe(true);
      const preview = await previewResponse.json();
      const avery = preview.candidates.find(
        (entry: { name: string }) => entry.name === "Avery Morgan",
      );
      expect(avery).toBeTruthy();
      expect(avery.excluded).toContain("No approved priority");
      expect(avery.level).toBeNull();
      const forged = await staff.request.post("/api/notification-sequences", {
        headers: sameOrigin,
        data: {
          operation: "start",
          slotId: "earlier",
          previewToken: preview.previewToken,
          approvedWaitlistIds: [avery.waitlistId],
          firstGroup: 1,
          reason: "Try to include unreviewed synthetic patient",
        },
      });
      expect(forged.ok()).toBe(false);
    } finally {
      await staff.close();
    }
  } finally {
    await patient.close();
  }
});

test("clinic overview counters open actual scoped details and filter schedule rows", async ({
  page,
}) => {
  const staff = await page.request.post("/api/session", {
    headers: sameOrigin,
    data: { id: "staff-cedar", demo: true },
  });
  expect(staff.ok()).toBe(true);
  await page.goto("/clinic/schedule");
  const snapshot = await (await page.request.get("/api/state")).json();
  const confirmed = snapshot.bookings.filter(
    (booking: { status: string }) => booking.status === "CONFIRMED",
  );
  const available = snapshot.slots.filter(
    (slot: { status: string }) => slot.status === "AVAILABLE",
  );
  const matches = snapshot.candidates;

  const confirmedButton = page.getByRole("button", {
    name: "View confirmed appointments",
  });
  await expect(confirmedButton).toHaveAttribute("aria-expanded", "false");
  await confirmedButton.click();
  const confirmedDetails = page.getByRole("region", {
    name: "Confirmed appointments details",
  });
  await expect(confirmedDetails).toBeVisible();
  await expect(confirmedButton).toHaveAttribute("aria-expanded", "true");
  await expect(confirmedDetails.locator(".overview-detail-item")).toHaveCount(
    confirmed.length,
  );
  await expect(page.locator(".table-scroll tbody tr")).toHaveCount(
    confirmed.length,
  );

  const availableButton = page.getByRole("button", {
    name: "View available openings",
  });
  await availableButton.click();
  const availableDetails = page.getByRole("region", {
    name: "Available openings details",
  });
  await expect(availableDetails).toBeVisible();
  await expect(confirmedDetails).toHaveCount(0);
  await expect(availableDetails.locator(".overview-detail-item")).toHaveCount(
    available.length,
  );
  await expect(page.locator(".table-scroll tbody tr")).toHaveCount(
    available.length,
  );

  const matchesButton = page.getByRole("button", {
    name: "View matched waitlist requests",
  });
  await matchesButton.click();
  const matchDetails = page.getByRole("region", {
    name: "Matched waitlist requests details",
  });
  await expect(matchDetails).toBeVisible();
  await expect(matchDetails.locator(".overview-detail-item")).toHaveCount(
    matches.length,
  );
  await expect(
    matchDetails.getByRole("link", { name: "Review waitlist matches" }),
  ).toHaveAttribute("href", "/clinic/waitlists");

  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Close overview details" }).click();
  await expect(matchDetails).toHaveCount(0);
  await expect(page.locator(".table-scroll tbody tr")).toHaveCount(
    snapshot.slots.length,
  );
  await matchesButton.click();
  await matchDetails
    .getByRole("link", { name: "Review waitlist matches" })
    .click();
  await expect(page).toHaveURL(/\/clinic\/waitlists$/);
});
