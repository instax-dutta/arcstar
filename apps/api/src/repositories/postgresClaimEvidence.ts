import { createHash } from "node:crypto";
import {
  ClaimEvidenceSchema,
  ClaimEvidenceReviewSchema,
  type ClaimEvidence,
  type ClaimEvidenceReview,
} from "@arcstar/contracts";
import type { ClaimEvidenceRepository } from "./types.js";
import type { SqlClient, TransactionalSqlClient } from "./postgres.js";

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

interface ClaimEvidenceReviewRow {
  claim_id: string;
  source_id: string;
  stance: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  reason: string | null;
  reviewed_at: Date | string;
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
    .slice(0, 40);
  return `evidence-${digest}`;
}

function reviewId(review: ClaimEvidenceReview, reviewedAt: Date): string {
  return `review-${createHash("sha256")
    .update(
      JSON.stringify([
        review.claimId,
        review.sourceId,
        review.stance,
        review.fromStatus ?? null,
        review.toStatus,
        review.actor,
        review.reason ?? null,
        reviewedAt.toISOString(),
      ]),
    )
    .digest("hex")
    .slice(0, 40)}`;
}

export class PostgresClaimEvidenceRepository implements ClaimEvidenceRepository {
  constructor(private readonly sql: SqlClient) {}

  private async runInTransaction(work: (tx: TransactionalSqlClient) => Promise<void>): Promise<void> {
    if (this.sql.transaction) {
      await this.sql.transaction(work);
      return;
    }
    await work(this.sql);
  }

  async upsert(evidence: ClaimEvidence): Promise<void> {
    await this.upsertMany([evidence]);
  }

  async upsertMany(evidence: readonly ClaimEvidence[]): Promise<void> {
    if (evidence.length === 0) return;
    await this.runInTransaction(async (tx) => {
      for (const item of evidence) {
        await tx.query(
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
            evidenceId(item),
            item.claimId,
            item.sourceId,
            item.stance,
            item.passage ?? null,
            item.passageStart ?? null,
            item.passageEnd ?? null,
            item.methodVersion ?? null,
            item.status,
          ],
        );
      }
    });
  }

  async list(claimId: string): Promise<ClaimEvidence[]> {
    const result = await this.sql.query<ClaimEvidenceRow>(
      `SELECT claim_id, source_id, stance, passage, passage_start, passage_end, method_version, status
       FROM claim_evidence
       WHERE claim_id = $1
       ORDER BY source_id, stance`,
      [claimId],
    );
    return result.rows.map((row) => this.toEvidence(row));
  }

  async listReviews(claimId: string): Promise<ClaimEvidenceReview[]> {
    const result = await this.sql.query<ClaimEvidenceReviewRow>(
      `SELECT claim_id, source_id, stance, from_status, to_status, actor, reason, reviewed_at
       FROM claim_evidence_review
       WHERE claim_id = $1
       ORDER BY reviewed_at ASC`,
      [claimId],
    );
    return result.rows.map((row) =>
      ClaimEvidenceReviewSchema.parse({
        claimId: row.claim_id,
        sourceId: row.source_id,
        stance: row.stance,
        fromStatus: row.from_status ?? undefined,
        toStatus: row.to_status,
        actor: row.actor,
        reason: row.reason ?? undefined,
        reviewedAt: new Date(row.reviewed_at),
      }),
    );
  }

  async applyReview(review: ClaimEvidenceReview): Promise<ClaimEvidenceReview[]> {
    await this.runInTransaction(async (tx) => {
      const matching = await tx.query<ClaimEvidenceRow>(
        `SELECT claim_id, source_id, stance, passage, passage_start, passage_end, method_version, status
         FROM claim_evidence
         WHERE claim_id = $1 AND source_id = $2 AND stance = $3
         ORDER BY passage_start NULLS FIRST`,
        [review.claimId, review.sourceId, review.stance],
      );

      if (matching.rows.length === 0) throw new Error("cannot review evidence that does not exist");
      const fromStatus = matching.rows[0]?.status;
      const reviewedAt = review.reviewedAt ?? new Date();

      for (const row of matching.rows) {
        const evidence = this.toEvidence(row);
        await tx.query(
          `UPDATE claim_evidence
           SET status = $1, method_version = $2
           WHERE claim_id = $3 AND source_id = $4 AND stance = $5
             AND COALESCE(passage, '') = $6
             AND COALESCE(passage_start, -1) = $7
             AND COALESCE(passage_end, -1) = $8`,
          [
            review.toStatus,
            review.actor,
            review.claimId,
            review.sourceId,
            review.stance,
            evidence.passage ?? "",
            evidence.passageStart ?? -1,
            evidence.passageEnd ?? -1,
          ],
        );
      }

      await tx.query(
        `INSERT INTO claim_evidence_review (
           id, claim_id, source_id, stance, from_status, to_status, actor, reason, reviewed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           from_status = EXCLUDED.from_status,
           to_status = EXCLUDED.to_status,
           reason = EXCLUDED.reason,
           reviewed_at = EXCLUDED.reviewed_at`,
        [
          reviewId(review, reviewedAt),
          review.claimId,
          review.sourceId,
          review.stance,
          fromStatus ?? null,
          review.toStatus,
          review.actor,
          review.reason ?? null,
          reviewedAt,
        ],
      );
    });

    return this.listReviews(review.claimId);
  }

  private toEvidence(row: ClaimEvidenceRow): ClaimEvidence {
    return ClaimEvidenceSchema.parse({
      claimId: row.claim_id,
      sourceId: row.source_id,
      stance: row.stance,
      passage: row.passage ?? undefined,
      passageStart: row.passage_start ?? undefined,
      passageEnd: row.passage_end ?? undefined,
      methodVersion: row.method_version ?? undefined,
      status: row.status,
    });
  }
}
