import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const result = run("pnpm", ["--filter", "@arcstar/graph", "test"]);
if (result.status !== 0) {
  exitWithFailure("graph safety tests failed");
}
exitWithSuccess("graph safety verification passed");
