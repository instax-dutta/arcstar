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
  it("upserts with a deterministic as-of edge id", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql({ rows: [] }, calls);
    await new PostgresEdgeRepository(sql).upsert(edge);
    expect(calls[0]?.params?.[0]).toBe("a->b:depends_on:2026-01-01T00:00:00.000Z");
    expect(calls[0]?.sql).toContain("INSERT INTO dependency_edge");
  });

  it("asks postgres for the latest edge as of a date", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql(
      { rows: [{ from_entity_id: "a", to_entity_id: "b", relation_type: "depends_on", weight: 0.8, valid_from: "2026-01-01T00:00:00Z" }] },
      calls,
    );
    const result = await new PostgresEdgeRepository(sql).listAsOf(new Date("2026-06-01T00:00:00Z"));
    expect(result[0]?.asOf.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(calls[0]?.sql).toContain("DISTINCT ON");
  });
});
