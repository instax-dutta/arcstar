import { readFileSync } from "node:fs";
import { exitWithFailure, exitWithSuccess } from "./lib/verification.mjs";

const migration = readFileSync("migrations/0007_schema_constraints.sql", "utf8");
if (!migration.includes("entity_entity_type_allowed")) exitWithFailure("entity type constraint missing");
if (!migration.includes("dependency_edge_relation_type_allowed")) exitWithFailure("relation type constraint missing");

const integration = readFileSync("apps/api/src/integration/postgres.integration.test.ts", "utf8");
if (!integration.includes("rejects enum values that violate the contract")) exitWithFailure("database constraint test missing");

exitWithSuccess("schema contract verification passed");
