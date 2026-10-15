import { describe, expect, it } from "vitest";
import { ClaimEvidenceSchema, ClaimSchema, SourceSchema } from "@arcstar/contracts";
import { assessClaim } from "./assessment.js";
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
    const claim = ClaimSchema.parse({
      id: "c1",
      text: "test",
      subjectNodeId: "x",
      assertedAt: new Date(0),
      supportingSourceIds: ["a"],
      contradictingSourceIds: [],
      extractionConfidence: 0.9,
    });
    const source = SourceSchema.parse({ id: "a", publisher: "A", tier: 1, publishedAt: new Date(0), citesSourceIds: [] });
    const first = assessClaim({ claim, allSources: [source], assessedAt: new Date(0) });
    const second = assessClaim({ claim, allSources: [source], assessedAt: new Date(1) });
    await repos.assessments.append(first);
    await repos.assessments.append(second);
    expect((await repos.assessments.getLatest("c1"))?.score.value).toBe(second.score.value);
    expect(await repos.assessments.list("c1")).toHaveLength(2);
  });

  it("preserves evidence through claim upserts and review updates", async () => {
    const repos = createInMemoryRepositories();
    const first = ClaimEvidenceSchema.parse({
      claimId: "c1",
      sourceId: "a",
      stance: "supports",
      passage: "Original passage",
      status: "unresolved",
    });
    const corrected = ClaimEvidenceSchema.parse({
      claimId: "c1",
      sourceId: "a",
      stance: "supports",
      passage: "Corrected passage",
      status: "resolved",
    });

    await repos.claimEvidence.upsert(first);
    await repos.claims.upsert(ClaimSchema.parse({
      id: "c1",
      text: "test",
      subjectNodeId: "x",
      assertedAt: new Date(0),
      supportingSourceIds: ["a"],
      contradictingSourceIds: [],
      extractionConfidence: 0.9,
    }));
    await repos.claimEvidence.upsert(corrected);

    const evidence = await repos.claimEvidence.list("c1");
    expect(evidence.map((item) => item.passage)).toEqual(["Original passage", "Corrected passage"]);
    expect(evidence.map((item) => item.status)).toEqual(["unresolved", "resolved"]);
  });

  it("records unknown source lineage as a gap and resolves it when the source appears", async () => {
    const repos = createInMemoryRepositories();
    await repos.sources.upsert(SourceSchema.parse({
      id: "child",
      publisher: "Child",
      tier: 3,
      publishedAt: new Date(0),
      citesSourceIds: ["missing"],
    }));
    expect(await repos.sources.listLineageGaps("child")).toEqual([
      { fromSourceId: "child", unresolvedSourceRef: "missing", status: "unknown" },
    ]);

    await repos.sources.upsert(SourceSchema.parse({
      id: "missing",
      publisher: "Missing",
      tier: 2,
      publishedAt: new Date(0),
      citesSourceIds: [],
    }));
    expect(await repos.sources.listLineageGaps("child")).toEqual([]);
  });
});
