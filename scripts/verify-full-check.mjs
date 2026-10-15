import { exitWithSuccess, run } from "./lib/verification.mjs";

const commands = [
  ["pnpm", ["check"]],
  ["pnpm", ["eval"]],
  ["node", ["scripts/check-purity.mjs", "packages/credibility"]],
];

for (const [command, args] of commands) {
  const result = run(command, args);
  if (result.status !== 0) {
    console.error(`full check verification failed: ${command} ${args.join(" ")}`);
    process.exit(1);
  }
}

exitWithSuccess("full check verification passed");
