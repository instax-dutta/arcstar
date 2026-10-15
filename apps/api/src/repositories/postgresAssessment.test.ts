import { describe, expect, it } from "vitest";
import { ClaimSchema, SourceSchema } from "@arcstar/contracts";
import type { QueryResult, SqlClient } from "./postgres.js";
import { PostgresAssessmentRepository } from "./postgresAssessment.js";
import { assessClaim } from "../assessment.js";

const source = SourceSchema.parse({
  id: "s1",
  publisher: "A",
  tier: 1,
  publishedAt: new Date(0),
  citesSourceIds: [],
});
const claim = ClaimSchema.parse({
  id: "c1",
  text: "test",
  subjectNodeId: "hormuz",
  assertedAt: new Date(0),
  supportingSourceIds: ["s1"],
  contradictingSourceIds: [],
  extractionConfidence: 0.9,
});

function fakeSql(response: QueryResult<unknown>, calls: Array<{ sql: string; params?: unknown[] }>): SqlClient {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      return response as QueryResult<T>;
    },
  };
}

describe("PostgresAssessmentRepository", () => {
  it("appends assessments with unique ids and stores the snapshot", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql({ rows: [] }, calls);
    const assessment = assessClaim({ claim, allSources: [source], assessedAt: new Date(0) });
    await new PostgresAssessmentRepository(sql).append(assessment);
    await new PostgresAssessmentRepository(sql).append(assessment);
    expect(calls[0]?.params?.[0]).not.toBe(calls[1]?.params?.[0]);
    expect(calls[0]?.sql).toContain("INSERT INTO assessment");
    const storedSnapshot = JSON.parse(String(calls[0]?.params?.[8])) as {
      claim: { id: string };
      allSources: Array<{ id: string }>;
    };
    expect(storedSnapshot.claim.id).toBe(claim.id);
    expect(storedSnapshot.allSources.map((item) => item.id)).toEqual(["s1"]);
  });

  it("reads the latest row and its input snapshot", async () => {
    const assessment = assessClaim({ claim, allSources: [source], assessedAt: new Date(0) });
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const sql = fakeSql(
      {
        rows: [
          {
            claim_id: "c1",
            method_version: assessment.score.methodVersion,
            assessed_at: "2026-01-01T00:00:00Z",
            score: assessment.score.value,
            explanation: assessment.explanation,
            input_snapshot_ref: assessment.inputSnapshotRef,
            input_snapshot: assessment.inputSnapshot,
          },
        ],
      },
      calls,
    );
    const latest = await new PostgresAssessmentRepository(sql).getLatest("c1");
    expect(latest?.score.value).toBe(assessment.score.value);
    expect(latest?.inputSnapshotRef).toBe(assessment.inputSnapshotRef);
    expect(latest?.inputSnapshot).toEqual(assessment.inputSnapshot);
  });
});
