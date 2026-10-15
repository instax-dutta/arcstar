import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const edgeTest = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", "src/repositories/postgresEdge.test.ts"]);
if (edgeTest.status !== 0) exitWithFailure("temporal edge tests failed");

const asOfTest = run("pnpm", ["--filter", "@arcstar/graph", "exec", "vitest", "run", "src/asof.test.ts"]);
if (asOfTest.status !== 0) exitWithFailure("as-of graph tests failed");

exitWithSuccess("temporal edge verification passed");
