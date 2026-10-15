import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess } from "./lib/verification.mjs";

const source = readFileSync("apps/web/src/App.tsx", "utf8");
const checks = [
  "AbortController",
  "scenarioRequestRef.current",
  "evidenceRequestRef.current",
  "requestId !== scenarioRequestRef.current",
  "requestId !== evidenceRequestRef.current",
  "Scenario request failed:",
];

for (const needle of checks) {
  if (!source.includes(needle)) exitWithFailure(`web race safety check missing: ${needle}`);
}

exitWithSuccess("web race safety verification passed");
