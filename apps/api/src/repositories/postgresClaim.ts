import { ClaimSchema, type Claim } from "@arcstar/contracts";
import type { ClaimRepository } from "./types.js";
import { readStoredDate, type SqlClient, type TransactionalSqlClient } from "./postgres.js";

interface ClaimLinkRow {
  id: string;
  subject_entity_id: string;
  text: string;
  asserted_at: Date | string;
  extraction_confidence: number;
  source_id: string | null;
  stance: string | null;
}

export class PostgresClaimRepository implements ClaimRepository {
  constructor(private readonly sql: SqlClient) {}

  private async runInTransaction(work: (tx: TransactionalSqlClient) => Promise<void>): Promise<void> {
    if (this.sql.transaction) {
      await this.sql.transaction(work);
      return;
    }
    await work(this.sql);
  }

  async upsert(claim: Claim): Promise<void> {
    await this.runInTransaction(async (tx) => {
      await tx.query(
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

      await tx.query(`DELETE FROM claim_source_link WHERE claim_id = $1`, [claim.id]);

      for (const [stance, sourceIds] of [
        ["supports", [...new Set(claim.supportingSourceIds)]],
        ["contradicts", [...new Set(claim.contradictingSourceIds)]],
      ] as const) {
        if (sourceIds.length === 0) continue;
        await tx.query(
          `INSERT INTO claim_source_link (claim_id, source_id, stance, created_at, updated_at)
           SELECT $1, source_id, $3, now(), now()
           FROM unnest($2::text[]) AS source_id
           ON CONFLICT (claim_id, source_id, stance) DO UPDATE SET
             updated_at = now()`,
          [claim.id, sourceIds, stance],
        );
      }
    });
  }

  private async fetchClaims(mode: "id" | "subject", value: string): Promise<Claim[]> {
    const where = mode === "id" ? "c.id = $1" : "c.subject_entity_id = $1";
    const result = await this.sql.query<ClaimLinkRow>(
      `SELECT c.id, c.subject_entity_id, c.text, c.asserted_at, c.extraction_confidence,
              l.source_id, l.stance
       FROM claim c
       LEFT JOIN claim_source_link l ON l.claim_id = c.id
       WHERE ${where}
       ORDER BY c.id, l.source_id, l.stance`,
      [value],
    );

    const grouped = new Map<string, ClaimLinkRow[]>();
    for (const row of result.rows) {
      const list = grouped.get(row.id) ?? [];
      list.push(row);
      grouped.set(row.id, list);
    }
    return [...grouped.values()].map((rowGroup) => this.toClaim(rowGroup));
  }

  async get(id: string): Promise<Claim | undefined> {
    const claims = await this.fetchClaims("id", id);
    return claims[0];
  }

  async listBySubject(entityId: string): Promise<Claim[]> {
    return this.fetchClaims("subject", entityId);
  }

  private toClaim(rows: ClaimLinkRow[]): Claim {
    const first = rows[0];
    if (!first) throw new Error("cannot map an empty claim row group");
    const unique = (stance: string): string[] => [
      ...new Set(
        rows
          .filter((row) => row.stance === stance)
          .map((row) => row.source_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];

    return ClaimSchema.parse({
      id: first.id,
      text: first.text,
      subjectNodeId: first.subject_entity_id,
      assertedAt: readStoredDate(first.asserted_at, "asserted_at"),
      supportingSourceIds: unique("supports"),
      contradictingSourceIds: unique("contradicts"),
      extractionConfidence: first.extraction_confidence,
    });
  }
}
