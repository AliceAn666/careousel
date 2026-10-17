import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };
test.beforeEach(async ({ request }) => {
  await request.post("/api/session", {
    headers,
    data: { id: "staff-cedar", demo: true },
  });
  const reset = await request.post("/api/actions", {
    headers,
    data: { type: "reset", confirmation: "RESET" },
  });
  expect(reset.ok()).toBe(true);
});
test("patient joins a linked waitlist directly from entry, with no symptoms and original protected", async ({
  page,
}, testInfo) => {
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  await page.goto("/patient");
  for (const name of ["Book an Appointment", "My Appointments & Waitlists"])
    await expect(
      page
        .locator(".patient-entry-grid")
        .getByRole("button", { name, exact: true }),
    ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Quick tour", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Tell us how you’re feeling")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("patient-entry-mobile.png"),
    fullPage: true,
  });
  await page
    .locator(".patient-entry-grid")
    .getByRole("button", { name: "My Appointments & Waitlists", exact: true })
    .click();
  await page
    .locator(".section-title")
    .getByRole("button", { name: "Find an Earlier Appointment", exact: true })
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
  await page
    .locator(".booking-card")
    .filter({ hasText: "Harbor Medical" })
    .getByRole("button", { name: "Find an Earlier Appointment" })
    .click();
  await expect(
    page.getByLabel("Existing appointment to replace (optional)"),
  ).toHaveValue("avery-original");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.user.intakeCompleted).toBe(false);
  expect(
    state.waitlists.some(
      (w: { bookingId: string }) => w.bookingId === "avery-original",
    ),
  ).toBe(true);
  expect(
    state.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  await expect(
    page.getByText("Awaiting staff review", { exact: true }),
  ).toBeVisible();
});
test("basic vaccination booking skips symptoms, health-history route stays read-only after refresh", async ({
  page,
  request,
}) => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(20, 45, 0, 0);
  const created = await request.post("/api/actions", {
    headers,
    data: {
      type: "createSlot",
      service: "Vaccination",
      start: start.toISOString(),
      price: 5000,
    },
  });
  expect(created.ok()).toBe(true);
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  await page.goto("/patient");
  await page
    .locator(".patient-entry-grid")
    .getByRole("button", { name: "Book an Appointment", exact: true })
    .click();
  await page
    .getByLabel("Specialty", { exact: true })
    .selectOption("Vaccination");
  const state = await (await page.request.get("/api/state")).json();
  const slot = state.slots.find(
    (s: { service: string }) => s.service === "Vaccination",
  );
  const opening = page.locator(`button[data-slot-id="${slot.id}"]`);
  await opening.click();
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByRole("status")).toContainText("Appointment confirmed");
  expect(
    (await (await page.request.get("/api/state")).json()).user.intakeCompleted,
  ).toBe(false);
  await page.getByRole("button", { name: "Health Information" }).click();
  await expect(page).toHaveURL(/\/health-information$/);
  await expect(
    page.getByRole("heading", {
      name: "Patient-authorized synthetic medical records",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No saved self-report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit questionnaire" }),
  ).toHaveCount(0);
  const after = await (await page.request.get("/api/state")).json();
  expect(after.user.intakeCompleted).toBe(false);
  expect(
    after.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
  expect(
    after.bookings.some(
      (b: { slotId: string; status: string }) =>
        b.slotId === slot.id && b.status === "CONFIRMED",
    ),
  ).toBe(true);
});

test("multiple appointments require choosing the original; old management links preserve identity", async ({
  page,
  request,
}, testInfo) => {
  const start = new Date(Date.now() + 2 * 86400000);
  start.setUTCHours(20, 45, 0, 0);
  const created = await request.post("/api/actions", {
    headers,
    data: {
      type: "createSlot",
      service: "Vaccination",
      start: start.toISOString(),
      price: 5000,
    },
  });
  expect(created.ok()).toBe(true);
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  const before = await (await page.request.get("/api/state")).json();
  const opening = before.slots.find(
    (s: { service: string }) => s.service === "Vaccination",
  );
  const booked = await page.request.post("/api/actions", {
    headers,
    data: { type: "book", slotId: opening.id },
  });
  expect(booked.ok()).toBe(true);
  await page.goto("/appointments");
  await expect(
    page.locator(".sidebar").getByRole("button", {
      name: "Find an Earlier Appointment",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Historical health information",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .locator(".section-title")
    .getByRole("button", { name: "Find an Earlier Appointment", exact: true })
    .click();
  const picker = page.getByRole("dialog");
  await expect(
    picker.getByRole("heading", {
      name: "Choose an appointment to bring forward",
    }),
  ).toBeVisible();
  await picker
    .getByRole("combobox", { name: /Appointment to bring forward/ })
    .selectOption("avery-original");
  await picker
    .getByRole("button", { name: "Continue with this appointment" })
    .click();
  await expect(
    page.getByLabel("Existing appointment to replace (optional)"),
  ).toHaveValue("avery-original");
  await expect(page.getByLabel("Specialty", { exact: true })).toHaveValue(
    "Dermatology",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  const afterBooking = await (await page.request.get("/api/state")).json();
  const secondBooking = afterBooking.bookings.find(
    (b: { slotId: string }) => b.slotId === opening.id,
  );
  await page
    .locator(".section-title")
    .getByRole("button", { name: "Find an Earlier Appointment", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /Appointment to bring forward/ })
    .selectOption(secondBooking.id);
  await page
    .getByRole("button", { name: "Continue with this appointment" })
    .click();
  await expect(
    page.getByLabel("Existing appointment to replace (optional)"),
  ).toHaveValue(secondBooking.id);
  await expect(page.getByLabel("Specialty", { exact: true })).toHaveValue(
    "Vaccination",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const path of ["/earlier", "/waitlists", "/needs"]) {
    await page.goto(path);
    await expect(page.locator(".sidebar .nav-item.active")).toHaveText(
      "My Appointments & Waitlists",
    );
    await expect(
      page.getByRole("heading", {
        name: "Keep your appointment while we find an earlier one",
      }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".sidebar .nav-item.active")).toHaveText(
      "My Appointments & Waitlists",
    );
    const state = await (await page.request.get("/api/state")).json();
    expect(state.user.id).toBe("avery");
    expect(
      state.bookings.find((b: { id: string }) => b.id === "avery-original")
        .status,
    ).toBe("CONFIRMED");
    expect(
      state.bookings.find((b: { slotId: string }) => b.slotId === opening.id)
        .status,
    ).toBe("CONFIRMED");
  }
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("unified-management-mobile.png"),
    fullPage: true,
  });
});

test("empty account shows booking and waitlist choices without replacement prompts", async ({
  page,
}) => {
  const credentials = {
    username: "empty.navigation",
    password: "SyntheticPassword!123",
  };
  expect(
    (
      await page.request.post("/api/auth/register", {
        headers,
        data: {
          ...credentials,
          email: "empty.navigation@example.test",
          name: "Empty Navigation",
          plan: "Blue Horizon",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: { ...credentials, entrance: "PATIENT" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/appointments");
  await expect(
    page.getByText("No appointments yet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Find an Earlier Appointment",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Book an Appointment", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Join a waitlist", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Join a waitlist", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Existing appointment to replace (optional)"),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Health Information", exact: true })
    .click();
  await expect(page).toHaveURL(/\/health-information$/);
  await page.reload();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.user.name).toBe("Empty Navigation");
  expect(state.bookings).toHaveLength(0);
});

test("earlier action on a linked booking focuses its own need without creating an unbound request", async ({
  page,
}) => {
  await page.request.post("/api/session", {
    headers,
    data: { id: "avery", demo: true },
  });
  const created = await page.request.post("/api/actions", {
    headers,
    data: {
      type: "createNeed",
      title: "Linked earlier navigation",
      service: "Dermatology",
      original: { type: "INTERNAL", bookingId: "avery-original" },
      preferences: {
        plan: "Blue Horizon",
        city: "",
        clinicIds: [],
        maxPrice: 30000,
        earliest: new Date().toISOString(),
        latest: new Date(Date.now() + 90 * 86400000).toISOString(),
        startHour: 0,
        endHour: 24,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
      requiresReferral: false,
      requiresAuthorization: false,
      tagIds: [],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  await page.goto("/appointments");
  const need = page.getByRole("article", {
    name: "Medical need Linked earlier navigation",
    exact: true,
  });
  await expect(need).toBeVisible();
  await page
    .locator(".booking-card")
    .filter({ hasText: "Harbor Medical" })
    .getByRole("button", { name: "Find an Earlier Appointment", exact: true })
    .click();
  await expect(need).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await need
    .getByRole("button", {
      name: "Find earlier — join this need’s waitlist",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "This need joined the shared cross-clinic waitlist",
  );
  await expect(need).toContainText("P1–P4 awaiting clinic review");
  const state = await (await page.request.get("/api/state")).json();
  const linkedRequests = state.waitlists.filter(
    (w: { bookingId: string }) => w.bookingId === "avery-original",
  );
  expect(linkedRequests).toHaveLength(1);
  expect(linkedRequests[0].needId).toBeTruthy();
  expect(
    state.bookings.find((b: { id: string }) => b.id === "avery-original")
      .status,
  ).toBe("CONFIRMED");
});
