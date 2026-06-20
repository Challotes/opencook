import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        // Unit suite — existing tests, runs with `npm test`
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
          globals: true,
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "src"),
          },
        },
      },
      {
        // Integration suite — new tests with in-memory SQLite, runs with `npm run test:integration`
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          globals: true,
          setupFiles: ["src/test-support/integration-setup.ts"],
          // Integration tests may hit BSV SDK which needs more time
          testTimeout: 30_000,
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "src"),
          },
        },
      },
    ],
  },
});
