import { test, expect } from "./demo-fixture";
const headers = { origin: "http://localhost:3100" };

test("two independent browsers retain shared waitlist and atomically reschedule", async ({
  browser,
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
        data: { type: "reset", confirmation: "RESET" },
      })
    ).ok(),
  ).toBe(true);
  const patient = await browser.newContext();
  const clinic = await browser.newContext();
  try {
    for (const context of [patient, clinic])
      await context.request.post("/api/demo/context", {
        headers,
        data: { confirm: true },
      });
    const p = await patient.newPage(),
      c = await clinic.newPage();
    await p.goto("/");
    await p
      .getByRole("button", { name: "Find Care", exact: true })
      .first()
      .click();

    await p
      .getByRole("button", { name: "Join a waitlist", exact: true })
      .click();
    await p
      .getByLabel("Existing appointment to replace (optional)")
      .selectOption("avery-original");
    await p.getByRole("button", { name: "Join waitlist", exact: true }).click();
    const before = await (await patient.request.get("/api/state")).json();
    const need = before.waitlists.find(
      (w: { bookingId: string }) => w.bookingId === "avery-original",
    );
    expect(need).toBeTruthy();
    await c.goto("/");
    await c.getByRole("button", { name: "Open clinic demo" }).click();
    await expect(c).toHaveURL(/\/clinic\/schedule$/);
    await c.reload();
    await expect(c).toHaveURL(/\/clinic\/schedule$/);
    const retained = await (await patient.request.get("/api/state")).json();
    expect(
      retained.waitlists.some((w: { id: string }) => w.id === need.id),
    ).toBe(true);
    expect(retained.user.intakeCompleted).toBe(false);
    c.once("dialog", (d) => d.accept());
    await c
      .getByRole("row")
      .filter({ hasText: "Jordan Lee" })
      .getByRole("button", { name: "Cancel & release" })
      .click();
    await c
      .getByRole("button", { name: "Waitlist Management", exact: true })
      .click();
    c.once("dialog", (d) =>
      d.accept("Reviewed synthetic scheduling eligibility"),
    );
    await c
      .locator("article.candidate")
      .filter({ hasText: "Avery Morgan" })
      .getByText("Legacy single-patient invitation", { exact: true })
      .click();
    await c
      .locator("article.candidate")
      .filter({ hasText: "Avery Morgan" })
      .getByRole("button", { name: "Approve & send offer" })
      .click();
    await expect(c.getByRole("status")).toContainText("Invitation sent");
    await p.reload();
    await p.getByRole("button", { name: /^Notifications/ }).click();
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Accept earlier appointment" }).click();
    await expect(p.getByRole("status")).toContainText(
      "Earlier appointment confirmed",
    );
    const after = await (await patient.request.get("/api/state")).json();
    const old = after.bookings.find(
      (b: { id: string }) => b.id === "avery-original",
    );
    const next = after.bookings.find(
      (b: { slotId: string; status: string }) =>
        b.slotId === "earlier" && b.status === "CONFIRMED",
    );
    expect(old.status).toBe("RESCHEDULED");
    expect(old.replacementId).toBe(next.id);
    await c.reload();
    await expect(c.getByLabel("Switch demo persona")).toHaveValue(
      "staff-cedar",
    );
    expect(
      (await (await clinic.request.get("/api/state")).json()).bookings.some(
        (b: { id: string }) => b.id === next.id,
      ),
    ).toBe(true);
    await p.getByRole("button", { name: "Careousel home page" }).click();
    await p
      .getByRole("button", { name: "Find Care", exact: true })
      .first()
      .click();
    expect(
      (await (await patient.request.get("/api/state")).json()).bookings.some(
        (b: { id: string }) => b.id === next.id,
      ),
    ).toBe(true);
  } finally {
    await patient.close();
    await clinic.close();
  }
});

test("both reset routes require session, staff, confirmation and same origin", async ({
  request,
}) => {
  for (const path of ["/api/demo/restart", "/api/actions"]) {
    const data = path.endsWith("restart")
      ? { confirmation: "RESET" }
      : { type: "reset", confirmation: "RESET" };
    await request.delete("/api/session", { headers });
    expect((await request.post(path, { headers, data })).status()).toBe(401);
    await request.post("/api/session", {
      headers,
      data: { id: "avery", demo: true },
    });
    expect((await request.post(path, { headers, data })).status()).toBe(403);
    await request.post("/api/session", {
      headers,
      data: { id: "staff-cedar", demo: true },
    });
    expect(
      (
        await request.post(path, {
          headers,
          data: { ...data, confirmation: "WRONG" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(path, {
          headers: { origin: "https://wrong.example" },
          data,
        })
      ).status(),
    ).toBe(403);
    expect((await request.post(path, { headers, data })).ok()).toBe(true);
  }
});
