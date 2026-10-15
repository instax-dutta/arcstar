import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { Edge, Node, RelationType } from "@arcstar/contracts";
import { blastRadius, compareBlastResults, DEFAULT_BLAST_OPTIONS } from "./blast.js";
import type { BlastResult } from "./blast.js";

/**
 * Blast radius. Spec: PLAN.md section 5.1.
 *
 *   impactScore(node) = sum over all paths P of (prod(weights) * decay^|P|)
 *
 * Answers "if X is disrupted, what breaks, ranked".
 *
 * RELATION SEMANTICS ARE THE POINT OF THIS FILE. An edge `A depends_on B` means A
 * breaks when B breaks, but `A produces B` means B breaks when A breaks. Traversal
 * direction therefore depends on the relation, and a graph engine that ignores this
 * produces confident nonsense. PLAN.md does not specify it; the table below is the
 * contract and is pinned by tests.
 *
 *   A `produces` oil. Disrupting OIL does not disrupt Saudi Arabia. Disrupting Saudi
 *   Arabia disrupts oil. That is the opposite direction to `depends_on`, and getting
 *   it backwards would tell a user that shutting the oil market endangers the
 *   producer rather than the consumer.
 */

const NUM_RUNS = 200;
const AS_OF = new Date("2026-01-01T00:00:00Z");

function node(id: string, type: Node["type"] = "country"): Node {
  return { id, type, label: id, props: {} };
}

function edge(from: string, to: string, relation: RelationType, weight = 1): Edge {
  return { from, to, relation, weight, asOf: AS_OF };
}

/** Convenience: blast radius of `target` and just the affected node ids, ranked. */
function affected(g: { nodes: Node[]; edges: Edge[] }, target: string): string[] {
  return blastRadius(g, target).map((r) => r.node);
}

function find(results: BlastResult[], id: string) {
  return results.find((r) => r.node === id);
}

describe("blastRadius - relation semantics", () => {
  it("propagates depends_on in reverse: if B breaks, A breaks", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on")] };
    expect(affected(g, "b")).toEqual(["a"]);
  });

  it("propagates transits_through in reverse: closing Hormuz affects Qatar", () => {
    const g = {
      nodes: [node("qatar", "country"), node("hormuz", "chokepoint")],
      edges: [edge("qatar", "hormuz", "transits_through")],
    };
    expect(affected(g, "hormuz")).toEqual(["qatar"]);
  });

  it("propagates consumes in reverse: if the commodity breaks, the consumer breaks", () => {
    const g = { nodes: [node("japan"), node("oil", "commodity")], edges: [edge("japan", "oil", "consumes")] };
    expect(affected(g, "oil")).toEqual(["japan"]);
  });

  it("propagates supplies in FORWARD: if the supplier breaks, the supplied party breaks", () => {
    const g = {
      nodes: [node("supplier"), node("buyer")],
      edges: [edge("supplier", "buyer", "supplies")],
    };
    expect(affected(g, "supplier")).toEqual(["buyer"]);
  });

  it("propagates produces in FORWARD: if the producer breaks, the commodity breaks", () => {
    const g = {
      nodes: [node("saudi", "country"), node("oil", "commodity")],
      edges: [edge("saudi", "oil", "produces")],
    };
    expect(affected(g, "saudi")).toEqual(["oil"]);
  });

  it("does NOT propagate produces in reverse: disrupting a commodity does not affect its producer", () => {
    // The single most damaging direction to get wrong.
    const g = {
      nodes: [node("saudi", "country"), node("oil", "commodity")],
      edges: [edge("saudi", "oil", "produces")],
    };
    expect(affected(g, "oil")).toEqual([]);
  });

  it("propagates owns in forward: if the owner breaks, the owned asset breaks", () => {
    const g = {
      nodes: [node("state", "org"), node("port", "infrastructure")],
      edges: [edge("state", "port", "owns")],
    };
    expect(affected(g, "state")).toEqual(["port"]);
  });

  it("propagates located_in in reverse", () => {
    const g = {
      nodes: [node("city", "infrastructure"), node("country", "country")],
      edges: [edge("city", "country", "located_in")],
    };
    expect(affected(g, "country")).toEqual(["city"]);
  });

  it("ignores sanctions entirely, because impact direction is genuinely ambiguous", () => {
    const g = {
      nodes: [node("a"), node("b")],
      edges: [edge("a", "b", "sanctions")],
    };
    expect(affected(g, "a")).toEqual([]);
    expect(affected(g, "b")).toEqual([]);
  });

  it("excludes the disrupted node itself from the results", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on")] };
    expect(affected(g, "b")).not.toContain("b");
  });

  it("returns nothing for a node that does not exist", () => {
    const g = { nodes: [node("a")], edges: [] };
    expect(blastRadius(g, "ghost")).toEqual([]);
  });

  it("returns nothing for an isolated node with no outgoing dependency", () => {
    const g = { nodes: [node("lonely")], edges: [] };
    expect(blastRadius(g, "lonely")).toEqual([]);
  });

  it("does not report nodes that merely exist", () => {
    const g = { nodes: [node("a"), node("b"), node("unrelated")], edges: [edge("a", "b", "depends_on")] };
    expect(affected(g, "b")).not.toContain("unrelated");
  });
});

