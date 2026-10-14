import { describe, expect, it } from "vitest";
import { NodeSchema } from "@arcstar/contracts";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresEntityRepository } from "./postgresEntity.js";

function fakeSql(response: QueryResult<unknown>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      return response as QueryResult<T>;
    },
  };
}

describe("PostgresEntityRepository", () => {
  it("maps rows to nodes and stores aliases as an array", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql({ rows: [{ id: "hormuz", entity_type: "chokepoint", label: "Strait of Hormuz", external_ids: {} }] }, calls);
    const repo = new PostgresEntityRepository(sql);
    const node = await repo.get("hormuz");
    expect(node).toEqual(NodeSchema.parse({ id: "hormuz", type: "chokepoint", label: "Strait of Hormuz", props: {} }));

    const source = NodeSchema.parse({
      id: "hormuz",
      type: "chokepoint",
      label: "Strait of Hormuz",
      props: { aliases: ["Hormuz", 42] },
    });
    calls.length = 0;
    await repo.upsert(source);
    expect(calls[0]?.params?.[3]).toEqual(["Hormuz"]);
    expect(JSON.parse(String(calls[0]?.params?.[4]))).toEqual({ aliases: ["Hormuz", 42] });
  });
});
