import { describe, expect, it } from "vitest";
import { ClaimEvidenceSchema } from "@arcstar/contracts";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresClaimEvidenceRepository } from "./postgresClaimEvidence.js";

function fakeSql(response: QueryResult<unknown>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      return response as QueryResult<T>;
    },
  };
}

describe("PostgresClaimEvidenceRepository", () => {
  it("writes and reads evidence passages", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const evidence = ClaimEvidenceSchema.parse({
      claimId: "c1",
      sourceId: "s1",
      stance: "supports",
      passage: "Transit fell.",
      passageStart: 0,
      passageEnd: 12,
      methodVersion: "manual-seed",
      status: "resolved",
    });
    await new PostgresClaimEvidenceRepository(fakeSql({ rows: [] }, calls)).upsert(evidence);
    expect(calls[0]?.sql).toContain("INSERT INTO claim_evidence");

    const sql = fakeSql(
      {
        rows: [
          {
            claim_id: "c1",
            source_id: "s1",
            stance: "supports",
            passage: "Transit fell.",
            passage_start: 0,
            passage_end: 12,
            method_version: "manual-seed",
            status: "resolved",
          },
        ],
      },
      [],
    );
    const saved = await new PostgresClaimEvidenceRepository(sql).list("c1");
    expect(saved).toEqual([evidence]);
  });
});
