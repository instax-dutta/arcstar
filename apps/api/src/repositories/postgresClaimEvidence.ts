import { createHash } from "node:crypto";
import { ClaimEvidenceSchema, type ClaimEvidence } from "@arcstar/contracts";
import type { ClaimEvidenceRepository } from "./types.js";
import type { SqlClient } from "./postgres.js";

interface ClaimEvidenceRow {
  claim_id: string;
  source_id: string;
  stance: string;
  passage: string | null;
  passage_start: number | null;
  passage_end: number | null;
  method_version: string | null;
  status: string;
}

function evidenceId(evidence: ClaimEvidence): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        evidence.claimId,
        evidence.sourceId,
        evidence.stance,
        evidence.passage ?? null,
        evidence.passageStart ?? null,
        evidence.passageEnd ?? null,
        evidence.methodVersion ?? null,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
  return `evidence-${digest}`;
}

/**
 * Claim evidence is the object under review. The deterministic id keeps repeated
 * analyst Corrections idempotent, while the passage fields preserve the evidence
 * text span through read/write cycles.
 */
export class PostgresClaimEvidenceRepository implements ClaimEvidenceRepository {
  constructor(private readonly sql: SqlClient) {}

  async upsert(evidence: ClaimEvidence): Promise<void> {
    await this.sql.query(
      `INSERT INTO claim_evidence (
         id, claim_id, source_id, stance, passage,
         passage_start, passage_end, method_version, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         passage = EXCLUDED.passage,
         passage_start = EXCLUDED.passage_start,
         passage_end = EXCLUDED.passage_end,
         method_version = EXCLUDED.method_version,
         status = EXCLUDED.status`,
      [
        evidenceId(evidence),
        evidence.claimId,
        evidence.sourceId,
        evidence.stance,
        evidence.passage ?? null,
        evidence.passageStart ?? null,
        evidence.passageEnd ?? null,
        evidence.methodVersion ?? null,
        evidence.status,
      ],
    );
  }

  async list(claimId: string): Promise<ClaimEvidence[]> {
    const result = await this.sql.query<ClaimEvidenceRow>(
      `SELECT claim_id, source_id, stance, passage, passage_start, passage_end, method_version, status
       FROM claim_evidence
       WHERE claim_id = $1
       ORDER BY source_id, stance`,
      [claimId],
    );
    return result.rows.map((row) =>
      ClaimEvidenceSchema.parse({
        claimId: row.claim_id,
        sourceId: row.source_id,
        stance: row.stance,
        passage: row.passage ?? undefined,
        passageStart: row.passage_start ?? undefined,
        passageEnd: row.passage_end ?? undefined,
        methodVersion: row.method_version ?? undefined,
        status: row.status,
      }),
    );
  }
}
