import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess } from "./lib/verification.mjs";

const readme = readFileSync("README.md", "utf8");
const protocol = readFileSync("evals/BENCHMARK_PROTOCOL.md", "utf8");
const docs = readFileSync("docs/self-hosting.md", "utf8");

if (readme.includes("users may override any score")) exitWithFailure("README still claims an override workflow");
if (!readme.includes("not yet evaluable")) exitWithFailure("README does not disclose real benchmark status");
if (!protocol.includes("Synthetic pilot output cannot make this gate pass")) exitWithFailure("benchmark protocol is missing the synthetic boundary");
if (!docs.includes("Backup and restore")) exitWithFailure("self-hosting docs are missing operations");

exitWithSuccess("doc claims verification passed");
