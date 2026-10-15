import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const stale = [
  ["apps/api/package.json", "start:tsx"],
  [".env.example", "LOG_LEVEL"],
  ["apps/api/src/repositories/postgresClaim.ts", "whereSql"],
];
for (const [path, needle] of stale) {
  if (readFileSync(path, "utf8").includes(needle)) exitWithFailure(`cleanup check failed: ${path} still contains ${needle}`);
}

const readme = readFileSync("README.md", "utf8");
if (!readme.includes("| GET | `/ready`")) exitWithFailure("README is missing readiness documentation");

const check = run("pnpm", ["check"]);
if (check.status !== 0) exitWithFailure("repository checks failed");

exitWithSuccess("scale cleanup verification passed");
