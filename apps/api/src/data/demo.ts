import type { Claim, Edge, Node, Source } from "@arcstar/contracts";

const AS_OF = new Date("2026-01-01T00:00:00Z");

export const demoNodes: readonly Node[] = [
  { id: "hormuz", type: "chokepoint", label: "Strait of Hormuz", props: { capacityMbd: 20 } },
  { id: "qatar", type: "country", label: "Qatar", props: {} },
  { id: "saudi", type: "country", label: "Saudi Arabia", props: {} },
  { id: "oil", type: "commodity", label: "Crude oil", props: {} },
  { id: "iea", type: "org", label: "IEA", props: {} },
];

export const demoEdges: readonly Edge[] = [
  { from: "qatar", to: "hormuz", relation: "transits_through", weight: 0.9, asOf: AS_OF },
  { from: "saudi", to: "oil", relation: "produces", weight: 1, asOf: AS_OF },
];

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
