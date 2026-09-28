import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { Source } from "@arcstar/contracts";
import { independentSources } from "./independence.js";

/**
 * Cascade detection - the core innovation (PLAN.md section 3.2).
 *
 * N sources citing a single root count as 1, not N. This is what no existing
 * dashboard does, and it is the single most important piece of logic in Arcstar.
 *
 * The properties at the bottom are the product, not the test suite. If any of
 * them breaks, every credibility score downstream is unsound.
 */

const NUM_RUNS = 200;

function source(
  id: string,
  citesSourceIds: string[] = [],
  publisher = `pub-${id}`,
): Source {
  return {
    id,
    publisher,
    tier: 3,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    citesSourceIds,
  };
}

describe("independentSources - worked examples", () => {
  it("counts a single uncited source as one independent source", () => {
    const result = independentSources(["a"], [source("a")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceId).toBe("a");
    expect(result[0]?.collapsedFrom).toBe(1);
  });

  it("collapses many sources that all cite one root into a single independence unit", () => {
    // 20 outlets, one anonymous origin. This is the case that defeats naive counting.
    const all = [source("root-post", undefined, "anonymous-telegram")];
    const supporting: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const id = `outlet-${i}`;
      all.push(source(id, ["root-post"], `outlet-${i}`));
      supporting.push(id);
    }

    const result = independentSources(supporting, all);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceId).toBe("root-post");
    expect(result[0]?.collapsedFrom).toBe(20);
  });

  it("keeps genuinely independent sources separate", () => {
    const all = [source("a"), source("b"), source("c")];
    const result = independentSources(["a", "b", "c"], all);
    expect(result.map((r) => r.sourceId).sort()).toEqual(["a", "b", "c"]);
  });

  it("follows a multi-hop citation chain back to the origin", () => {
    // b cites a, c cites b, d cites c  => all one origin
    const all = [source("a"), source("b", ["a"]), source("c", ["b"]), source("d", ["c"])];
    const result = independentSources(["b", "c", "d"], all);
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceId).toBe("a");
    expect(result[0]?.collapsedFrom).toBe(3);
  });

  it("finds multiple origins when a shared ancestor branches", () => {
    // a and b are both origins; c cites a; d cites b  => 2 independent units
    const all = [source("a"), source("b"), source("c", ["a"]), source("d", ["b"])];
    const result = independentSources(["c", "d"], all);
    expect(result.map((r) => r.sourceId).sort()).toEqual(["a", "b"]);
  });

  it("counts two independent origins as two units even when a synthesis cites both", () => {
    // c synthesises two independent origins. a and b each witnessed the event
    // separately, so the claim has 2 independent units. c adds no corroboration
    // of its own, but it must not collapse a and b into 1 - that would understate
    // genuine corroboration, which is the opposite of what cascade detection is for.
    const all = [source("a"), source("b"), source("c", ["a", "b"])];
    const result = independentSources(["a", "b", "c"], all);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.sourceId).sort()).toEqual(["a", "b"]);
  });

  it("ignores sources outside the supporting set when they are not cited by anyone", () => {
    // x exists in the graph but nobody in the supporting set derives from it.
    const all = [source("a"), source("x")];
    const result = independentSources(["a"], all);
    expect(result.map((r) => r.sourceId)).toEqual(["a"]);
  });

  it("treats a direct citation cycle as a single cluster rather than looping forever", () => {
    const all = [source("a", ["b"]), source("b", ["a"])];
    const result = independentSources(["a", "b"], all);
    expect(result).toHaveLength(1);
  });

  it("treats a self-citing cycle as a single cluster", () => {
    const result = independentSources(["a"], [source("a", ["a"])]);
    expect(result).toHaveLength(1);
  });

  it("returns nothing for an empty supporting set", () => {
    expect(independentSources([], [source("a")])).toEqual([]);
  });

  it("ignores a supporting id that is absent from the source graph", () => {
    // A dangling id must not crash and must not be counted as an origin.
    const result = independentSources(["a", "ghost"], [source("a")]);
    expect(result.map((r) => r.sourceId)).toEqual(["a"]);
  });

  it("treats sources citing a deleted source as separate origins, and documents why", () => {
    // Real provenance data cites sources that were later deleted. Here a and b
    // BOTH cite "deleted-post", so they may well share a common origin.
    //
    // We deliberately do NOT collapse them. The shared root is unresolvable, and
    // inventing a dependency we cannot observe would fabricate evidence. Instead
    // the deleted id is excluded from the closure, which makes both a and b
    // genuine origins by the definition used everywhere else.
    //
    // KNOWN LIMITATION: this can overstate corroboration. Surfacing "provenance
    // incomplete" in the explanation layer is the fix, not collapsing on a guess.
    // Until that exists, this behaviour is pinned here deliberately.
    const all = [source("a", ["deleted-post"]), source("b", ["deleted-post"])];
    const result = independentSources(["a", "b"], all);
    expect(result.map((r) => r.sourceId)).toEqual(["a", "b"]);
    expect(result.every((r) => r.collapsedFrom === 1)).toBe(true);
  });

  it("treats a source citing a deleted source as an origin when nothing else claims it", () => {
    const all = [source("a", ["deleted-post"])];
    const result = independentSources(["a"], all);
    expect(result.map((r) => r.sourceId)).toEqual(["a"]);
    expect(result[0]?.collapsedFrom).toBe(1);
  });

  it("resolves through a citation chain that passes through a deleted source", () => {
    // b cites missing; c cites b. Only c and b are known. The chain terminates
    // at the missing id and b becomes the resolvable origin of the pair.
    const all = [source("b", ["missing"]), source("c", ["b"])];
    const result = independentSources(["c"], all);
    expect(result.map((r) => r.sourceId)).toEqual(["b"]);
    expect(result[0]?.collapsedFrom).toBe(1);
  });

  it("attributes a multi-origin synthesis to every origin it draws on", () => {
    // s5 cites s3 and s4, which trace back to BOTH s0 and s2. So s5 is evidence
    // for two independent origins at once. `collapsedFrom` is therefore a covering,
    // not a partition, and the per-origin counts are correct even though they
    // sum to more than the supporting count. This case was found by property-based
    // testing and is pinned here so the semantics cannot silently regress.
    const all = [
      source("s0"),
      source("s1", ["s0"]),
      source("s2"),
      source("s3", ["s1", "s2"]),
      source("s4", ["s0"]),
      source("s5", ["s3", "s4"]),
    ];
    const result = independentSources(["s0", "s2", "s3", "s5"], all);

    expect(result.map((r) => r.sourceId)).toEqual(["s0", "s2"]);
    const byId = new Map(result.map((r) => [r.sourceId, r.collapsedFrom]));
    // s0 <- s1 <- s3, and s0 <- s4 <- s5. Supporting = {s0, s2, s3, s5}.
    // s0 is reached by s0 (self), s3 (via s1), s5 (via s4) => 3.
    expect(byId.get("s0")).toBe(3);
    // s2 is reached by s2 (self), s3 (direct), s5 (via s3) => 3.
    // Sum is 6 against 4 supporting sources: s3 and s5 each feed BOTH origins,
    // which is exactly why collapsedFrom is a covering and not a partition.
    expect(byId.get("s2")).toBe(3);
  });
});

