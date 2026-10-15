import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const file = "src/app.test.ts";
const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file]);
if (result.status !== 0) exitWithFailure("experimental boundary tests failed");

const source = readFileSync("apps/api/src/app.ts", "utf8");
if (!source.includes("experimental: true") || !source.includes("graphProvidedByClient: true")) {
  exitWithFailure("experimental markers missing in API");
}
exitWithSuccess("experimental boundary verification passed");