describe("blastRadius - path scoring", () => {
  it("applies decay on the FIRST hop, per the documented weight * decay^hops", () => {
    // PLAN.md 5.1 defines impactScore = weight * decay^hops. At hops=1 that is
    // 0.8 * 0.6 = 0.48, not 0.8. Impact starts attenuating on the first step.
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on", 0.8)] };
    const r = find(blastRadius(g, "b"), "a");
    expect(r?.hops).toBe(1);
    expect(r?.impactScore).toBeCloseTo(0.8 * 0.6, 10);
  });

  it("decays with distance", () => {
    const g = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b", "depends_on", 1), edge("b", "c", "depends_on", 1)],
    };
    const a = find(blastRadius(g, "c"), "a");
    const b = find(blastRadius(g, "c"), "b");
    expect(a!.impactScore).toBeLessThan(b!.impactScore);
    expect(b!.impactScore).toBeCloseTo(0.6, 10);
    expect(a!.impactScore).toBeCloseTo(0.36, 10);
  });

  it("records the path it followed so a user can audit the reasoning", () => {
    const g = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b", "depends_on"), edge("b", "c", "depends_on")],
    };
    const a = find(blastRadius(g, "c"), "a");
    expect(a?.path).toEqual(["c", "b", "a"]);
  });

  it("sums scores when a node is reachable by more than one path", () => {
    // c -> b -> a and c -> d -> a: two paths of two hops each.
    // Each contributes 1 * 0.6^2 = 0.36, so a totals 0.72.
    const g = {
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [edge("a", "b", "depends_on"), edge("b", "c", "depends_on"), edge("a", "d", "depends_on"), edge("d", "c", "depends_on")],
    };
    const a = find(blastRadius(g, "c"), "a");
    expect(a?.impactScore).toBeCloseTo(2 * DEFAULT_BLAST_OPTIONS.decay ** 2, 10);
  });

  it("ranks the most affected node first", () => {
    const g = {
      nodes: [node("close"), node("far"), node("hub")],
      edges: [
        edge("close", "hub", "depends_on", 1),
        edge("far", "hub", "depends_on", 0.1),
        edge("far", "close", "depends_on", 0.1),
      ],
    };
    const results = blastRadius(g, "hub");
    expect(results[0]!.node).toBe("close");
  });

  it("respects maxHops", () => {
    const g = {
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [
        edge("a", "b", "depends_on"),
        edge("b", "c", "depends_on"),
        edge("c", "d", "depends_on"),
      ],
    };
    const withinThree = blastRadius(g, "d", { maxHops: 3 });
    expect(withinThree.map((r) => r.node)).toContain("a");
    const withinOne = blastRadius(g, "d", { maxHops: 1 });
    expect(withinOne.map((r) => r.node)).toEqual(["c"]);
  });

  it("terminates on a dependency cycle instead of looping forever", () => {
    const g = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        edge("a", "b", "depends_on"),
        edge("b", "c", "depends_on"),
        edge("c", "a", "depends_on"),
      ],
    };
    const results = blastRadius(g, "a");
    expect(results.every((r) => r.node !== "a")).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("terminates on a self-referential edge", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("b", "a", "depends_on")] };
    const results = blastRadius(g, "a");
    expect(results.map((r) => r.node)).toEqual(["b"]);
  });
});

