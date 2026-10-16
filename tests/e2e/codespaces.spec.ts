import { test, expect } from "@playwright/test";

test("development assets accept this Codespace preview and reject unrelated previews", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue as Avery" }),
  ).toBeVisible();
  const asset = await page
    .locator('script[src*="/_next/static/"]')
    .first()
    .getAttribute("src");
  expect(asset).toBeTruthy();
  const allowed = "https://careousel-codespace-3000.app.github.dev";
  const good = await request.get(asset!, {
    headers: { origin: allowed, referer: allowed + "/" },
  });
  expect(good.status()).toBe(200);
  const bad = await request.get(asset!, {
    headers: {
      origin: "https://unrelated-3000.app.github.dev",
      referer: "https://unrelated-3000.app.github.dev/",
    },
  });
  expect(bad.status()).toBe(403);
});
