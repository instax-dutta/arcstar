import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Deliberately single-threaded. The suites are small (tens of tests), so
    // wall-clock cost is negligible, and it keeps test runs to roughly one core.
    // Property tests are CPU-bound and would otherwise saturate every worker.
    maxWorkers: 1,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
