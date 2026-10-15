import { exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/persistedWorkflow.test.ts";
const testName = "answers scenarios from a server-owned snapshot";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
if (result.status !== 0) {
  console.error("scenario snapshot verification failed");
  process.exit(1);
}

exitWithSuccess("scenario snapshot verification passed");
