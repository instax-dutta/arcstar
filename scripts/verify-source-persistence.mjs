import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", "src/repositories/postgres.test.ts"]);
if (result.status !== 0) {
  exitWithFailure("source persistence tests failed");
}
exitWithSuccess("source persistence verification passed");
