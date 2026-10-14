import { AssessmentSchema, type Assessment } from "@arcstar/contracts";
import type { AssessmentRepository } from "./types.js";
import type { SqlClient } from "./postgres.js";

interface AssessmentRow {
  claim_id: string;
  method_version: string;
  assessed_at: Date | string;
  score: number;
  explanation: unknown;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(private readonly sql: SqlClient) {}

  async append(assessment: Assessment): Promise<void> {
    await this.sql.query(
      `INSERT INTO assessment (id, claim_id, method_version, assessed_at, input_snapshot_ref, score, explanation, contradiction)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         score = EXCLUDED.score,
         explanation = EXCLUDED.explanation,
         contradiction = EXCLUDED.contradiction`,
      [
        `${assessment.claimId}:${assessment.assessedAt.toISOString()}`,
        assessment.claimId,
        assessment.score.methodVersion,
        assessment.assessedAt,
        assessment.claimId,
        assessment.score.value,
        JSON.stringify(assessment.explanation),
        JSON.stringify(assessment.explanation.contradiction),
      ],
    );
  }

  async getLatest(claimId: string): Promise<Assessment | undefined> {
    const result = await this.sql.query<AssessmentRow>(
      `SELECT claim_id, method_version, assessed_at, score, explanation
       FROM assessment
       WHERE claim_id = $1
       ORDER BY assessed_at DESC
       LIMIT 1`,
      [claimId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return this.toAssessment(row);
  }

  async list(claimId: string): Promise<Assessment[]> {
    const result = await this.sql.query<AssessmentRow>(
      `SELECT claim_id, method_version, assessed_at, score, explanation
       FROM assessment
       WHERE claim_id = $1
       ORDER BY assessed_at ASC`,
      [claimId],
    );
    return result.rows.map((row) => this.toAssessment(row));
  }

  private toAssessment(row: AssessmentRow): Assessment {
    return AssessmentSchema.parse({
      claimId: row.claim_id,
      score: { value: row.score, methodVersion: row.method_version },
      explanation: row.explanation,
      assessedAt: toDate(row.assessed_at),
    });
  }
}
