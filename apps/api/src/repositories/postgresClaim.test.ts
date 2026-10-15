import { describe, expect, it } from "vitest";
import { ClaimSchema } from "@arcstar/contracts";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresClaimRepository } from "./postgresClaim.js";

function fakeSql(response: QueryResult<unknown>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      return response as QueryResult<T>;
    },
  };
}

const claim = ClaimSchema.parse({
  id: "c1",
  text: "Transit fell.",
  subjectNodeId: "hormuz",
  assertedAt: new Date("2026-10-14T00:00:00Z"),
  supportingSourceIds: ["s2"],
  contradictingSourceIds: ["s3"],
  extractionConfidence: 0.7,
});

describe("PostgresClaimRepository", () => {
  it("upserts claim source links without deleting evidence", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql({ rows: [] }, calls);
    await new PostgresClaimRepository(sql).upsert(claim);
    expect(calls[0]?.sql).toContain("INSERT INTO claim");
    expect(calls[1]?.sql).toContain("DELETE FROM claim_source_link");
    expect(calls.some((call) => call.sql.includes("DELETE FROM claim_evidence"))).toBe(false);
    expect(calls[2]?.params).toEqual(["c1", "s2", "supports"]);
    expect(calls[3]?.params).toEqual(["c1", "s3", "contradicts"]);
  });

  it("reads support and contradiction links for a subject", async () => {
    const sql = fakeSql(
      {
        rows: [
          { id: "c1", subject_entity_id: "hormuz", text: "Transit fell.", asserted_at: "2026-10-14T00:00:00Z", extraction_confidence: 0.7, source_id: "s2", stance: "supports" },
          { id: "c1", subject_entity_id: "hormuz", text: "Transit fell.", asserted_at: "2026-10-14T00:00:00Z", extraction_confidence: 0.7, source_id: "s3", stance: "contradicts" },
        ],
      },
      [],
    );
    const claims = await new PostgresClaimRepository(sql).listBySubject("hormuz");
    expect(claims).toHaveLength(1);
    expect(claims[0]?.supportingSourceIds).toEqual(["s2"]);
    expect(claims[0]?.contradictingSourceIds).toEqual(["s3"]);
  });
});
