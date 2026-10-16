import { createHash } from "node:crypto";
import { SourceLineageSchema, SourceSchema, type Source, type SourceLineage, type SourceLineageGap } from "@arcstar/contracts";
import type { SourceLineageGapRepository, SourceLineageRepository, SourceRepository } from "./types.js";

export interface QueryResult<T> {
  rows: T[];
}

export type TransactionalSqlClient = Pick<SqlClient, "query">;

export interface SqlClient {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction?: <T>(work: (tx: TransactionalSqlClient) => Promise<T>) => Promise<T>;
}

interface SourcePoolRow {
  id: string;
  publisher: string;
  source_tier: number;
  published_at: Date | string | null;
  primary_evidence: string | null;
}

interface SourcePoolWithLineageRow extends SourcePoolRow {
  lineage_to_source_id: string | null;
  lineage_kind: string | null;
  lineage_status: string | null;
  lineage_evidence: string | null;
}

interface SourceLineageRow {
  to_source_id: string;
  kind: string;
  status: string;
  evidence: string | null;
}

interface SourceLineageGapRow {
  unresolved_source_ref: string;
  status: string;
  evidence: string | null;
}

function toDate(value: Date | string | null | undefined, field: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${field} is not a valid date`);
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${field} is not a valid date`);
    return parsed;
  }
  throw new Error(`${field} is required`);
}

export function readStoredDate(value: Date | string | null | undefined, field: string): Date {
  return toDate(value, field);
}

function lineageId(from: string, to: string, kind: string): string {
  return `lineage-${createHash("sha256").update(`${from}|${to}|${kind}`).digest("hex").slice(0, 40)}`;
}

export class PostgresSourceRepository implements SourceRepository, SourceLineageRepository, SourceLineageGapRepository {
  constructor(private readonly sql: SqlClient) {}

  private async runInTransaction(work: (tx: TransactionalSqlClient) => Promise<void>): Promise<void> {
    if (this.sql.transaction) {
      await this.sql.transaction(work);
      return;
    }
    await work(this.sql);
  }

  async upsert(source: Source): Promise<void> {
    await this.runInTransaction(async (tx) => {
      const citationIds = [...new Set(source.citesSourceIds)];
      let knownCitations = new Set<string>();
      if (citationIds.length > 0) {
        const known = await tx.query<{ id: string }>(
          `SELECT id FROM source_pool WHERE id = ANY($1::text[])`,
          [citationIds],
        );
        knownCitations = new Set(known.rows.map((row) => row.id));
      }

      await tx.query(
        `INSERT INTO source_pool (id, publisher, source_tier, published_at, primary_evidence, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           source_tier = EXCLUDED.source_tier,
           published_at = EXCLUDED.published_at,
           primary_evidence = EXCLUDED.primary_evidence,
           updated_at = now()`,
        [source.id, source.publisher, source.tier, source.publishedAt, source.primaryEvidence ?? null],
      );

      await tx.query(
        `DELETE FROM source_lineage_gap WHERE unresolved_source_ref = $1`,
        [source.id],
      );

      await tx.query(`DELETE FROM source_lineage WHERE from_source_id = $1`, [source.id]);

      const lineageByTarget = new Map<string, SourceLineage>();
      for (const entry of source.lineage ?? []) {
        lineageByTarget.set(entry.toSourceId, entry);
      }

      for (const citationId of citationIds.filter((id) => knownCitations.has(id))) {
        const entry = lineageByTarget.get(citationId);
        const lineage = SourceLineageSchema.parse({
          fromSourceId: source.id,
          toSourceId: citationId,
          kind: entry?.kind ?? "cites",
          status: entry?.status ?? "observed",
          evidence: entry?.evidence,
        });
        await tx.query(
          `INSERT INTO source_lineage (id, from_source_id, to_source_id, kind, status, evidence, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             evidence = EXCLUDED.evidence`,
          [lineageId(source.id, citationId, lineage.kind), source.id, citationId, lineage.kind, lineage.status, lineage.evidence ?? null],
        );
      }

      await tx.query(`DELETE FROM source_lineage_gap WHERE from_source_id = $1`, [source.id]);
      for (const citationId of citationIds.filter((id) => !knownCitations.has(id))) {
        await tx.query(
          `INSERT INTO source_lineage_gap (
             id, from_source_id, unresolved_source_ref, status, evidence, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'unknown', NULL, now(), now())
           ON CONFLICT (id) DO UPDATE SET
             evidence = EXCLUDED.evidence,
             updated_at = now()`,
          [`${source.id}->${citationId}`, source.id, citationId],
        );
      }
    });
  }