/* ------------------------------------------------------------------------- */
/* Property-based invariants. These ARE the product.                         */
/* ------------------------------------------------------------------------- */

/**
 * Builds an acyclic citation forest. Source i may only cite sources with a
 * lower index, which makes cycles impossible and keeps the generator total.
 * The `salt` drives deterministic pseudo-random edges so a failing run is
 * reproducible from its seed alone.
 */
function buildForest(size: number, salt: number) {
  const ids = Array.from({ length: size }, (_, i) => `s${i}`);
  const sources: Source[] = [];
  for (let i = 0; i < size; i += 1) {
    const cites: string[] = [];
    for (let j = 0; j < i; j += 1) {
      // roughly 40% edge density
      if ((i * 31 + j * 17 + salt) % 100 < 40) cites.push(ids[j]!);
    }
    sources.push(source(ids[i]!, cites));
  }
  const supporting = ids.filter((_, i) => (i * 7 + salt) % 10 < 6);
  return { sources, supporting, ids };
}

const acyclicForest = fc
  .integer({ min: 1, max: 12 })
  .chain((size) => fc.integer({ min: 0, max: 1_000_000 }).map((salt) => buildForest(size, salt)));

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "INVARIANT 3 (cascade collapse): a source shared by every supporting source yields exactly 1 independent unit",
  ({ sources, supporting }) => {
    if (supporting.length === 0) return;
    // Force total collapse: make every supporting source cite s0.
    const ids = sources.map((s) => s.id);
    const root = ids[0]!;
    const all: Source[] = sources.map((s) =>
      s.id === root ? s : { ...s, citesSourceIds: [root] },
    );
    const result = independentSources(supporting, all);
    expect(result).toHaveLength(1);
    expect(result[0]?.collapsedFrom).toBe(supporting.length);
  },
);

