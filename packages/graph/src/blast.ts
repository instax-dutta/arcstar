import type { Edge, Node, RelationType } from "@arcstar/contracts";

/**
 * Blast radius. Spec: PLAN.md section 5.1.
 *
 *   impactScore(node) = sum over all paths P from the disrupted node of
 *                       (prod(edge weights along P) * decay^|P|)
 *
 * Answers the question the product exists to ask: "if X is disrupted, what breaks,
 * ranked, and how strongly".
 *
 * RELATION DIRECTION IS THE CORE OF THIS MODULE.
 *
 * An edge `A depends_on B` means A breaks when B breaks, so impact travels B -> A.
 * An edge `A produces B` means B breaks when A breaks, so impact travels A -> B.
 * The same edge direction means opposite things for different relations, and a
 * traversal that ignores this produces confident nonsense: it would report that
 * shutting the oil market endangers Saudi Arabia rather than its consumers.
 *
 * PLAN.md does not specify this table. It is established here and pinned by tests.
 *
 * This module is pure: no clock, no randomness, no I/O.
 */

/** How far impact travels along an edge of each relation type. */
export type Propagation = "reverse" | "forward" | "none";

/**
 * `reverse` = the `to` node propagates impact to the `from` node.
 * `forward` = the `from` node propagates impact to the `to` node.
 * `none`    = the relation carries no impact in either direction.
 */
export const PROPAGATION: Record<RelationType, Propagation> = {
  // A depends_on B -> B breaking hurts A.
  depends_on: "reverse",
  // A transits_through B -> closing B stops A.
  transits_through: "reverse",
  // A consumes B -> losing B hurts A.
  consumes: "reverse",
  // A located_in B -> disruption in B reaches A.
  located_in: "reverse",

  // A supplies B -> B depends on A, so A breaking hurts B.
  supplies: "forward",
  // A produces B -> A breaking stops B.
  produces: "forward",
  // A owns B -> A breaking endangers B.
  owns: "forward",

  // Sanctions have no single honest impact direction: a tightening or a relaxation
  // move opposite ways, and guessing would manufacture a blast radius nobody can
  // defend. Excluded until we can model the direction explicitly.
  sanctions: "none",
};

export interface Graph {
  nodes: readonly Node[];
  edges: readonly Edge[];
}

export interface BlastOptions {
  /** Maximum dependency hops to follow. Also bounds the path count, which is what
   *  makes traversal tractable in a cyclic graph. */
  maxHops: number;
  /** Score multiplier applied per hop. Below 1 so distance attenuates impact. */
  decay: number;
  /** Hard ceiling on any single impact score, so a dense graph cannot produce a
   *  meaningless 1e12 that renders useless next to everything else. */
  ceiling: number;
  /** Upper bound on frontier path states generated during traversal. */
  maxPathStates?: number;
  /** Restrict traversal to these relations. Defaults to all impact-bearing ones. */
  relations?: readonly RelationType[];
  /**
   * Resolve the edge history to this instant, so the query answers "what was true
   * then" rather than the union of all history. See `resolveEdgesAsOf`.
   */
  asOf?: Date;
}

/**
 * Resolve an edge history to a single snapshot as of a given date.
 *
 * An edge's `asOf` is the date from which that relationship holds. Several edges
 * sharing a (from, to, relation) triple therefore form a history, and a query
 * resolves each triple to the most recent edge at or before the requested date.
 *
 * A weight-0 edge is a valid resolution and acts as an end marker: the
 * relationship still exists at that date but contributes nothing, so the
 * dependency is gone from that point on.
 *
 * `asOf` of `undefined` means "now": each triple resolves to its most recent edge
 * overall.
 *
 * Order independence is a hard requirement, not a nicety. Two edges claiming the
 * same relationship on the same day is corrupt upstream data, but it must still
 * resolve identically however it arrives, so an exact collision takes the maximum
 * weight rather than whichever edge the array happened to place last.
 */
