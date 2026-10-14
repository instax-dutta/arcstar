import { SourceSchema, type Source } from "@arcstar/contracts";
import type { SourceRepository } from "./types.js";

export interface QueryResult<T> {
  rows: T[];
}

export interface SqlClient {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

interface SourcePoolRow {
  id: string;
  publisher: string;
  source_tier: number;
  published_at: Date | string | null;
}

interface SourcePoolWithCitationRow extends SourcePoolRow {
  citation_id: string | null;
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

/**
 * Maps the canonical migration schema to the engine's `Source` contract. Source
 * lineage is stored in `source_lineage`, so it is re-read as `citesSourceIds`.
 * `published_at` is publication time, not Arcstar's `created_at` observation time.
 */
export class PostgresSourceRepository implements SourceRepository {
  constructor(private readonly sql: SqlClient) {}

  async upsert(source: Source): Promise<void> {
    await this.sql.query(
      `INSERT INTO source_pool (id, publisher, source_tier, published_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         publisher = EXCLUDED.publisher,
         source_tier = EXCLUDED.source_tier,
         published_at = EXCLUDED.published_at,
         updated_at = now()`,
      [source.id, source.publisher, source.tier, source.publishedAt],
    );

    await this.sql.query(`DELETE FROM source_lineage WHERE from_source_id = $1`, [source.id]);

    for (const citationId of source.citesSourceIds) {
      await this.sql.query(
        `INSERT INTO source_lineage (id, from_source_id, to_source_id, kind, status)
         VALUES ($1, $2, $3, 'cites', 'observed')`,
        [`${source.id}->${citationId}`, source.id, citationId],
      );
    }
  }

  async get(id: string): Promise<Source | undefined> {
    const pool = await this.sql.query<SourcePoolRow>(
      `SELECT id, publisher, source_tier, published_at FROM source_pool WHERE id = $1`,
      [id],
    );
    const row = pool.rows[0];
    if (!row) return undefined;

    const lineage = await this.sql.query<{ to_source_id: string }>(
      `SELECT to_source_id FROM source_lineage WHERE from_source_id = $1 ORDER BY to_source_id`,
      [id],
    );

    return SourceSchema.parse({
      id: row.id,
      publisher: row.publisher,
      tier: row.source_tier,
      publishedAt: toDate(row.published_at, "published_at"),
      citesSourceIds: lineage.rows.map((lineageRow) => lineageRow.to_source_id),
    });
  }

  async list(): Promise<Source[]> {
    const result = await this.sql.query<SourcePoolWithCitationRow>(
      `SELECT sp.id, sp.publisher, sp.source_tier, sp.published_at, sl.to_source_id AS citation_id
       FROM source_pool sp
       LEFT JOIN source_lineage sl ON sl.from_source_id = sp.id
       ORDER BY sp.id, sl.to_source_id`,
    );

    const grouped = new Map<string, SourcePoolRow & { citations: string[] }>();
    for (const row of result.rows) {
      const existing = grouped.get(row.id) ?? { ...row, citations: [] };
      if (row.citation_id) existing.citations.push(row.citation_id);
      grouped.set(row.id, existing);
    }

    return [...grouped.values()]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((row) =>
        SourceSchema.parse({
          id: row.id,
          publisher: row.publisher,
          tier: row.source_tier,
          publishedAt: toDate(row.published_at, "published_at"),
          citesSourceIds: row.citations,
        }),
      );
  }
}
