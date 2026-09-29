import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { Edge, Node, RelationType } from "@arcstar/contracts";
import {
  blastRadius,
  compareKeys,
  compareResolvedEdges,
  DEFAULT_BLAST_OPTIONS,
  resolveEdgesAsOf,
} from "./blast.js";
import type { Graph } from "./blast.js";

/**
 * As-of-dated edges. Spec: PLAN.md section 5.
 *
 * Edges carry `asOf`, which is what makes the temporal question answerable:
 * "what depended on this in March 2022", as distinct from "what depends on it
 * now". Without resolution, every query silently answers about the union of all
 * history, which is worse than having no dates at all because it looks correct.
 *
 * MODEL. An edge's `asOf` is the date from which that relationship holds. When
 * several edges describe the same (from, to, relation) triple, they form a
 * history, and a query resolves each triple to the most recent edge at or before
 * the requested date. A weight-0 edge acts as an end marker: the relationship
 * still resolves, but contributes nothing, so the dependency is gone from that
 * date onward.
 */

const NUM_RUNS = 150;
const T0 = new Date("2020-01-01T00:00:00Z");
const T1 = new Date("2021-01-01T00:00:00Z");
const T2 = new Date("2022-01-01T00:00:00Z");
const T3 = new Date("2023-01-01T00:00:00Z");

function node(id: string): Node {
  return { id, type: "country", label: id, props: {} };
}

function edge(from: string, to: string, asOf: Date, weight: number, relation: RelationType = "depends_on"): Edge {
  return { from, to, relation, weight, asOf };
}

function affected(g: Graph, target: string, asOf?: Date): string[] {
  return blastRadius(g, target, asOf ? { asOf } : {}).map((r) => r.node);
}

describe("resolveEdgesAsOf", () => {
  it("returns every edge untouched when no triple is repeated", () => {
    const edges = [edge("a", "b", T0, 0.5), edge("b", "c", T0, 0.5)];
    expect(resolveEdgesAsOf(edges, undefined)).toHaveLength(2);
  });

  it("resolves a repeated triple to the most recent edge when no date is given", () => {
    const resolved = resolveEdgesAsOf([edge("a", "b", T0, 0.5), edge("a", "b", T2, 0.9)], undefined);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.asOf).toBe(T2);
    expect(resolved[0]?.weight).toBe(0.9);
  });

  it("resolves to the most recent edge at or before the requested date", () => {
    const edges = [edge("a", "b", T0, 0.5), edge("a", "b", T2, 0.9)];
    expect(resolveEdgesAsOf(edges, T1)[0]?.asOf).toBe(T0);
    expect(resolveEdgesAsOf(edges, T2)[0]?.asOf).toBe(T2);
  });

  it("drops a triple entirely when the query predates every edge for it", () => {
    const resolved = resolveEdgesAsOf([edge("a", "b", T2, 0.9)], T1);
    expect(resolved).toHaveLength(0);
  });

  it("includes an edge whose asOf is exactly the query date", () => {
    const resolved = resolveEdgesAsOf([edge("a", "b", T1, 0.9)], T1);
    expect(resolved).toHaveLength(1);
  });

  it("treats different relations between the same pair as separate histories", () => {
    const resolved = resolveEdgesAsOf(
      [edge("a", "b", T0, 0.5, "depends_on"), edge("a", "b", T2, 0.9, "consumes")],
      undefined,
    );
    expect(resolved).toHaveLength(2);
  });

  it("resolves deterministically regardless of input order", () => {
    const edges = [edge("a", "b", T0, 0.5), edge("a", "b", T2, 0.9), edge("a", "b", T1, 0.7)];
    const forward = resolveEdgesAsOf(edges, undefined);
    const reversed = resolveEdgesAsOf([...edges].reverse(), undefined);
    expect(reversed).toEqual(forward);
  });

  it("resolves a corrupt same-triple same-date collision order-independently", () => {
    // Two edges claiming the same relationship on the same day is bad input.
    // It must still resolve identically regardless of the order they arrive in.
    const a = [edge("x", "y", T1, 0.2), edge("x", "y", T1, 0.8)];
    expect(resolveEdgesAsOf(a, T2)).toEqual(resolveEdgesAsOf([...a].reverse(), T2));
  });
});

