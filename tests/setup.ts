import "dotenv/config";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("/careousel_test"))
  throw new Error(
    "TEST_DATABASE_URL must explicitly name the isolated careousel_test database.",
  );
if (testUrl === process.env.DATABASE_URL)
  throw new Error("Test and demo database URLs must differ.");
process.env.DATABASE_URL = testUrl;
process.env.DEMO_MODE = "true";
process.env.SESSION_SECRET = "isolated-test-secret-at-least-32-characters";
