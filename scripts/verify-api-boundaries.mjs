import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const appTests = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", "src/app.test.ts"]);
if (appTests.status !== 0) exitWithFailure("api boundary tests failed");

const rateTests = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", "src/rateLimit.test.ts"]);
if (rateTests.status !== 0) exitWithFailure("rate limit trust tests failed");

const app = readFileSync("apps/api/src/app.ts", "utf8");
if (!app.includes('app.get("/ready"')) exitWithFailure("readiness route missing");

exitWithSuccess("api boundary verification passed");
