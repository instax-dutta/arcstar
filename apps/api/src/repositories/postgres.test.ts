import { describe, expect, it } from "vitest";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresSourceRepository } from "./postgres.js";
import { SourceSchema } from "@arcstar/contracts";

function fakeSql(responses: Array<QueryResult<unknown>>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  let index = 0;
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      const result = responses[index] ?? { rows: [] };
      index += 1;
      return result as QueryResult<T>;
    },
  };
}

describe("PostgresSourceRepository", () => {
  it("uses published_at, not created_at, for publication time", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql(
      [
        {
          rows: [
            { id: "s1", publisher: "A", source_tier: 2, published_at: "2026-10-14T00:00:00Z" },
          ],
        },
        { rows: [{ to_source_id: "s2" }] },
      ],
      calls,
    );
    const source = await new PostgresSourceRepository(sql).get("s1");
    expect(source?.publishedAt.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(source?.citesSourceIds).toEqual(["s2"]);
  });

  it("rejects a missing publication time rather than inventing one", async () => {
    const sql = fakeSql([{ rows: [{ id: "s1", publisher: "A", source_tier: 2, published_at: null }] }], []);
    await expect(new PostgresSourceRepository(sql).get("s1")).rejects.toThrow(/published_at/);
  });

  it("groups multiple citations into one source on list", async () => {
    const sql = fakeSql(
      [
        {
          rows: [
            { id: "s1", publisher: "A", source_tier: 2, published_at: "2026-10-14T00:00:00Z", citation_id: "s2" },
            { id: "s1", publisher: "A", source_tier: 2, published_at: "2026-10-14T00:00:00Z", citation_id: "s3" },
          ],
        },
      ],
      [],
    );
    const sources = await new PostgresSourceRepository(sql).list();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.citesSourceIds).toEqual(["s2", "s3"]);
  });

  it("writes known lineage and unresolved lineage gaps separately", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql([{ rows: [{ id: "known" }] }], calls);
    const source = SourceSchema.parse({
      id: "s1",
      publisher: "A",
      tier: 2,
      publishedAt: new Date(0),
      citesSourceIds: ["known", "missing"],
    });
    await new PostgresSourceRepository(sql).upsert(source);
    expect(calls[0]?.sql).toContain("SELECT id FROM source_pool WHERE id = ANY");
    expect(calls[1]?.sql).toContain("INSERT INTO source_pool");
    expect(calls[2]?.sql).toContain("DELETE FROM source_lineage_gap WHERE unresolved_source_ref");
    expect(calls[4]?.sql).toContain("INSERT INTO source_lineage");
    expect(calls[5]?.sql).toContain("DELETE FROM source_lineage_gap WHERE from_source_id");
    expect(calls[6]?.sql).toContain("INSERT INTO source_lineage_gap");
  });

  it("reads lineage gaps", async () => {
    const sql = fakeSql([{ rows: [{ unresolved_source_ref: "missing", status: "unknown", evidence: null }] }], []);
    const gaps = await new PostgresSourceRepository(sql).listLineageGaps("s1");
    expect(gaps).toEqual([{ fromSourceId: "s1", unresolvedSourceRef: "missing", status: "unknown" }]);
  });
});
