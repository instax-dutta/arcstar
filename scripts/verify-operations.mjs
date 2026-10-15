import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess } from "./lib/verification.mjs";

const dockerfile = readFileSync("apps/api/Dockerfile", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const docs = readFileSync("docs/self-hosting.md", "utf8");
const config = readFileSync("apps/api/src/config.ts", "utf8");
if (!dockerfile.includes("USER arcstar")) exitWithFailure("API container does not run non-root");
if (!compose.includes("condition: service_completed_successfully")) exitWithFailure("migrate service gate missing");
if (!compose.includes("/ready")) exitWithFailure("api healthcheck missing");
if (!docs.includes("pg_dump") || !docs.includes("Backup and restore")) exitWithFailure("backup/restore docs missing");
if (!config.includes("production mode refuses")) exitWithFailure("production credential refusal missing");

exitWithSuccess("operations verification passed");
