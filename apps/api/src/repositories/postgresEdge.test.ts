import { describe, expect, it } from "vitest";
import type { Edge } from "@arcstar/contracts";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresEdgeRepository } from "./postgresEdge.js";

const edge: Edge = {
  from: "a",
  to: "b",
  relation: "depends_on",
  weight: 0.8,
  asOf: new Date("2026-01-01T00:00:00Z"),
};

function fakeSql(response: QueryResult<unknown>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      return response as QueryResult<T>;
    },
  };
}

describe("PostgresEdgeRepository", () => {
  it("upserts with an id that keeps distinct same-date weights", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql({ rows: [] }, calls);
    await new PostgresEdgeRepository(sql).upsert(edge);
    expect(calls[0]?.params?.[0]).toBe("a->b:depends_on:2026-01-01T00:00:00.000Z:0.8");
    expect(calls[0]?.sql).toContain("INSERT INTO dependency_edge");
  });

  it("breaks same-date ties by weight and returns deterministic order", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql(
      {
        rows: [
          { from_entity_id: "a", to_entity_id: "b", relation_type: "depends_on", weight: 0.9, valid_from: "2026-01-01T00:00:00Z", observed_at: "2026-01-02T00:00:00Z", evidence_refs: [], verification_state: "estimated" },
          { from_entity_id: "a", to_entity_id: "b", relation_type: "depends_on", weight: 0.8, valid_from: "2026-01-01T00:00:00Z", observed_at: "2026-01-02T00:00:00Z", evidence_refs: [], verification_state: "estimated" },
        ],
      },
      calls,
    );
    const result = await new PostgresEdgeRepository(sql).listAsOf(new Date("2026-06-01T00:00:00Z"));
    expect(result.map((e) => e.weight)).toEqual([0.9, 0.8]);
    expect(calls[0]?.sql).toContain("ORDER BY from_entity_id, to_entity_id, relation_type, valid_from DESC, weight DESC");
  });

  it("rejects invalid stored dates", async () => {
    const sql = fakeSql(
      {
        rows: [
          {
            from_entity_id: "a",
            to_entity_id: "b",
            relation_type: "depends_on",
            weight: 0.8,
            valid_from: "not-a-date",
            observed_at: "2026-01-02T00:00:00Z",
            evidence_refs: [],
            verification_state: "estimated",
          },
        ],
      },
      [],
    );
    await expect(new PostgresEdgeRepository(sql).list()).rejects.toThrow(/valid_from/);
  });
});
