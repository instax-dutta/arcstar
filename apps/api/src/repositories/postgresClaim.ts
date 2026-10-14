import { ClaimSchema, type Claim } from "@arcstar/contracts";
import type { ClaimRepository } from "./types.js";
import type { SqlClient } from "./postgres.js";

interface ClaimRow {
  id: string;
  subject_entity_id: string;
  text: string;
  asserted_at: Date | string;
  extraction_confidence: number;
  source_id: string | null;
  stance: string | null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export class PostgresClaimRepository implements ClaimRepository {
  constructor(private readonly sql: SqlClient) {}

  async upsert(claim: Claim): Promise<void> {
    await this.sql.query(
      `INSERT INTO claim (
         id, subject_entity_id, text, asserted_at, extraction_confidence,
         extraction_provider, extraction_model, extraction_schema_version, resolution_state
       )
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         subject_entity_id = EXCLUDED.subject_entity_id,
         text = EXCLUDED.text,
         asserted_at = EXCLUDED.asserted_at,
         extraction_confidence = EXCLUDED.extraction_confidence`,
      [
        claim.id,
        claim.subjectNodeId,
        claim.text,
        claim.assertedAt,
        claim.extractionConfidence,
        "deterministic-no-llm",
        "claim@1",
        "unresolved",
      ],
    );

    await this.sql.query(`DELETE FROM claim_evidence WHERE claim_id = $1`, [claim.id]);

    for (const [stance, sourceIds] of [
      ["supports", claim.supportingSourceIds],
      ["contradicts", claim.contradictingSourceIds],
    ] as const) {
      for (const sourceId of sourceIds) {
        await this.sql.query(
          `INSERT INTO claim_evidence (id, claim_id, source_id, stance, status)
           VALUES ($1, $2, $3, $4, 'resolved')
           ON CONFLICT (id) DO NOTHING`,
          [`${claim.id}:${sourceId}:${stance}`, claim.id, sourceId, stance],
        );
      }
    }
  }

  async get(id: string): Promise<Claim | undefined> {
    const result = await this.sql.query<ClaimRow>(
      `SELECT c.id, c.subject_entity_id, c.text, c.asserted_at, c.extraction_confidence,
              ce.source_id, ce.stance
       FROM claim c
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE c.id = $1`,
      [id],
    );
    const rows = result.rows;
    if (rows.length === 0) return undefined;
    return this.toClaim(rows);
  }

  async listBySubject(entityId: string): Promise<Claim[]> {
    const result = await this.sql.query<ClaimRow>(
      `SELECT c.id, c.subject_entity_id, c.text, c.asserted_at, c.extraction_confidence,
              ce.source_id, ce.stance
       FROM claim c
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE c.subject_entity_id = $1
       ORDER BY c.id, ce.source_id`,
      [entityId],
    );
    return this.groupClaims(result.rows);
  }

  private groupClaims(rows: ClaimRow[]): Claim[] {
    const grouped = new Map<string, ClaimRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.id) ?? [];
      list.push(row);
      grouped.set(row.id, list);
    }
    return [...grouped.values()].map((rowGroup) => this.toClaim(rowGroup));
  }

  private toClaim(rows: ClaimRow[]): Claim {
    const first = rows[0];
    if (!first) throw new Error("cannot map an empty claim row group");
    return ClaimSchema.parse({
      id: first.id,
      text: first.text,
      subjectNodeId: first.subject_entity_id,
      assertedAt: toDate(first.asserted_at),
      supportingSourceIds: rows.filter((row) => row.stance === "supports").map((row) => row.source_id).filter((id): id is string => Boolean(id)),
      contradictingSourceIds: rows.filter((row) => row.stance === "contradicts").map((row) => row.source_id).filter((id): id is string => Boolean(id)),
      extractionConfidence: first.extraction_confidence,
    });
  }
}
