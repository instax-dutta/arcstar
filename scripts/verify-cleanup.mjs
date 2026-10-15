import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess } from "./lib/verification.mjs";

function read(path) {
  return readFileSync(path, "utf8");
}

const forbidden = [
  ["apps/api/package.json", "start:tsx"],
  [".env.example", "LOG_LEVEL"],
  ["docs/self-hosting.md", "| `LOG_LEVEL` |"],
];

const required = [
  ["README.md", "/scenarios/:node"],
  ["README.md", "/claims/:id/evidence"],
  ["docs/self-hosting.md", "RATE_LIMIT_MAX"],
  ["docs/self-hosting.md", "DATABASE_URL"],
];

for (const [path, needle] of forbidden) {
  if (read(path).includes(needle)) {
    exitWithFailure(`cleanup verification failed: ${path} still contains ${needle}`);
  }
}

for (const [path, needle] of required) {
  if (!read(path).includes(needle)) {
    exitWithFailure(`cleanup verification failed: ${path} does not document ${needle}`);
  }
}

exitWithSuccess("cleanup verification passed");