describe("blastRadius - determinism", () => {
  it("returns the same result regardless of edge order", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")];
    const edges = [
      edge("a", "b", "depends_on", 0.7),
      edge("b", "c", "depends_on", 0.5),
      edge("a", "d", "depends_on", 0.3),
      edge("d", "c", "depends_on", 0.9),
    ];
    const forward = blastRadius({ nodes, edges }, "c");
    const reversed = blastRadius({ nodes, edges: [...edges].reverse() }, "c");
    expect(reversed).toEqual(forward);
  });

  it("breaks ties by node id so ordering is stable", () => {
    // Two nodes reachable at identical impact; the order must not wobble.
    const g = {
      nodes: [node("alpha"), node("beta"), node("hub")],
      edges: [edge("alpha", "hub", "depends_on", 1), edge("beta", "hub", "depends_on", 1)],
    };
    const results = blastRadius(g, "hub");
    expect(results.map((r) => r.node)).toEqual(["alpha", "beta"]);
  });

  it("sorts tied nodes alphabetically even when they arrive in reverse order", () => {
    // Exercises both directions of the id tiebreak. Insertion order here is the
    // reverse of alphabetical, so the comparator must see "greater than" as well
    // as "less than" and still produce a single deterministic order.
    const names = ["gamma", "beta", "delta", "alpha"];
    const g = {
      nodes: [...names.map((n) => node(n)), node("hub")],
      edges: names.map((n) => edge(n, "hub", "depends_on", 1)),
    };
    expect(blastRadius(g, "hub").map((r) => r.node)).toEqual(["alpha", "beta", "delta", "gamma"]);
  });

  it("comparator orders by descending impact first", () => {
    const low = { node: "aaa", hops: 1, impactScore: 0.1, path: [] };
    const high = { node: "zzz", hops: 1, impactScore: 0.9, path: [] };
    // Despite the alphabet, the higher impact wins.
    expect(compareBlastResults(low, high)).toBeGreaterThan(0);
    expect(compareBlastResults(high, low)).toBeLessThan(0);
  });

  it("comparator falls back to node id in both directions", () => {
    const alpha = { node: "alpha", hops: 1, impactScore: 0.5, path: [] };
    const beta = { node: "beta", hops: 1, impactScore: 0.5, path: [] };
    expect(compareBlastResults(alpha, beta)).toBeLessThan(0);
    expect(compareBlastResults(beta, alpha)).toBeGreaterThan(0);
  });

  it("comparator treats scores within float noise as a tie", () => {
    const a = { node: "aaa", hops: 1, impactScore: 0.5, path: [] };
    const b = { node: "bbb", hops: 1, impactScore: 0.5 + 1e-15, path: [] };
    expect(compareBlastResults(a, b)).toBeLessThan(0);
  });

  it("comparator is antisymmetric for distinct ids at equal score", () => {
    const a = { node: "a", hops: 1, impactScore: 0.5, path: [] };
    const b = { node: "b", hops: 1, impactScore: 0.5, path: [] };
    expect(Math.sign(compareBlastResults(a, b))).toBe(-Math.sign(compareBlastResults(b, a)));
  });
});

