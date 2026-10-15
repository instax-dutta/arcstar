import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const real = run("pnpm", ["run", "eval:real"]);
if (real.status === 0 || !real.combined.includes("not-yet-evaluable")) {
  exitWithFailure("real benchmark gate did not fail closed");
}

const smoke = run("pnpm", ["run", "eval:smoke"]);
if (smoke.status !== 0 || !smoke.combined.includes("Pilot only")) {
  exitWithFailure("synthetic benchmark smoke did not stay labeled as a smoke test");
}

exitWithSuccess("benchmark gate verification passed");
