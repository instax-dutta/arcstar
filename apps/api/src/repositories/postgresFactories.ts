import type { SqlClient } from "./postgres.js";
import { PostgresAssessmentRepository } from "./postgresAssessment.js";
import { PostgresClaimEvidenceRepository } from "./postgresClaimEvidence.js";
import { PostgresClaimRepository } from "./postgresClaim.js";
import { PostgresEdgeRepository } from "./postgresEdge.js";
import { PostgresEntityRepository } from "./postgresEntity.js";
import { PostgresSourceRepository } from "./postgres.js";
import type { Repositories } from "./types.js";

export function createPostgresRepositories(sql: SqlClient): Repositories {
  return {
    sources: new PostgresSourceRepository(sql),
    entities: new PostgresEntityRepository(sql),
    claims: new PostgresClaimRepository(sql),
    claimEvidence: new PostgresClaimEvidenceRepository(sql),
    edges: new PostgresEdgeRepository(sql),
    assessments: new PostgresAssessmentRepository(sql),
  };
}