  async get(id: string): Promise<Source | undefined> {
    const pool = await this.sql.query<SourcePoolRow>(
      `SELECT id, publisher, source_tier, published_at, primary_evidence
       FROM source_pool WHERE id = $1`,
      [id],
    );
    const row = pool.rows[0];
    if (!row) return undefined;

    const lineage = await this.sql.query<SourceLineageRow>(
      `SELECT to_source_id, kind, status, evidence FROM source_lineage
       WHERE from_source_id = $1 ORDER BY to_source_id, kind`,
      [id],
    );

    return this.toSource(row, lineage.rows);
  }

  async list(): Promise<Source[]> {
    const result = await this.sql.query<SourcePoolWithLineageRow>(
      `SELECT sp.id, sp.publisher, sp.source_tier, sp.published_at, sp.primary_evidence,
              sl.to_source_id AS lineage_to_source_id, sl.kind AS lineage_kind,
              sl.status AS lineage_status, sl.evidence AS lineage_evidence
       FROM source_pool sp
       LEFT JOIN source_lineage sl ON sl.from_source_id = sp.id
       ORDER BY sp.id, sl.to_source_id, sl.kind`,
    );

    const grouped = new Map<string, SourcePoolRow & { lineage: SourceLineageRow[] }>();
    for (const row of result.rows) {
      const existing = grouped.get(row.id) ?? {
        id: row.id,
        publisher: row.publisher,
        source_tier: row.source_tier,
        published_at: row.published_at,
        primary_evidence: row.primary_evidence,
        lineage: [],
      };
      if (row.lineage_to_source_id && row.lineage_kind && row.lineage_status) {
        existing.lineage.push({
          to_source_id: row.lineage_to_source_id,
          kind: row.lineage_kind,
          status: row.lineage_status,
          evidence: row.lineage_evidence,
        });
      }
      grouped.set(row.id, existing);
    }

    return [...grouped.values()]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((row) =>
        this.toSource(
          {
            id: row.id,
            publisher: row.publisher,
            source_tier: row.source_tier,
            published_at: row.published_at,
            primary_evidence: row.primary_evidence,
          },
          row.lineage,
        ),
      );
  }

  async listLineage(sourceId: string): Promise<SourceLineage[]> {
    const result = await this.sql.query<SourceLineageRow>(
      `SELECT to_source_id, kind, status, evidence FROM source_lineage
       WHERE from_source_id = $1 ORDER BY to_source_id, kind`,
      [sourceId],
    );
    return result.rows.map((row) =>
      SourceLineageSchema.parse({
        fromSourceId: sourceId,
        toSourceId: row.to_source_id,
        kind: row.kind,
        status: row.status,
        evidence: row.evidence ?? undefined,
      }),
    );
  }

  async listLineageGaps(sourceId: string): Promise<SourceLineageGap[]> {
    const result = await this.sql.query<SourceLineageGapRow>(
      `SELECT unresolved_source_ref, status, evidence
       FROM source_lineage_gap
       WHERE from_source_id = $1
       ORDER BY unresolved_source_ref`,
      [sourceId],
    );
    return result.rows.map((row) => ({
      fromSourceId: sourceId,
      unresolvedSourceRef: row.unresolved_source_ref,
      status: row.status === "inferred" ? "inferred" : "unknown",
      evidence: row.evidence ?? undefined,
    }));
  }

  private toSource(row: SourcePoolRow, lineageRows: SourceLineageRow[]): Source {
    const lineage = lineageRows.map((lineageRow) =>
      SourceLineageSchema.parse({
        fromSourceId: row.id,
        toSourceId: lineageRow.to_source_id,
        kind: lineageRow.kind,
        status: lineageRow.status,
        evidence: lineageRow.evidence ?? undefined,
      }),
    );

    return SourceSchema.parse({
      id: row.id,
      publisher: row.publisher,
      tier: row.source_tier,
      publishedAt: toDate(row.published_at, "published_at"),
      citesSourceIds: lineage.map((entry) => entry.toSourceId),
      primaryEvidence: row.primary_evidence ?? undefined,
      lineage,
    });
  }
}