describe("blastRadius - as-of dating", () => {
  it("answers the historical question, not the union of all history", () => {
    // A depended on B from 2020, weakly; from 2022 the relationship is recorded
    // much more strongly. A query between those dates must see the old weight.
    const g2 = {
      nodes: [node("a"), node("b")],
      edges: [edge("a", "b", T0, 0.2), edge("a", "b", T2, 0.9)],
    };

    const historical = blastRadius(g2, "b", { asOf: T1 });
    const current = blastRadius(g2, "b", { asOf: T3 });

    expect(historical.find((r) => r.node === "a")!.impactScore).toBeCloseTo(0.2 * 0.6, 10);
    expect(current.find((r) => r.node === "a")!.impactScore).toBeCloseTo(0.9 * 0.6, 10);
  });

  it("excludes a relationship that had not started yet at the query date", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", T2, 0.9)] };
    expect(affected(g, "b", T1)).toEqual([]);
    expect(affected(g, "b", T2)).toEqual(["a"]);
  });

  it("treats a zero-weight edge as the relationship ending", () => {
    // Strong dependency, then recorded at weight 0 from 2022: it is over.
    const g = {
      nodes: [node("a"), node("b")],
      edges: [edge("a", "b", T0, 0.9), edge("a", "b", T2, 0)],
    };
    expect(affected(g, "b", T1)).toEqual(["a"]);
    expect(affected(g, "b", T3)).toEqual([]);
  });

  it("ignores edge order when resolving history", () => {
    const g = {
      nodes: [node("a"), node("b")],
      edges: [edge("a", "b", T0, 0.2), edge("a", "b", T2, 0.9)],
    };
    const forward = blastRadius(g, "b", { asOf: T1 });
    const reversed = blastRadius({ ...g, edges: [...g.edges].reverse() }, "b", { asOf: T1 });
    expect(reversed).toEqual(forward);
  });

  it("still excludes the disrupted node at a historical date", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", T0, 0.5)] };
    expect(affected(g, "a", T1)).not.toContain("a");
  });

  it("returns nothing when asked about a time before the graph existed", () => {
    const g = { nodes: [node("a"), node("b")], edges: [edge("a", "b", T2, 0.9)] };
    expect(blastRadius(g, "b", { asOf: new Date("2019-01-01T00:00:00Z") })).toEqual([]);
  });

  it("handles a multi-hop historical chain", () => {
    // depends_on is reverse, so the chain runs c -> b -> a. The second link
    // only exists from 2022, so querying from c before that finds nothing at all,
    // and afterwards finds the full two-hop blast radius.
    const g = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b", T0, 1), edge("b", "c", T2, 1)],
    };
    expect(affected(g, "c", T1)).toEqual([]);
    expect(affected(g, "c", T3).sort()).toEqual(["a", "b"]);
  });
});

