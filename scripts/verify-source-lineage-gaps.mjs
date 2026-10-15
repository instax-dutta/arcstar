import { exitWithSuccess, run } from "./lib/verification.mjs";

const targets = [
  ["src/repositories.test.ts", "records unknown source lineage as a gap and resolves it when the source appears"],
  ["src/persistedWorkflow.test.ts", "exposes unknown source lineage as a gap state"],
];

for (const [file, testName] of targets) {
  const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
  if (result.status !== 0) {
    console.error(`source lineage gap verification failed for ${file}:${testName}`);
    process.exit(1);
  }
}

exitWithSuccess("source lineage gap verification passed");