test.prop([acyclicForest, fc.integer({ min: 0, max: 1000 })], { numRuns: NUM_RUNS })(
  "INVARIANT 4 (order invariance): ingestion order never changes the result",
  ({ sources, supporting, ids }, salt) => {
    const forward = independentSources(supporting, sources);
    const reversed = independentSources([...supporting].reverse(), sources);
    expect(reversed.map((r) => r.sourceId).sort()).toEqual(
      forward.map((r) => r.sourceId).sort(),
    );
    expect(reversed.map((r) => r.collapsedFrom).sort()).toEqual(
      forward.map((r) => r.collapsedFrom).sort(),
    );
    void ids;
    void salt;
  },
);

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "the result is independent of the order of the source graph itself",
  ({ sources, supporting }) => {
    const forward = independentSources(supporting, sources);
    const reversed = independentSources(supporting, [...sources].reverse());
    expect(reversed.map((r) => r.sourceId).sort()).toEqual(
      forward.map((r) => r.sourceId).sort(),
    );
  },
);

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "a non-empty supporting set yields at least 1 and at most the closure size",
  ({ sources, supporting }) => {
    const result = independentSources(supporting, sources);
    if (supporting.length === 0) {
      expect(result).toHaveLength(0);
      return;
    }
    expect(result.length).toBeGreaterThanOrEqual(1);
    // NOTE: the upper bound is the closure size, NOT the supporting count. A
    // synthesis that cites two independent origins contributes two independence
    // units, so `independentCount <= supportingCount` is false in general.
    // Property-based testing found this; see the multi-origin regression above.
    const closureIds = new Set(supporting);
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of sources) {
        if (!closureIds.has(s.id)) continue;
        for (const c of s.citesSourceIds) {
          if (!closureIds.has(c)) {
            closureIds.add(c);
            grew = true;
          }
        }
      }
    }
    expect(result.length).toBeLessThanOrEqual(closureIds.size);
  },
);

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "collapsedFrom is a COVERING, not a partition: per-origin counts are bounded and the sum is at least the supporting count",
  ({ sources, supporting }) => {
    const result = independentSources(supporting, sources);
    for (const root of result) {
      expect(root.collapsedFrom).toBeGreaterThanOrEqual(1);
      expect(root.collapsedFrom).toBeLessThanOrEqual(supporting.length);
    }
    const total = result.reduce((sum, r) => sum + r.collapsedFrom, 0);
    // Every supporting source reaches at least one origin, so the covering never
    // sums to LESS than the supporting count. It may sum to more, because one
    // synthesis can feed several origins.
    expect(total).toBeGreaterThanOrEqual(supporting.length);
  },
);

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "every reported source exists in the supplied graph and is a true origin",
  ({ sources, supporting }) => {
    const byId = new Map(sources.map((s) => [s.id, s]));
    for (const root of independentSources(supporting, sources)) {
      const src = byId.get(root.sourceId);
      expect(src).toBeDefined();
      // An origin cites nothing that is itself inside the closure. We verify the
      // weaker but always-true property that it cites no *supporting* source.
      for (const cited of src?.citesSourceIds ?? []) {
        expect(supporting).not.toContain(cited);
      }
    }
  },
);

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "adding a source that cites an existing origin never increases the independent count",
  ({ sources, supporting, ids }) => {
    if (supporting.length === 0) return;
    const before = independentSources(supporting, sources);
    const freshId = "derived-fanout";
    const extra: Source = { ...source(freshId, [before[0]!.sourceId]) };
    const after = independentSources([freshId, ...supporting], [...sources, extra]);
    expect(after).toHaveLength(before.length);
    void ids;
  },
);

test.prop([acyclicForest], { numRuns: NUM_RUNS })(
  "cycle safety: a fully cyclic citation graph still terminates and returns one cluster",
  ({ sources }) => {
    const cyclic = sources.map((s, i) => ({
      ...s,
      citesSourceIds: [sources[(i + 1) % sources.length]!.id],
    }));
    const allIds = cyclic.map((s) => s.id);
    const result = independentSources(allIds, cyclic);
    expect(result).toHaveLength(1);
  },
);