describe("resolved-edge ordering", () => {
  it("compareKeys is a total, antisymmetric order", () => {
    expect(compareKeys("a", "b")).toBeLessThan(0);
    expect(compareKeys("b", "a")).toBeGreaterThan(0);
    expect(compareKeys("a", "a")).toBe(0);
  });

  it("compareResolvedEdges orders by from, then to, then relation", () => {
    const mk = (from: string, to: string, relation: RelationType): Edge => edge(from, to, T0, 0.5, relation);
    // from dominates
    expect(compareResolvedEdges(mk("a", "z", "owns"), mk("b", "a", "owns"))).toBeLessThan(0);
    // then to
    expect(compareResolvedEdges(mk("a", "a", "owns"), mk("a", "b", "owns"))).toBeLessThan(0);
    // then relation
    expect(compareResolvedEdges(mk("a", "a", "consumes"), mk("a", "a", "owns"))).toBeLessThan(0);
  });

  it("sorts a resolved set into a stable order", () => {
    const edges = [
      edge("b", "x", T0, 0.5, "owns"),
      edge("a", "z", T0, 0.5, "owns"),
      edge("a", "a", T0, 0.5, "produces"),
      edge("a", "a", T0, 0.5, "consumes"),
    ];
    const keys = resolveEdgesAsOf(edges, undefined).map((e) => `${e.from}|${e.to}|${e.relation}`);
    expect(keys).toEqual(["a|a|consumes", "a|a|produces", "a|z|owns", "b|x|owns"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Property-based invariants.                                                 */
/* -------------------------------------------------------------------------- */

const dateArb = fc.integer({ min: 0, max: 5 }).map((n) => new Date(2019 + n, 0, 1));

const edgeArb = fc
  .tuple(fc.constantFrom("n0", "n1", "n2", "n3"), fc.constantFrom("n0", "n1", "n2", "n3"), dateArb, fc.integer({ min: 0, max: 10 }).map((w) => w / 10))
  .chain(([from, to, asOf, weight]) =>
    fc
      .constantFrom<RelationType>("depends_on", "supplies", "consumes", "produces", "transits_through", "owns", "located_in")
      .map((relation) => edge(from, to, asOf, weight, relation)),
  );

const edgeListArb = fc.array(edgeArb, { maxLength: 20 });

const NODES: Node[] = ["n0", "n1", "n2", "n3"].map(node);

test.prop([edgeListArb, dateArb], { numRuns: NUM_RUNS })(
  "DETERMINISM: as-of resolution is independent of edge order",
  (edges, asOf) => {
    const forward = resolveEdgesAsOf(edges, asOf);
    const reversed = resolveEdgesAsOf([...edges].reverse(), asOf);
    expect(reversed).toEqual(forward);
  },
);

test.prop([edgeListArb, dateArb], { numRuns: NUM_RUNS })(
  "TEMPORAL MONOTONICITY: querying an earlier date never includes a later edge",
  (edges, asOf) => {
    const earlier = new Date(asOf.getTime() - 365 * 24 * 3600 * 1000);
    const nowResolved = resolveEdgesAsOf(edges, asOf);
    const thenResolved = resolveEdgesAsOf(edges, earlier);
    for (const e of thenResolved) {
      expect(e.asOf.getTime()).toBeLessThanOrEqual(earlier.getTime());
      void nowResolved;
    }
  },
);

test.prop([edgeListArb, dateArb], { numRuns: NUM_RUNS })(
  "UNIQUE TRIPLES: resolution never returns two edges for the same (from, to, relation)",
  (edges, asOf) => {
    const resolved = resolveEdgesAsOf(edges, asOf);
    const keys = resolved.map((e) => `${e.from}|${e.to}|${e.relation}`);
    expect(new Set(keys).size).toBe(keys.length);
  },
);

test.prop([edgeListArb, dateArb], { numRuns: NUM_RUNS })(
  "NO FUTURE EDGES: every resolved edge is at or before the query date",
  (edges, asOf) => {
    for (const e of resolveEdgesAsOf(edges, asOf)) {
      expect(e.asOf.getTime()).toBeLessThanOrEqual(asOf.getTime());
    }
  },
);

test.prop([edgeListArb, dateArb], { numRuns: NUM_RUNS })(
  "DETERMINISM: blast radius with an as-of date is order invariant",
  (edges, asOf) => {
    const g: Graph = { nodes: NODES, edges };
    const reversed: Graph = { nodes: [...NODES].reverse(), edges: [...edges].reverse() };
    for (const id of NODES.map((n) => n.id)) {
      expect(blastRadius(reversed, id, { asOf })).toEqual(blastRadius(g, id, { asOf }));
    }
  },
);

test.prop([edgeListArb, dateArb], { numRuns: NUM_RUNS })(
  "BOUNDS: as-of results obey the same score ceiling and hop bound as undated ones",
  (edges, asOf) => {
    const g: Graph = { nodes: NODES, edges };
    for (const id of NODES.map((n) => n.id)) {
      for (const r of blastRadius(g, id, { asOf })) {
        expect(Number.isFinite(r.impactScore)).toBe(true);
        expect(r.impactScore).toBeLessThanOrEqual(DEFAULT_BLAST_OPTIONS.ceiling);
        expect(r.hops).toBeLessThanOrEqual(DEFAULT_BLAST_OPTIONS.maxHops);
      }
    }
  },
);