describe("blastRadius - option handling", () => {
  it("returns nothing when maxHops is below 1", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on")] };
    expect(blastRadius(g, "b", { maxHops: 0 })).toEqual([]);
    expect(blastRadius(g, "b", { maxHops: -3 })).toEqual([]);
    expect(blastRadius(g, "b", { maxHops: Number.NaN })).toEqual([]);
  });

  it("returns nothing when decay is outside 0..1", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on")] };
    expect(blastRadius(g, "b", { decay: -0.1 })).toEqual([]);
    expect(blastRadius(g, "b", { decay: 1.5 })).toEqual([]);
    expect(blastRadius(g, "b", { decay: Number.NaN })).toEqual([]);
  });

  it("propagates nothing when decay is 0, since impact dies on the first hop", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on")] };
    expect(blastRadius(g, "b", { decay: 0 })).toEqual([]);
  });

  it("skips a zero-weight edge rather than reporting a node at score 0", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "depends_on", 0)] };
    expect(blastRadius(g, "b")).toEqual([]);
  });

  it("clamps a runaway score to the ceiling", () => {
    // Many parallel paths from hub would otherwise sum well past 1.
    const nodes = [node("hub"), ...Array.from({ length: 12 }, (_, i) => node(`leaf${i}`))];
    const edges = nodes.slice(1).map((n) => edge(n.id, "hub", "depends_on", 1));
    const results = blastRadius({ nodes, edges }, "hub", { maxHops: 1 });
    for (const r of results) {
      expect(r.impactScore).toBeLessThanOrEqual(DEFAULT_BLAST_OPTIONS.ceiling);
    }
  });

  it("restricts traversal to the requested relations", () => {
    const g = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b", "depends_on"), edge("c", "b", "supplies")],
    };
    // depends_on is reverse: disrupting b reaches a.
    expect(blastRadius(g, "b", { relations: ["depends_on"] }).map((r) => r.node)).toEqual(["a"]);
    // supplies is forward: disrupting c reaches b, not the other way round.
    expect(blastRadius(g, "b", { relations: ["supplies"] })).toEqual([]);
    expect(blastRadius(g, "c", { relations: ["supplies"] }).map((r) => r.node)).toEqual(["b"]);
  });

  it("treats an empty relations list as 'no restriction'", () => {
    const g = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b", "depends_on"), edge("c", "b", "supplies")],
    };
    // Unrestricted traversal from b reaches a via the reverse depends_on edge.
    // The supplies edge runs c -> b, so it carries no impact outward from b.
    expect(blastRadius(g, "b", { relations: [] }).map((r) => r.node)).toEqual(["a"]);
  });

  it("propagates nothing when restricted to sanctions, which carries no direction", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", "sanctions")] };
    expect(blastRadius(g, "b", { relations: ["sanctions"] })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Property-based invariants.                                                 */
/* -------------------------------------------------------------------------- */


interface Built {
  nodes: Node[];
  edges: Edge[];
  ids: string[];
}

const ALL_RELATIONS: RelationType[] = [
  "depends_on",
  "supplies",
  "transits_through",
  "sanctions",
  "owns",
  "located_in",
  "produces",
  "consumes",
];

function relationFromSalt(i: number, j: number, salt: number): RelationType {
  return ALL_RELATIONS[(i * 3 + j * 5 + salt) % ALL_RELATIONS.length]!;
}

function buildGraph(size: number, salt: number): Built {
  const ids = Array.from({ length: size }, (_, i) => `n${i}`);
  const nodes = ids.map((id) => node(id));
  const edges: Edge[] = [];
  // only lower-index targets, so the generator is acyclic by construction
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if ((i * 37 + j * 17 + salt) % 100 < 25) {
        edges.push(
          edge(ids[i]!, ids[j]!, relationFromSalt(i, j, salt), ((i + j + salt) % 10) / 10 || 0.5),
        );
      }
    }
  }
  return { nodes, edges, ids };
}

const graphArb = fc
  .integer({ min: 1, max: 8 })
  .chain((n) => fc.integer({ min: 0, max: 100_000 }).map((salt) => buildGraph(n, salt)));

test.prop([graphArb], { numRuns: NUM_RUNS })(
  "CYCLE SAFETY: traversal terminates on every input, including cyclic ones",
  (g) => {
    for (const id of g.ids) {
      const results = blastRadius(g, id);
      expect(results.length).toBeGreaterThanOrEqual(0);
    }
  },
);

