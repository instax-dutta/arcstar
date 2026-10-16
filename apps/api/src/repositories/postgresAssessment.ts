import { AssessmentSchema, type Assessment } from "@arcstar/contracts";
import type { AssessmentRepository } from "./types.js";
import { readStoredDate, type SqlClient } from "./postgres.js";
import { assessmentId } from "../assessment.js";

interface AssessmentRow {
  claim_id: string;
  method_version: string;
  assessed_at: Date | string;
  score: number;
  explanation: unknown;
  input_snapshot_ref: string;
  input_snapshot: unknown;
}

function reviveSnapshotDates(snapshot: unknown): unknown {
  const raw = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  return JSON.parse(JSON.stringify(raw), (key, value) =>
    typeof value === "string" && (key === "assertedAt" || key === "publishedAt") ? new Date(value) : value,
  );
}

export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(private readonly sql: SqlClient) {}

  async append(assessment: Assessment): Promise<void> {
    await this.sql.query(
      `INSERT INTO assessment (
         id, claim_id, method_version, assessed_at,
         input_snapshot_ref, score, explanation, contradiction, input_snapshot
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         score = EXCLUDED.score,
         explanation = EXCLUDED.explanation,
         contradiction = EXCLUDED.contradiction,
         input_snapshot = EXCLUDED.input_snapshot`,
      [
        assessmentId(assessment),
        assessment.claimId,
        assessment.score.methodVersion,
        assessment.assessedAt,
        assessment.inputSnapshotRef,
        assessment.score.value,
        JSON.stringify(assessment.explanation),
        JSON.stringify(assessment.explanation.contradiction),
        JSON.stringify(assessment.inputSnapshot),
      ],
    );
  }

  async getLatest(claimId: string): Promise<Assessment | undefined> {
    const result = await this.sql.query<AssessmentRow>(
      `SELECT claim_id, method_version, assessed_at, score, explanation, input_snapshot_ref, input_snapshot
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
      `SELECT claim_id, method_version, assessed_at, score, explanation, input_snapshot_ref, input_snapshot
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
      assessedAt: readStoredDate(row.assessed_at, "assessed_at"),
      inputSnapshotRef: row.input_snapshot_ref,
      inputSnapshot: reviveSnapshotDates(row.input_snapshot),
    });
  }
}
