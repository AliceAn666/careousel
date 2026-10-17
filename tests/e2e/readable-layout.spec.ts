import { test, expect } from "@playwright/test";

test("public pages and account forms use readable type and avoid page overflow", async ({
  page,
}) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("/");
    const home = await page.evaluate(() => ({
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      body: parseFloat(getComputedStyle(document.body).fontSize),
      fits: document.documentElement.scrollWidth <= innerWidth,
    }));
    expect(home.root).toBeGreaterThanOrEqual(18);
    expect(home.body).toBeGreaterThanOrEqual(18);
    expect(home.fits).toBe(true);

    await page.goto("/login/patient");
    const form = await page.locator("form").evaluate((node) => ({
      gap: parseFloat(getComputedStyle(node).rowGap),
    }));
    expect(form.gap).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole("heading", { name: "Patient Login" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
});
