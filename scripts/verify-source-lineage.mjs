import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/persistedWorkflow.test.ts";
const testName = "exposes unknown source lineage as a gap state and full lineage when known";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
if (result.status !== 0) {
  exitWithFailure("source lineage tests failed");
}
exitWithSuccess("source lineage verification passed");
