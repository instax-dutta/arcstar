import { describe, expect, it } from "vitest";
import {
  AssessmentSchema,
  ClaimSchema,
  EdgeSchema,
  NodeSchema,
  ScoreSchema,
  SourceLineageGapSchema,
  SourceSchema,
  type Claim,

  type Source,
} from "./index.js";

/**
 * Spec source: PLAN.md section 3.1 (core types) and 3.5 (explainability).
 * These tests encode the contract. They are written before the schemas.
 */

const VALID_SOURCE: Source = {
  id: "src-reuters-1",
  publisher: "Reuters",
  tier: 1,
  publishedAt: new Date("2026-03-01T08:00:00Z"),
  citesSourceIds: [],
};

const VALID_CLAIM: Claim = {
  id: "clm-1",
  text: "Transit through the Strait of Hormuz fell 40% in March.",
  subjectNodeId: "node-hormuz",
  assertedAt: new Date("2026-03-02T00:00:00Z"),
  supportingSourceIds: ["src-reuters-1"],
  contradictingSourceIds: [],
  extractionConfidence: 0.9,
};

describe("SourceSchema", () => {
  it("accepts a well-formed source", () => {
    expect(SourceSchema.parse(VALID_SOURCE)).toEqual(VALID_SOURCE);
  });

  it("rejects a tier outside 1..5", () => {
    expect(() => SourceSchema.parse({ ...VALID_SOURCE, tier: 0 })).toThrow();
    expect(() => SourceSchema.parse({ ...VALID_SOURCE, tier: 6 })).toThrow();
    expect(() => SourceSchema.parse({ ...VALID_SOURCE, tier: 2.5 })).toThrow();
  });

  it("requires a non-empty id and publisher", () => {
    expect(() => SourceSchema.parse({ ...VALID_SOURCE, id: "" })).toThrow();
    expect(() => SourceSchema.parse({ ...VALID_SOURCE, publisher: "  " })).toThrow();
  });

  it("rejects a self-referential citation", () => {
    expect(() =>
      SourceSchema.parse({ ...VALID_SOURCE, citesSourceIds: ["src-reuters-1"] }),
    ).toThrow();
  });

  it("treats primaryEvidence as optional", () => {
    const { primaryEvidence: _dropped, ...withoutEvidence } = VALID_SOURCE;
    expect(SourceSchema.parse(withoutEvidence)).toEqual(withoutEvidence);
  });
  it("rejects an invalid published date", () => {
    expect(() => SourceSchema.parse({ ...VALID_SOURCE, publishedAt: new Date("not-a-date") })).toThrow();
  });
});

describe("ClaimSchema", () => {
  it("accepts a well-formed claim", () => {
    expect(ClaimSchema.parse(VALID_CLAIM)).toEqual(VALID_CLAIM);
  });

  it("rejects an invalid asserted date", () => {
    expect(() => ClaimSchema.parse({ ...VALID_CLAIM, assertedAt: new Date("not-a-date") })).toThrow();
  });

  it("requires extractionConfidence within 0..1", () => {
    expect(() =>
      ClaimSchema.parse({ ...VALID_CLAIM, extractionConfidence: -0.1 }),
    ).toThrow();
    expect(() => ClaimSchema.parse({ ...VALID_CLAIM, extractionConfidence: 1.1 })).toThrow();
  });

  it("accepts the boundary values 0 and 1 for extractionConfidence", () => {
    expect(ClaimSchema.parse({ ...VALID_CLAIM, extractionConfidence: 0 }).extractionConfidence).toBe(0);
    expect(ClaimSchema.parse({ ...VALID_CLAIM, extractionConfidence: 1 }).extractionConfidence).toBe(1);
  });

  it("rejects a claim that lists the same source as support and contradiction", () => {
    expect(() =>
      ClaimSchema.parse({
        ...VALID_CLAIM,
        contradictingSourceIds: ["src-reuters-1"],
      }),
    ).toThrow();
  });
});

describe("ScoreSchema", () => {
  it("rejects scores above the documented ceiling of 1.35", () => {
    expect(() => ScoreSchema.parse({ value: 1.35, methodVersion: "credibility@1.0.0" })).not.toThrow();
    expect(() => ScoreSchema.parse({ value: 1.36, methodVersion: "credibility@1.0.0" })).toThrow();
  });

  it("rejects negative scores", () => {
    expect(() => ScoreSchema.parse({ value: -0.01, methodVersion: "credibility@1.0.0" })).toThrow();
  });

  it("requires a methodVersion so scores stay auditable over time", () => {
    expect(() => ScoreSchema.parse({ value: 0.5 })).toThrow();
    expect(() => ScoreSchema.parse({ value: 0.5, methodVersion: "" })).toThrow();
  });
});

