import { defineConfig } from "vitest/config";
// No database suites yet. Never substitute an in-memory database for PostgreSQL.
export default defineConfig({ test: { include: ["tests/integration/**/*.test.ts"], passWithNoTests: false } });
