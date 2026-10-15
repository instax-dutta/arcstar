import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const data = readFileSync("apps/api/src/data/maritime.ts", "utf8");
const app = readFileSync("apps/api/src/app.ts", "utf8");
const readme = readFileSync("README.md", "utf8");
for (const needle of ["evidenceStatus: \"seeded-unverified\"", "scenarioKind: \"hypothetical-disruption\""]) {
  if (!data.includes(needle) && !app.includes(needle)) exitWithFailure(`seed disclosure missing: ${needle}`);
}
if (!readme.includes("real benchmark remains")) exitWithFailure("README does not disclose benchmark status");

exitWithSuccess("seed disclosure verification passed");