export function resolveEdgesAsOf(edges: readonly Edge[], asOf: Date | undefined): Edge[] {
  const cutoff = asOf?.getTime();
  const best = new Map<string, Edge>();

  for (const e of edges) {
    const t = e.asOf.getTime();
    if (cutoff !== undefined && t > cutoff) continue;

    const key = `${e.from}|${e.to}|${e.relation}`;
    const current = best.get(key);
    if (current === undefined) {
      best.set(key, e);
      continue;
    }
    const currentT = current.asOf.getTime();
    if (t > currentT) {
      best.set(key, e);
    } else if (t === currentT && e.weight > current.weight) {
      // Same instant, different weight: corrupt input. Take the maximum so the
      // result does not depend on array order.
      best.set(key, e);
    }
  }

  // Stable output order so callers and tests see a deterministic sequence.
  return [...best.values()].sort(compareResolvedEdges);
}

/** Three-way string comparison. Total and order-independent. */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic ordering for a resolved edge set: by from, then to, then relation.
 * Exported so the ordering contract can be tested directly rather than only through
 * whatever comparisons a particular sort implementation happens to make.
 */
export function compareResolvedEdges(a: Edge, b: Edge): number {
  return compareKeys(a.from, b.from) || compareKeys(a.to, b.to) || compareKeys(a.relation, b.relation);
}

export const DEFAULT_BLAST_OPTIONS: BlastOptions = {
  maxHops: 3,
  decay: 0.6,
  ceiling: 1,
  maxPathStates: 100000,
};

const DEFAULT_MAX_PATH_STATES = 100000;

/**
 * Version for graph traversal semantics. Changing propagation, aggregation, tie
 * breaking, or budgets requires a version bump and a PLAN.md correction.
 */
export const GRAPH_METHOD_VERSION = "graph@1.0.0";

export class GraphBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphBudgetError";
  }
}

export interface BlastResult {
  node: string;
  /** Hops from the disrupted node. Always >= 1; the node itself is excluded. */
  hops: number;
  impactScore: number;
  /**
   * One path that reached `node`. The score sums all bounded paths, so this is a
   * representative example, not a complete derivation.
   */
  path: string[];
  pathIsRepresentative: true;
}

interface Accumulator {
  score: number;
  hops: number;
  path: string[];
}

/**
 * Build the impact adjacency once per call: for every node, the nodes it can
 * impact next, and at what strength. Precomputing this keeps the traversal
 * independent of the order edges happen to appear in.
 */
function buildImpactAdjacency(
  graph: Graph,
  allowed: ReadonlySet<RelationType>,
): Map<string, { to: string; weight: number }[]> {
  const adjacency = new Map<string, { to: string; weight: number }[]>();
  const push = (from: string, entry: { to: string; weight: number }) => {
    const list = adjacency.get(from);
    if (list) list.push(entry);
    else adjacency.set(from, [entry]);
  };

  for (const e of graph.edges) {
    if (!allowed.has(e.relation)) continue;
    const direction = PROPAGATION[e.relation];
    if (direction === "reverse") {
      // B breaks -> A breaks
      push(e.to, { to: e.from, weight: e.weight });
    } else if (direction === "forward") {
      // A breaks -> B breaks
      push(e.from, { to: e.to, weight: e.weight });
    }
  }

  // Sort each adjacency list by target id so traversal order is deterministic.
  for (const list of adjacency.values()) list.sort((a, b) => (a.to < b.to ? -1 : 1));
  return adjacency;
}

/**
 * Total order for blast results: descending impact, then ascending node id.
 *
 * The tiebreak is not cosmetic. Without it, equal-scoring nodes would reorder
 * between calls and the rendered list would flicker, which is corrosive to trust
 * in a number people are meant to act on.
 *
 * Exported so the ordering contract can be tested directly rather than only
 * through whatever comparisons a particular sort implementation happens to make.
 */
export function compareBlastResults(a: BlastResult, b: BlastResult): number {
  if (Math.abs(b.impactScore - a.impactScore) > 1e-12) return b.impactScore - a.impactScore;
  // Ids come from Map keys and are therefore unique, so this never ties.
  return a.node < b.node ? -1 : 1;
}

