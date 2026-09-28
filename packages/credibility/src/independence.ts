import type { IndependentSource, Source } from "@arcstar/contracts";

/**
 * Cascade detection - the core innovation (PLAN.md section 3.2).
 *
 * Twenty outlets citing one anonymous post is ONE independent source, not twenty.
 * This module is the reason Arcstar exists.
 *
 * Definitions used throughout:
 *
 *   - `cites` means "derives from". If X cites Y, then Y is upstream, i.e. more
 *     original, and X carries no independent information about Y.
 *   - The *closure* of a set is that set plus everything it transitively cites.
 *     We must traverse beyond the supporting set: two outlets that both cite an
 *     unlisted third party are NOT independent, even though that third party is
 *     not itself a supporting source.
 *   - An *origin* is a source in the closure that cites nothing else inside the
 *     closure. Origins are the independent units.
 *
 * Design decisions that are deliberate, not incidental:
 *
 *   1. A synthesis that cites two independent origins yields TWO units, not one.
 *      Counting connected components would merge genuine corroboration, which
 *      understates evidence - the exact failure mode cascade detection exists to
 *      prevent.
 *   2. Citation cycles are malformed input. A fully cyclic closure has no origin,
 *      so we return a single cluster with a deterministic representative rather
 *      than looping forever or returning zero.
 *   3. Every result is sorted by source id. Ingestion order must never influence
 *      the output, otherwise scores become irreproducible (INVARIANT 4).
 *
 * This module is pure. No clock, no I/O, no randomness.
 */

/** Transitive closure of `start` under `cites`, cycle-safe. */
function closureOf(start: Iterable<string>, byId: ReadonlyMap<string, Source>): Set<string> {
  const closure = new Set<string>();
  const stack = [...start];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (closure.has(current)) continue;
    // A dangling id is not a source we can reason about. Skip it rather than
    // inventing an origin for it.
    if (!byId.has(current)) continue;
    closure.add(current);
    for (const cited of byId.get(current)!.citesSourceIds) {
      if (!closure.has(cited)) stack.push(cited);
    }
  }

  return closure;
}

/** Everything `start` transitively cites, excluding `start` itself. */
function ancestorsOf(start: Source, byId: ReadonlyMap<string, Source>): Set<string> {
  const ancestors = new Set<string>();
  const stack = [...start.citesSourceIds];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (ancestors.has(current)) continue;
    // Real provenance data references sources that were since deleted. Skip them
    // rather than treating an unresolvable citation as an origin.
    if (!byId.has(current)) continue;
    ancestors.add(current);
    for (const cited of byId.get(current)!.citesSourceIds) {
      if (!ancestors.has(cited)) stack.push(cited);
    }
  }

  return ancestors;
}

/**
 * Collapse a set of supporting sources down to its independent origins.
 *
 * @param supportingSourceIds sources that support a claim. Ids absent from
 *   `allSources` are ignored - they cannot be resolved to a provenance chain.
 * @param allSources the full known source graph. Must be the whole graph, not
 *   just the supporting subset, because independence depends on shared ancestry
 *   that may live outside the supporting set.
 */
export function independentSources(
  supportingSourceIds: readonly string[],
  allSources: readonly Source[],
): IndependentSource[] {
  if (supportingSourceIds.length === 0) return [];

  const byId = new Map(allSources.map((s) => [s.id, s]));

  // Deduplicate the supporting set: the same source listed twice is one source.
  const supporting = [...new Set(supportingSourceIds)].filter((id) => byId.has(id));
  if (supporting.length === 0) return [];

  const closure = closureOf(supporting, byId);

  // An origin cites nothing that is also inside the closure.
  const origins = [...closure]
    .filter((id) => {
      const cited = byId.get(id)!.citesSourceIds;
      return !cited.some((c) => closure.has(c));
    })
    .sort();

  // Fully cyclic closure: no origin exists. Malformed input, so report one
  // cluster with a deterministic representative.
  if (origins.length === 0) {
    const representative = [...closure].sort()[0]!;
    return [
      {
        sourceId: representative,
        publisher: byId.get(representative)!.publisher,
        tier: byId.get(representative)!.tier,
        collapsedFrom: supporting.length,
      },
    ];
  }

  // Every supporting source is attributed to each origin it derives from, so the
  // collapsedFrom values cover the supporting count without losing any source.
  const ancestorCache = new Map<string, Set<string>>();
  for (const id of supporting) ancestorCache.set(id, ancestorsOf(byId.get(id)!, byId));

  return origins.map((originId) => {
    const origin = byId.get(originId)!;
    let collapsedFrom = 0;
    for (const id of supporting) {
      if (id === originId || ancestorCache.get(id)!.has(originId)) collapsedFrom += 1;
    }
    return {
      sourceId: originId,
      publisher: origin.publisher,
      tier: origin.tier,
      collapsedFrom,
    };
  });
}
