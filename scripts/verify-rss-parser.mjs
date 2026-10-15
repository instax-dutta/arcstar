import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", "src/adapters/rss.test.ts"]);
if (result.status !== 0) exitWithFailure("rss parser tests failed");
exitWithSuccess("rss parser verification passed");
