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
  it("reads source lineage into citesSourceIds", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql(
      [
        {
          rows: [
            { id: "s1", publisher: "A", source_tier: 2, created_at: "2026-10-14T00:00:00Z" },
          ],
        },
        { rows: [{ to_source_id: "s2" }] },
      ],
      calls,
    );
    const source = await new PostgresSourceRepository(sql).get("s1");
    expect(source).toBeDefined();
    expect(source?.citesSourceIds).toEqual(["s2"]);
    expect(source?.publishedAt.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("groups multiple citations into one source on list", async () => {
    const sql = fakeSql(
      [
        {
          rows: [
            { id: "s1", publisher: "A", source_tier: 2, created_at: null, citation_id: "s2" },
            { id: "s1", publisher: "A", source_tier: 2, created_at: null, citation_id: "s3" },
          ],
        },
      ],
      [],
    );
    const sources = await new PostgresSourceRepository(sql).list();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.citesSourceIds).toEqual(["s2", "s3"]);
  });

  it("writes the source pool and lineage rows", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql([], calls);
    const source = SourceSchema.parse({
      id: "s1",
      publisher: "A",
      tier: 2,
      publishedAt: new Date(0),
      citesSourceIds: ["s2", "s3"],
    });
    await new PostgresSourceRepository(sql).upsert(source);
    expect(calls[0]?.sql).toContain("INSERT INTO source_pool");
    expect(calls[1]?.sql).toContain("DELETE FROM source_lineage");
    expect(calls).toHaveLength(4);
  });
});
