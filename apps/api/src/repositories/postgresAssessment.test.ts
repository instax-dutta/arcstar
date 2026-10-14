import { describe, expect, it } from "vitest";
import { AssessmentSchema } from "@arcstar/contracts";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresAssessmentRepository } from "./postgresAssessment.js";

const explanation = {
  base: 0.5,
  baseWhy: "wire",
  independentSources: [],
  collapsedFrom: 0,
  contradiction: [],
  finalScore: 0.5,
  methodVersion: "1.0.0",
};

function fakeSql(response: QueryResult<unknown>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      return response as QueryResult<T>;
    },
  };
}

describe("PostgresAssessmentRepository", () => {
  it("appends assessments with deterministic ids", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql({ rows: [] }, calls);
    const assessment = AssessmentSchema.parse({
      claimId: "c1",
      score: { value: 0.7, methodVersion: "1.0.0" },
      explanation,
      assessedAt: new Date("2026-10-14T00:00:00Z"),
    });
    await new PostgresAssessmentRepository(sql).append(assessment);
    expect(calls[0]?.params?.[0]).toBe("c1:2026-10-14T00:00:00.000Z");
    expect(calls[0]?.sql).toContain("INSERT INTO assessment");
  });

  it("reads the latest row", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql(
      {
        rows: [
          {
            claim_id: "c1",
            method_version: "1.0.0",
            assessed_at: "2026-10-14T00:00:00Z",
            score: 0.8,
            explanation,
          },
        ],
      },
      calls,
    );
    const repo = new PostgresAssessmentRepository(sql);
    const latest = await repo.getLatest("c1");
    expect(latest?.score.value).toBe(0.8);
    expect(latest?.assessedAt.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });
});
