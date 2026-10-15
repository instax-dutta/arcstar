import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/persistedWorkflow.test.ts";
const testName = "returns stable snapshot IDs for the same explicit graph query";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
if (result.status !== 0) exitWithFailure("snapshot id stability test failed");
exitWithSuccess("snapshot id verification passed");
