import type { Claim, Source } from "@arcstar/contracts";

const AS_OF = new Date("2026-01-01T00:00:00Z");

export const demoSources: readonly Source[] = [
  { id: "reuters-1", publisher: "Reuters", tier: 1, publishedAt: AS_OF, citesSourceIds: [] },
  { id: "ap-1", publisher: "AP", tier: 1, publishedAt: AS_OF, citesSourceIds: [] },
  { id: "blog-1", publisher: "Blog", tier: 4, publishedAt: AS_OF, citesSourceIds: ["reuters-1"] },
];

export const demoClaim: Claim = {
  id: "claim-hormuz-1",
  text: "Transit through the Strait of Hormuz fell 40% in March.",
  subjectNodeId: "hormuz",
  assertedAt: AS_OF,
  supportingSourceIds: ["reuters-1", "ap-1", "blog-1"],
  contradictingSourceIds: [],
  extractionConfidence: 0.9,
};
