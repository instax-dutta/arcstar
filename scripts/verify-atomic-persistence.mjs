import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess, run } from "./lib/verification.mjs";

const sources = [
  "apps/api/src/repositories/postgres.ts",
  "apps/api/src/repositories/postgresClaim.ts",
  "apps/api/src/repositories/postgresClaimEvidence.ts",
];
for (const path of sources) {
  const source = readFileSync(path, "utf8");
  if (!source.includes("runInTransaction") && !source.includes("sql.transaction")) {
    exitWithFailure(`transaction boundary missing in ${path}`);
  }
}

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
if (!workflow.includes("name: PostgreSQL integration")) {
  exitWithFailure("PostgreSQL integration CI job missing");
}

const dependency = readFileSync("apps/api/src/dataLayer.ts", "utf8");
if (!dependency.includes("BEGIN")) exitWithFailure("PostgreSQL transaction helper missing");

exitWithSuccess("atomic persistence verification passed");
