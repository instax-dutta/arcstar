import { exitWithSuccess, run } from "./lib/verification.mjs";

const targets = [
  ["src/persistedWorkflow.test.ts", "returns a claim, its evidence, and a reproducible assessment"],
  ["src/repositories/postgresAssessment.test.ts", "reads the latest row and its input snapshot"],
];

for (const [file, testName] of targets) {
  const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
  if (result.status !== 0) {
    console.error(`assessment snapshot verification failed for ${file}:${testName}`);
    process.exit(1);
  }
}

exitWithSuccess("assessment snapshot verification passed");
