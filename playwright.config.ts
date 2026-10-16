import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";
import { existsSync } from "node:fs";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("/careousel_test") ||
  url === process.env.DATABASE_URL
)
  throw new Error("Use isolated TEST_DATABASE_URL for browser tests.");
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
            (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: url,
      DEMO_MODE: "true",
      SESSION_SECRET: "browser-test-secret-at-least-32-characters",
    },
    timeout: 120000,
  },
});
