import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const extraction = run("pnpm", ["--filter", "@arcstar/extraction", "test"]);
if (extraction.status !== 0) exitWithFailure("extraction tests failed");

const smoke = run("pnpm", ["--filter", "@arcstar/evals", "eval:extraction-smoke"]);
if (smoke.status !== 0) exitWithFailure("extraction smoke benchmark failed");

exitWithSuccess("extraction quality verification passed");
