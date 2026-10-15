import { exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/persistedWorkflow.test.ts";
const testName = "limits repeated scenario requests";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
if (result.status !== 0) {
  console.error("rate limit verification failed");
  process.exit(1);
}

exitWithSuccess("rate limit verification passed");