describe("NodeSchema", () => {
  it("accepts a well-formed node", () => {
    const node = {
      id: "node-hormuz",
      type: "chokepoint",
      label: "Strait of Hormuz",
      props: { capacityMbd: 20 },
    };
    expect(NodeSchema.parse(node)).toEqual(node);
  });

  it("rejects an unknown node type", () => {
    expect(() =>
      NodeSchema.parse({ id: "n1", type: "spaceship", label: "x", props: {} }),
    ).toThrow();
  });
});

describe("EdgeSchema", () => {
  it("accepts a well-formed edge and keeps the asOf date", () => {
    const edge = {
      from: "node-qatar",
      to: "node-hormuz",
      relation: "transits_through",
      weight: 0.8,
      asOf: new Date("2026-01-01T00:00:00Z"),
    };
    const parsed = EdgeSchema.parse(edge);
    expect(parsed.asOf).toBeInstanceOf(Date);
    expect(parsed.asOf.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects an invalid asOf date", () => {
    expect(() =>
      EdgeSchema.parse({
        from: "a",
        to: "b",
        relation: "depends_on",
        weight: 1,
        asOf: new Date("not-a-date"),
      }),
    ).toThrow();
  });

  it("rejects an unknown relation type", () => {
    expect(() =>
      EdgeSchema.parse({
        from: "a",
        to: "b",
        relation: "vibes_with",
        weight: 1,
        asOf: new Date(),
      }),
    ).toThrow();
  });

  it("rejects a self-loop", () => {
    expect(() =>
      EdgeSchema.parse({
        from: "node-hormuz",
        to: "node-hormuz",
        relation: "depends_on",
        weight: 1,
        asOf: new Date(),
      }),
    ).toThrow();
  });

  it("rejects a weight outside 0..1", () => {
    const base = {
      from: "a",
      to: "b",
      relation: "depends_on" as const,
      asOf: new Date(),
    };
    expect(() => EdgeSchema.parse({ ...base, weight: 1.01 })).toThrow();
    expect(() => EdgeSchema.parse({ ...base, weight: -0.01 })).toThrow();
  });
});

describe("AssessmentSchema", () => {
  it("stores an exact input snapshot and snapshot reference", () => {
    const snapshot = {
      claim: VALID_CLAIM,
      allSources: [VALID_SOURCE],
      contradictingClaims: [],
    };
    const assessment = AssessmentSchema.parse({
      claimId: VALID_CLAIM.id,
      score: { value: 0.8, methodVersion: "credibility@1.0.0" },
      explanation: {
        base: 0.9,
        baseWhy: "wire",
        independentSources: [],
        collapsedFrom: 1,
        contradiction: [],
        finalScore: 0.8,
        methodVersion: "credibility@1.0.0",
      },
      assessedAt: new Date("2026-10-15T00:00:00Z"),
      inputSnapshotRef: "snapshot-1",
      inputSnapshot: snapshot,
    });
    expect(assessment.inputSnapshot).toEqual(snapshot);
  });
});

describe("SourceLineageGapSchema", () => {
  it("stores unresolved lineage as a first-class state", () => {
    const gap = SourceLineageGapSchema.parse({
      fromSourceId: "s1",
      unresolvedSourceRef: "missing-anchor",
      status: "unknown",
    });
    expect(gap.status).toBe("unknown");
  });
});

describe("Source lineage contract", () => {
  it("accepts full lineage records that match the citation list", () => {
    const source = SourceSchema.parse({
      ...VALID_SOURCE,
      citesSourceIds: ["upstream"],
      lineage: [
        {
          fromSourceId: VALID_SOURCE.id,
          toSourceId: "upstream",
          kind: "syndicates",
          status: "verified",
          evidence: "shared release",
        },
      ],
    });
    expect(source.lineage?.[0]?.kind).toBe("syndicates");
  });

  it("rejects lineage for a source that is not in citesSourceIds", () => {
    expect(() =>
      SourceSchema.parse({
        ...VALID_SOURCE,
        citesSourceIds: [],
        lineage: [
          { fromSourceId: VALID_SOURCE.id, toSourceId: "upstream", kind: "cites", status: "observed" },
        ],
      }),
    ).toThrow();
  });

  it("rejects lineage that claims to come from another source", () => {
    expect(() =>
      SourceSchema.parse({
        ...VALID_SOURCE,
        citesSourceIds: ["upstream"],
        lineage: [
          { fromSourceId: "someone-else", toSourceId: "upstream", kind: "cites", status: "observed" },
        ],
      }),
    ).toThrow();
  });

  it("stores valid and observed edge metadata", () => {
    const edge = EdgeSchema.parse({
      from: "a",
      to: "b",
      relation: "depends_on",
      weight: 0.5,
      asOf: new Date("2026-01-01T00:00:00Z"),
      observedAt: new Date("2026-02-01T00:00:00Z"),
      verificationState: "estimated",
      evidenceRefs: ["doc-1"],
    });
    expect(edge.observedAt?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(edge.verificationState).toBe("estimated");
  });
});
