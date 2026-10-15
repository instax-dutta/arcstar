import { describe, expect, it } from "vitest";
import { scoreClaim } from "@arcstar/credibility";
import type { Source } from "@arcstar/contracts";
import type { AppConfig } from "./config.js";
import { createApp } from "./app.js";
import { createDataLayer, createInMemoryDataLayer } from "./dataLayer.js";
import { createRateLimiter } from "./rateLimit.js";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    port: 0,
    corsOrigins: ["http://localhost:5173"],
    rateLimitMax: 10_000,
    rateLimitWindowMs: 60_000,
    trustedProxies: [],
    ...overrides,
  };
}

function source(id: string, tier: 1 | 2 | 3 | 4 | 5 = 2): Source {
  return { id, publisher: id, tier, publishedAt: new Date(0), citesSourceIds: [] };
}

describe("persisted investigation workflow", () => {
  it("returns a claim, its evidence, and a reproducible assessment", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig());
    const res = await app.request("/claims/claim-hormuz-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      claim: { id: string };
      evidence: Array<{ sourceId: string }>;
      assessment: { score: { value: number }; inputSnapshot: { allSources: unknown[] } };
    };
    expect(body.claim.id).toBe("claim-hormuz-1");
    expect(body.evidence).toHaveLength(3);
    const recomputed = scoreClaim({
      claim: body.assessment.inputSnapshot.claim as never,
      allSources: body.assessment.inputSnapshot.allSources as never,
    });
    expect(recomputed.score.value).toBeCloseTo(body.assessment.score.value, 12);
  });

  it("stores evidence without deleting prior claim or evidence", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig());
    const res = await app.request("/claims/claim-hormuz-1/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evidence: [
          {
            claimId: "claim-hormuz-1",
            sourceId: "reuters-1",
            stance: "supports",
            passage: "Reviewed passage",
            status: "resolved",
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claim: { id: string }; evidence: Array<{ passage?: string; status: string }> };
    expect(body.claim.id).toBe("claim-hormuz-1");
    expect(body.evidence.length).toBeGreaterThan(3);

    const claimRes = await app.request("/claims/claim-hormuz-1");
    const claimBody = (await claimRes.json()) as { claim: { id: string } };
    expect(claimBody.claim.id).toBe("claim-hormuz-1");
  });

  it("updates claim source membership when reviewed evidence is stored", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    await dataLayer.repos.sources.upsert(source("new-support", 2));
    const app = createApp(dataLayer, testConfig());
    const res = await app.request("/claims/claim-hormuz-1/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evidence: [
          { claimId: "claim-hormuz-1", sourceId: "new-support", stance: "supports", status: "resolved" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claim: { supportingSourceIds: string[] } };
    expect(body.claim.supportingSourceIds).toContain("new-support");
  });

  it("rejects mismatched or unknown evidence writes", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig());

    const mismatch = await app.request("/claims/claim-hormuz-1/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evidence: [{ claimId: "other", sourceId: "reuters-1", stance: "supports", status: "resolved" }],
      }),
    });
    expect(mismatch.status).toBe(400);

    const unknown = await app.request("/claims/claim-hormuz-1/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evidence: [{ claimId: "claim-hormuz-1", sourceId: "missing", stance: "supports", status: "resolved" }],
      }),
    });
    expect(unknown.status).toBe(400);
  });

  it("keeps an auditable history when a review changes status", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig());
    const res = await app.request("/claims/claim-hormuz-1/evidence/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviews: [
          {
            claimId: "claim-hormuz-1",
            sourceId: "reuters-1",
            stance: "supports",
            actor: "analyst-1",
            toStatus: "disputed",
            reason: "source wording conflicts with claim",
            reviewedAt: "2026-10-15T00:00:00Z",
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      evidence: Array<{ sourceId: string; status: string; methodVersion?: string }>;
      reviews: Array<{ actor: string; toStatus: string; fromStatus?: string; reason?: string }>;
    };
    expect(body.evidence.find((item) => item.sourceId === "reuters-1")?.status).toBe("disputed");
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0]?.actor).toBe("analyst-1");
    expect(body.reviews[0]?.toStatus).toBe("disputed");
    expect(body.reviews[0]?.fromStatus).toBe("unresolved");
  });

  it("resolves reviewed contradictions into the assessment snapshot", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    await dataLayer.repos.sources.upsert(source("contradiction-1", 1));
    const app = createApp(dataLayer, testConfig());

    const evidenceRes = await app.request("/claims/claim-hormuz-1/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evidence: [
          {
            claimId: "claim-hormuz-1",
            sourceId: "contradiction-1",
            stance: "contradicts",
            passage: "Contradicting report",
            status: "resolved",
          },
        ],
      }),
    });
    expect(evidenceRes.status).toBe(200);

    const assessmentRes = await app.request("/claims/claim-hormuz-1/assessments", { method: "POST" });
    expect(assessmentRes.status).toBe(201);
    const body = (await assessmentRes.json()) as {
      assessment: { explanation: { contradiction: unknown[] }; inputSnapshot: { contradictingClaims: unknown[] }; score: { value: number } };
    };
    expect(body.assessment.explanation.contradiction).toHaveLength(1);
    expect(body.assessment.inputSnapshot.contradictingClaims).toHaveLength(1);
  });

  it("exposes unknown source lineage as a gap state and full lineage when known", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    await dataLayer.repos.sources.upsert(source("upstream", 1));
    await dataLayer.repos.sources.upsert({
      id: "child",
      publisher: "Child",
      tier: 2,
      publishedAt: new Date(0),
      citesSourceIds: ["upstream", "missing-source"],
      lineage: [
        {
          fromSourceId: "child",
          toSourceId: "upstream",
          kind: "syndicates",
          status: "verified",
          evidence: "shared release",
        },
      ],
    });
    const app = createApp(dataLayer, testConfig());

    const res = await app.request("/sources/child");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lineage: Array<{ kind: string; status: string }>;
      lineageGaps: Array<{ unresolvedSourceRef: string; status: string }>;
    };
    expect(body.lineage).toEqual([
      { fromSourceId: "child", toSourceId: "upstream", kind: "syndicates", status: "verified", evidence: "shared release" },
    ]);
    expect(body.lineageGaps).toEqual([
      { fromSourceId: "child", unresolvedSourceRef: "missing-source", status: "unknown" },
    ]);
  });

  it("answers scenarios from a server-owned snapshot", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig());
    const res = await app.request("/scenarios/hormuz?asOf=2026-01-02T00:00:00Z");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      snapshot: { id: string; nodeCount: number; edgeCount: number };
      results: Array<{ node: string; pathIsRepresentative: boolean }>;
      edgeEvidenceStatus: string;
      scenarioKind: string;
    };
    expect(body.snapshot.id).toMatch(/^graph-[a-f0-9]{64}$/);
    expect(body.snapshot.nodeCount).toBe(13);
    expect(body.snapshot.edgeCount).toBe(14);
    expect(body.results.map((r) => r.node)).toContain("qatar");
    expect(body.results.every((r) => r.pathIsRepresentative)).toBe(true);
    expect(body.edgeEvidenceStatus).toBe("unverified-or-unknown");
    expect(body.scenarioKind).toBe("hypothetical-disruption");
  });

  it("creates assessments from the persisted graph on request", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig());
    const res = await app.request("/claims/claim-hormuz-1/assessments", { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      assessment: { inputSnapshot: { allSources: Array<{ id: string }> } };
    };
    expect(body.assessment.inputSnapshot.allSources.map((s) => s.id)).toContain("reuters-1");
  });

  it("limits repeated scenario requests", async () => {
    const dataLayer = createInMemoryDataLayer();
    await dataLayer.ready?.();
    const app = createApp(dataLayer, testConfig({ rateLimitMax: 1 }), createRateLimiter({ windowMs: 60_000, maxRequests: 1 }));
    const first = await app.request("/scenarios/hormuz");
    const second = await app.request("/scenarios/hormuz");
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("selects the postgres repository store when DATABASE_URL is set", async () => {
    const dataLayer = createDataLayer(testConfig({ databaseUrl: "postgres://user:pass@localhost:5432/db" }));
    expect(dataLayer.storage).toBe("postgres");
    expect(Object.keys(dataLayer.repos)).toContain("claimEvidence");
  });

  it("returns stable snapshot IDs for the same explicit graph query", async () => {
    const firstLayer = createInMemoryDataLayer();
    const secondLayer = createInMemoryDataLayer();
    await firstLayer.ready?.();
    await secondLayer.ready?.();
    const first = await createApp(firstLayer, testConfig()).request("/scenarios/hormuz?asOf=2026-01-02T00:00:00Z");
    const second = await createApp(secondLayer, testConfig()).request("/scenarios/hormuz?asOf=2026-01-02T00:00:00Z");
    const firstBody = (await first.json()) as { snapshot: { id: string } };
    const secondBody = (await second.json()) as { snapshot: { id: string } };
    expect(firstBody.snapshot.id).toBe(secondBody.snapshot.id);
  });
});
