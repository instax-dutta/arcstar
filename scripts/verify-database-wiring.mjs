import { exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/persistedWorkflow.test.ts";
const testName = "selects the postgres repository store when DATABASE_URL is set";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
if (result.status !== 0) {
  console.error("database wiring verification failed");
  process.exit(1);
}

exitWithSuccess("database wiring verification passed");
