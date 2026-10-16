import { test, expect } from "@playwright/test";
test("foundation remains navigable at mobile width with a visible demo boundary", async ({ page }) => {
 await page.setViewportSize({ width: 375, height: 812 });
 await page.goto("/");
 await expect(page.getByRole("main")).toBeVisible();
 await expect(page.getByText("Synthetic demo · No real patient data")).toBeVisible();
 await expect(page.getByRole("button", { name: "Demo access coming soon" })).toBeDisabled();
 await page.keyboard.press("Tab");
 await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
