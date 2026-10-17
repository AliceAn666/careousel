import { test as base, expect } from "@playwright/test";
// Existing journeys deliberately exercise synthetic Demo Mode. New account
// journeys import the ordinary Playwright test and never opt into this fixture.
export const test = base.extend<{ explicitDemo: void }>({
  explicitDemo: [
    async ({ page, request }, use) => {
      for (const client of [page.request, request])
        expect(
          (
            await client.post("/api/demo/context", {
              headers: { origin: "http://localhost:3100" },
              data: { confirm: true },
            })
          ).ok(),
        ).toBe(true);
      await use();
    },
    { auto: true },
  ],
});
export { expect };

export type { Page } from "@playwright/test";
