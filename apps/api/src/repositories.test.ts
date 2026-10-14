import { describe, expect, it } from "vitest";
import { AssessmentSchema, ClaimSchema, SourceSchema } from "@arcstar/contracts";
import { createInMemoryRepositories } from "./repositories/inMemory.js";

describe("in-memory repositories", () => {
  it("stores and lists sources deterministically", async () => {
    const repos = createInMemoryRepositories();
    await repos.sources.upsert(SourceSchema.parse({ id: "b", publisher: "B", tier: 2, publishedAt: new Date(0), citesSourceIds: [] }));
    await repos.sources.upsert(SourceSchema.parse({ id: "a", publisher: "A", tier: 1, publishedAt: new Date(0), citesSourceIds: [] }));
    expect((await repos.sources.list()).map((s) => s.id)).toEqual(["a", "b"]);
    expect((await repos.sources.get("a"))?.publisher).toBe("A");
  });

  it("filters claims by subject", async () => {
    const repos = createInMemoryRepositories();
    const claim = ClaimSchema.parse({
      id: "c1",
      text: "test",
      subjectNodeId: "x",
      assertedAt: new Date(0),
      supportingSourceIds: [],
      contradictingSourceIds: [],
      extractionConfidence: 0.9,
    });
    await repos.claims.upsert(claim);
    expect(await repos.claims.listBySubject("x")).toHaveLength(1);
    expect(await repos.claims.listBySubject("y")).toHaveLength(0);
  });

  it("resolves edges as of a date", async () => {
    const repos = createInMemoryRepositories();
    await repos.edges.upsert({ from: "a", to: "b", relation: "depends_on", weight: 1, asOf: new Date("2024-01-01") });
    await repos.edges.upsert({ from: "a", to: "b", relation: "depends_on", weight: 2, asOf: new Date("2025-01-01") });
    const before = await repos.edges.listAsOf(new Date("2024-06-01"));
    const after = await repos.edges.listAsOf(new Date("2025-06-01"));
    expect(before[0]?.weight).toBe(1);
    expect(after[0]?.weight).toBe(2);
  });

  it("appends assessments and returns the latest one", async () => {
    const repos = createInMemoryRepositories();
    const base = {
      claimId: "c1",
      assessedAt: new Date(0),
      explanation: {
        base: 0.5,
        baseWhy: "wire",
        independentSources: [],
        collapsedFrom: 0,
        contradiction: [],
        finalScore: 0.5,
        methodVersion: "1.0.0",
      },
    };
    const first = AssessmentSchema.parse({ ...base, score: { value: 0.5, methodVersion: "1.0.0" } });
    const second = AssessmentSchema.parse({ ...base, assessedAt: new Date(1), score: { value: 0.6, methodVersion: "1.0.0" } });
    await repos.assessments.append(first);
    await repos.assessments.append(second);
    expect((await repos.assessments.getLatest("c1"))?.score.value).toBe(0.6);
    expect(await repos.assessments.list("c1")).toHaveLength(2);
  });
});
