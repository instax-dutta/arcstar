import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // This package is the moat. It gets the strictest gates in the repo and
    // runs property tests far harder than the suite size suggests, so the
    // default 5s timeout is too tight for a cold run.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html"],
      thresholds: {
        // The credibility engine is pure arithmetic with no I/O to cover, so
        // these should stay at or near 100. A drop here means untested logic,
        // not unreachable code.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
