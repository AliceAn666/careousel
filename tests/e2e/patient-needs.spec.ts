import { test, expect } from "@playwright/test";
const headers = { origin: "http://localhost:3100" };
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
        data: {
          username: "needs.patient",
          email: "needs@example.test",
          name: "Independent Patient",
          password: "SyntheticPassword!123",
          plan: "Blue Horizon",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: {
          username: "needs.patient",
          password: "SyntheticPassword!123",
          entrance: "PATIENT",
        },
      })
    ).ok(),
  ).toBe(true);
});
test("patient registers and independently manages two external appointments through the UI", async ({
  page,
}) => {
  await page.goto("/needs");
  await page
    .getByText("Add an independent medical need", { exact: true })
    .click();
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Need title", { exact: true }) });
  for (const [index, title] of [
    "Skin follow-up",
    "Separate skin procedure",
  ].entries()) {
    await form.getByLabel("Need title", { exact: true }).fill(title);
    await form
      .getByRole("combobox", { name: "Need service", exact: true })
      .selectOption("Dermatology");
    await form
      .getByLabel("Original appointment source")
      .selectOption("EXTERNAL");
    await form
      .getByLabel("External clinic name")
      .fill("Reported Outside Clinic");
    await form
      .getByLabel("External clinic location")
      .fill("Patient-reported location");
    await form
      .getByLabel("External appointment date and time (UTC)")
      .fill(
        new Date(Date.now() + (30 + index) * 86400000)
          .toISOString()
          .slice(0, 16),
      );
    await form
      .getByLabel("External appointment reference (optional)")
      .fill(`OUT-${index}`);
    await form
      .getByRole("checkbox", {
        name: "I report that the external appointment is confirmed (unverified)",
        exact: true,
      })
      .check();
    await form.getByRole("button", { name: "Save independent need" }).click();
    await expect(
      page.getByRole("article", { name: `Medical need ${title}`, exact: true }),
    ).toBeVisible();
  }
  const a = page.getByRole("article", {
    name: "Medical need Skin follow-up",
    exact: true,
  });
  const b = page.getByRole("article", {
    name: "Medical need Separate skin procedure",
    exact: true,
  });
  for (const card of [a, b]) {
    await expect(card).toContainText("patient-reported, unverified");
    await card
      .getByRole("button", { name: "Find earlier — join this need’s waitlist" })
      .click();
    await expect(card).toContainText("ACTIVE");
  }
  await a.getByRole("button", { name: "Mark this need complete" }).click();
  await expect(a).toContainText("COMPLETED");
  await expect(a).toContainText("WITHDRAWN");
  await expect(b).toContainText("ACTIVE");
  const data = await (await page.request.get("/api/patient-needs")).json();
  expect(data.needs).toHaveLength(2);
  expect(
    data.needs.every(
      (n: {
        externalAppointment: {
          verification: string;
          reportedCancelled: boolean;
        };
      }) =>
        n.externalAppointment.verification === "PATIENT_REPORTED_UNVERIFIED" &&
        !n.externalAppointment.reportedCancelled,
    ),
  ).toBe(true);
  await page.reload();
  await expect(a).toContainText("COMPLETED");
  await expect(b).toContainText("ACTIVE");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("patient-needs API denies anonymous, clinical staff, foreign origin and forged priority fields", async ({
  page,
  request,
}) => {
  const data = {
    type: "completeNeed",
    needId: "not-owned",
    expectedVersion: 1,
  };
  expect(
    (
      await page.request.post("/api/patient-needs", {
        headers: { origin: "https://untrusted.example" },
        data,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/patient-needs", {
        headers,
        data: { ...data, level: "P1" },
      })
    ).status(),
  ).toBe(400);
  expect((await request.get("/api/patient-needs")).status()).toBe(403);
  await page.request.delete("/api/session", { headers });
  expect((await page.request.get("/api/patient-needs")).status()).toBe(401);
});
test("accepting a scoped invitation secures only that need and never cancels an external booking", async ({
  page,
  request,
}) => {
  const url = process.env.TEST_DATABASE_URL!;
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { db } = await import("../../src/server/db");
  const preferences = {
    plan: "Blue Horizon",
    city: "",
    clinicIds: [],
    maxPrice: 30000,
    earliest: new Date(),
    latest: new Date(Date.now() + 90 * 86400000),
    startHour: 0,
    endHour: 24,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };
  for (const [i, title] of [
    "Targeted follow-up",
    "Unrelated follow-up",
  ].entries()) {
    const start = new Date(Date.now() + (30 + i) * 86400000);
    expect(
      (
        await page.request.post("/api/patient-needs", {
          headers,
          data: {
            type: "createNeed",
            title,
            service: "Vaccination",
            preferences,
            requiresReferral: title === "Targeted follow-up",
            requiresAuthorization: false,
            tagIds: [],
            original: {
              type: "EXTERNAL",
              appointment: {
                clinicName: "Reported Outside Clinic",
                start,
                end: new Date(+start + 1800000),
                location: "Synthetic",
                reference: `ACCEPT-${i}`,
                reportedConfirmed: true,
              },
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  const initial = await (await page.request.get("/api/patient-needs")).json();
  for (const [i, n] of initial.needs.entries()) {
    expect(
      (
        await page.request.post("/api/patient-needs", {
          headers,
          data: {
            type: "requestNeed",
            needId: n.id,
            expectedVersion: n.version,
          },
        })
      ).ok(),
    ).toBe(true);
    const w = await db.waitlist.findFirstOrThrow({
      where: { needId: n.id, status: "ACTIVE" },
    });
    await db.slot.create({
      data: {
        id: `need-browser-${i}`,
        clinicId: "cedar",
        service: "Vaccination",
        provider: "Synthetic clinician",
        start: new Date(Date.now() + (7 + i) * 86400000),
        end: new Date(Date.now() + (7 + i) * 86400000 + 1800000),
        price: 1000,
        plans: ["Blue Horizon"],
        status: "AVAILABLE",
      },
    });
    await request.get("/api/state");
    if (n.requiresReferral)
      expect(
        (
          await request.post("/api/actions", {
            headers,
            data: {
              type: "setWaitlistPriority",
              waitlistId: w.id,
              clinicId: "cedar",
              level: "P3",
              expectedVersion: 0,
              referralApproved: true,
              authorizationApproved: false,
              reason: "Authorized staff reviewed this need’s referral",
            },
          })
        ).ok(),
      ).toBe(true);
    expect(
      (
        await request.post("/api/actions", {
          headers,
          data: {
            type: "approve",
            waitlistId: w.id,
            slotId: `need-browser-${i}`,
            reason: "Staff-reviewed synthetic invitation",
          },
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto("/notifications");
  const first = page
    .locator(".card")
    .filter({ hasText: "Medical need: Targeted follow-up" })
    .filter({
      has: page.getByRole("button", { name: "Accept earlier appointment" }),
    });
  await expect(first).toContainText("unverified");
  await expect(first).toContainText("Referral: required; clinic-reviewed");
  page.once("dialog", (d) => d.accept());
  await first
    .getByRole("button", { name: "Accept earlier appointment" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Earlier appointment confirmed" }),
  ).toBeVisible();
  await page.goto("/needs");
  await expect(
    page.getByRole("article", {
      name: "Medical need Targeted follow-up",
      exact: true,
    }),
  ).toContainText("SECURED");
  await expect(
    page.getByRole("article", {
      name: "Medical need Targeted follow-up",
      exact: true,
    }),
  ).toContainText("Careousel has not cancelled it");
  await expect(
    page.getByRole("article", {
      name: "Medical need Unrelated follow-up",
      exact: true,
    }),
  ).toContainText("ACTIVE");
  expect(
    await db.offer.count({
      where: {
        waitlist: {
          needId: initial.needs.find(
            (n: { title: string }) => n.title === "Unrelated follow-up",
          ).id,
        },
        status: "PENDING",
      },
    }),
  ).toBe(1);
  await db.$disconnect();
});
test("incompatible clinic stays visible with a warning while booking remains protected", async ({
  page,
}) => {
  const url = process.env.TEST_DATABASE_URL!;
  process.env.DATABASE_URL = url;
  process.env.DEMO_MODE = "true";
  const { db } = await import("../../src/server/db");
  await db.slot.create({
    data: {
      id: "incompatible-need-opening",
      clinicId: "cedar",
      service: "Vaccination",
      provider: "Synthetic",
      start: new Date(Date.now() + 7 * 86400000),
      end: new Date(Date.now() + 7 * 86400000 + 1800000),
      price: 1000,
      plans: ["Other Plan"],
      status: "AVAILABLE",
    },
  });
  const preferences = {
    plan: "Blue Horizon",
    city: "",
    clinicIds: [],
    maxPrice: 30000,
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
          title: "Visible clinic warning",
          service: "Vaccination",
          preferences,
          requiresReferral: false,
          requiresAuthorization: false,
          tagIds: [],
          original: { type: "NONE" },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/needs");
  const card = page.getByRole("article", {
    name: "Medical need Visible clinic warning",
    exact: true,
  });
  await card
    .getByRole("button", { name: "Browse appointments for this need" })
    .click();
  const incompatible = card.locator(
    '[data-slot-id="incompatible-need-opening"]',
  );
  await expect(
    incompatible.getByText("Insurance plan not listed — confirm coverage", {
      exact: true,
    }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/actions") && r.request().method() === "POST",
  );
  await incompatible
    .getByRole("button", { name: "Book for this need" })
    .click();
  expect((await response).status()).toBe(409);
  expect(
    await db.booking.count({ where: { slotId: "incompatible-need-opening" } }),
  ).toBe(0);
  await incompatible
    .getByRole("checkbox", {
      name: /I acknowledge the full listed self-pay demo price/,
    })
    .check();
  await incompatible
    .getByRole("button", { name: "Book for this need" })
    .click();
  await expect(card).toContainText("SECURED");
  expect(
    await db.booking.count({ where: { slotId: "incompatible-need-opening" } }),
  ).toBe(1);
  await db.$disconnect();
});
