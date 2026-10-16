import { defineConfig } from "vitest/config";
import "dotenv/config";
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
