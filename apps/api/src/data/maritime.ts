import type { Edge, Node } from "@arcstar/contracts";

const AS_OF = new Date("2026-01-01T00:00:00Z");

function node(id: string, type: Node["type"], label: string): Node {
  return { id, type, label, props: {} };
}

function edge(from: string, to: string, relation: Edge["relation"], weight: number): Edge {
  return { from, to, relation, weight, asOf: AS_OF };
}

export const maritimeNodes: readonly Node[] = [
  node("hormuz", "chokepoint", "Strait of Hormuz"),
  node("qatar", "country", "Qatar"),
  node("saudi", "country", "Saudi Arabia"),
  node("uae", "country", "United Arab Emirates"),
  node("china", "country", "China"),
  node("japan", "country", "Japan"),
  node("korea", "country", "South Korea"),
  node("eu", "org", "European Union"),
  node("india", "country", "India"),
  node("oil", "commodity", "Crude oil"),
  node("gas", "commodity", "LNG"),
  node("shipping-route", "infrastructure", "Hormuz shipping route"),
  node("cape-route", "infrastructure", "Cape of Good Hope route"),
];

export const maritimeEdges: readonly Edge[] = [
  edge("qatar", "hormuz", "transits_through", 0.95),
  edge("saudi", "hormuz", "transits_through", 0.9),
  edge("uae", "hormuz", "transits_through", 0.85),
  edge("qatar", "gas", "produces", 1.0),
  edge("saudi", "oil", "produces", 1.0),
  edge("uae", "oil", "produces", 0.8),
  edge("shipping-route", "hormuz", "transits_through", 1.0),
  edge("china", "oil", "consumes", 0.8),
  edge("japan", "oil", "consumes", 0.75),
  edge("korea", "oil", "consumes", 0.75),
  edge("india", "oil", "consumes", 0.6),
  edge("eu", "gas", "consumes", 0.7),
  edge("china", "gas", "consumes", 0.65),
  edge("hormuz", "cape-route", "supplies", 0.3),
];

export const maritimeClaim = {
  id: "claim-maritime-hormuz-1",
  text: "Transit through the Strait of Hormuz fell 40% during the emergency period.",
  subjectNodeId: "hormuz",
};

export function maritimeGraph() {
  return { nodes: [...maritimeNodes], edges: [...maritimeEdges] };
}
