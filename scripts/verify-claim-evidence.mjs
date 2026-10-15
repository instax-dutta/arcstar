import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const targets = [
  ["src/repositories.test.ts", "preserves evidence through claim upserts"],
  ["src/persistedWorkflow.test.ts", "stores evidence without deleting prior claim or evidence"],
];

for (const [file, testName] of targets) {
  const result = run("pnpm", ["--filter", "@arcstar/api", "exec", "vitest", "run", file, "-t", testName]);
  if (result.status !== 0) {
    console.error(`claim evidence verification failed for ${file}:${testName}`);
    process.exit(1);
  }
}

exitWithSuccess("claim evidence verification passed");
