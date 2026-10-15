import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", "src/ingestion.test.ts"]);
if (result.status !== 0) exitWithFailure("ingestion identity tests failed");
exitWithSuccess("ingestion identity verification passed");
