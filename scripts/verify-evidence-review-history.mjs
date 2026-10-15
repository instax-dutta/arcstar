import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/persistedWorkflow.test.ts";
const testName = "keeps an auditable history when a review changes status";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
if (result.status !== 0) exitWithFailure("evidence review history test failed");
exitWithSuccess("evidence review history verification passed");