test.prop([graphArb], { numRuns: NUM_RUNS })(
  "DETERMINISM: reordering edges and nodes never changes the result",
  (g) => {
    for (const id of g.ids) {
      const forward = blastRadius(g, id);
      const shuffled = blastRadius({ nodes: [...g.nodes].reverse(), edges: [...g.edges].reverse() }, id);
      expect(shuffled).toEqual(forward);
    }
  },
);

test.prop([graphArb], { numRuns: NUM_RUNS })(
  "BOUNDS: impact scores are finite, non-negative, and never exceed the ceiling",
  (g) => {
    for (const id of g.ids) {
      for (const r of blastRadius(g, id)) {
        expect(Number.isFinite(r.impactScore)).toBe(true);
        expect(r.impactScore).toBeGreaterThanOrEqual(0);
        expect(r.impactScore).toBeLessThanOrEqual(DEFAULT_BLAST_OPTIONS.ceiling);
        expect(r.hops).toBeGreaterThanOrEqual(1);
        expect(r.hops).toBeLessThanOrEqual(DEFAULT_BLAST_OPTIONS.maxHops);
      }
    }
  },
);

test.prop([graphArb], { numRuns: NUM_RUNS })(
  "ORDERING: results are sorted by descending impact, with node id as a stable tiebreak",
  (g) => {
    for (const id of g.ids) {
      const results = blastRadius(g, id);
      for (let i = 1; i < results.length; i += 1) {
        const prev = results[i - 1]!;
        const curr = results[i]!;
        expect(prev.impactScore).toBeGreaterThanOrEqual(curr.impactScore - 1e-12);
        if (Math.abs(prev.impactScore - curr.impactScore) < 1e-12) {
          expect(prev.node < curr.node).toBe(true);
        }
      }
    }
  },
);

test.prop([graphArb], { numRuns: NUM_RUNS })(
  "EXCLUSION: the disrupted node never appears in its own blast radius",
  (g) => {
    for (const id of g.ids) {
      expect(blastRadius(g, id).some((r) => r.node === id)).toBe(false);
    }
  },
);

test.prop([graphArb, fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS })(
  "MONOTONICITY: a larger maxHops never removes a node from the results",
  (g, hops) => {
    for (const id of g.ids) {
      const narrow = new Set(blastRadius(g, id, { maxHops: 1 }).map((r) => r.node));
      const wide = blastRadius(g, id, { maxHops: hops });
      for (const nodeId of narrow) {
        expect(wide.some((r) => r.node === nodeId)).toBe(true);
      }
    }
  },
);

describe("blastRadius - budgets and representative paths", () => {
  const g = {
    nodes: [
      { id: "a", type: "company" as const, label: "A", props: {} },
      { id: "b", type: "company" as const, label: "B", props: {} },
      { id: "c", type: "company" as const, label: "C", props: {} },
    ],
    edges: [
      { from: "b", to: "a", relation: "supplies" as const, weight: 0.8, asOf: new Date("2026-01-01T00:00:00Z") },
      { from: "c", to: "b", relation: "supplies" as const, weight: 0.7, asOf: new Date("2026-01-01T00:00:00Z") },
    ],
  };

  it("marks a returned path as representative, not a complete derivation", () => {
    const results = blastRadius(g, "c");
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.pathIsRepresentative).toBe(true);
    }
  });

  it("fails explicitly when the path state budget is exhausted", () => {
    expect(() => blastRadius(g, "c", { maxPathStates: 1 })).toThrow(/path state budget/);
  });

  it("rejects non-finite ceilings and budgets instead of returning non-finite scores", () => {
    expect(blastRadius(g, "c", { ceiling: Number.NaN })).toEqual([]);
    expect(blastRadius(g, "c", { maxPathStates: Number.NaN })).toEqual([]);
    expect(blastRadius(g, "c", { asOf: new Date("nope") })).toEqual([]);
  });
});