export function blastRadius(
  graph: Graph,
  disruptedNode: string,
  options: Partial<BlastOptions> = {},
): BlastResult[] {
  const { maxHops, decay, ceiling, relations, asOf } = {
    ...DEFAULT_BLAST_OPTIONS,
    ...options,
  };
  const maxPathStates = options.maxPathStates ?? DEFAULT_MAX_PATH_STATES;

  if (!Number.isFinite(maxHops) || maxHops < 1) return [];
  if (!Number.isFinite(decay) || decay < 0 || decay > 1) return [];
  if (!Number.isFinite(ceiling) || ceiling < 0) return [];
  if (!Number.isFinite(maxPathStates) || maxPathStates < 1) return [];
  if (asOf !== undefined && Number.isNaN(asOf.getTime())) return [];

  // Resolve the edge history before building the adjacency, so a dated query
  // sees the graph as it stood rather than the union of all history.
  const resolvedEdges = asOf === undefined ? graph.edges : resolveEdgesAsOf(graph.edges, asOf);

  const allowed =
    relations && relations.length > 0
      ? new Set(relations)
      : new Set(ALL_IMPACT_RELATIONS);
  const adjacency = buildImpactAdjacency({ nodes: graph.nodes, edges: resolvedEdges }, allowed);

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  if (!nodeIds.has(disruptedNode)) return [];

  // Accumulate by hop level. Because maxHops is finite, the number of paths is
  // finite even when the graph contains cycles, which is what makes this safe.
  const totals = new Map<string, Accumulator>();
  let frontier = new Map<string, Accumulator>([
    [disruptedNode, { score: 1, hops: 0, path: [disruptedNode] }],
  ]);
  let pathStates = 1;

  for (let hop = 1; hop <= maxHops; hop += 1) {
    const next = new Map<string, Accumulator>();

    for (const [current, acc] of frontier) {
      const outgoing = adjacency.get(current);
      if (!outgoing) continue;
      for (const { to, weight } of outgoing) {
        // Never let a path revisit the disrupted node; that would be a cycle back
        // to the origin and would otherwise inflate the origin's neighbours.
        if (acc.path.includes(to)) continue;
        const contribution = acc.score * weight * decay;
        if (contribution <= 0) continue;
        pathStates += 1;
        if (pathStates > maxPathStates) {
          throw new GraphBudgetError("blast radius exceeded its path state budget");
        }
        const existing = next.get(to);
        if (existing) {
          // Several edges converge on `to` at the same level. Every entry in
          // `next` was created at the current `hop`, so there is no shorter-path
          // comparison to make here: the stored path is already minimal, and only
          // the score accumulates.
          existing.score += contribution;
        } else {
          next.set(to, { score: contribution, hops: hop, path: [...acc.path, to] });
        }
      }
    }

    // Fold this level into the totals. A node reached by several paths at
    // different depths sums every contribution, which is what makes the score
    // "how many ways can this break" rather than "how far is it".
    //
    // Levels are processed in ascending hop order, so the first time a node is
    // seen is always at its minimum hop count. A later, longer path can only add
    // to the score - it can never improve the stored path.
    for (const [id, acc] of next) {
      const existing = totals.get(id);
      if (existing) {
        existing.score += acc.score;
      } else {
        totals.set(id, { ...acc, path: [...acc.path] });
      }
    }

    if (next.size === 0) break;
    frontier = next;
  }

  // The origin is excluded: the question is what else breaks.
  totals.delete(disruptedNode);

  return [...totals.entries()]
    .map(([id, acc]) => ({
      node: id,
      hops: acc.hops,
      impactScore: Math.min(acc.score, ceiling),
      path: acc.path,
      pathIsRepresentative: true as const,
    }))
    .sort(compareBlastResults);
}

const ALL_IMPACT_RELATIONS: readonly RelationType[] = Object.keys(PROPAGATION).filter(
  (r) => PROPAGATION[r as RelationType] !== "none",
) as RelationType[];
