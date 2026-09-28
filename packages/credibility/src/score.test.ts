import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { Claim, Source, SourceTier } from "@arcstar/contracts";
import { METHOD_VERSION, scoreClaim } from "./score.js";

/**
 * Score composition. Spec: PLAN.md section 3.2.
 *
 *   base        = tierWeight(best independent source)   0.40 .. 0.90
 *   evidence    = any independent source has primary evidence ? 1.0 : 0.75
 *   gate        = base * evidence * extractionConfidence
 *   boost       = 1 - exp(-independence / 2)           saturates at 1
 *   score       = gate * (1 + 0.35 * boost)             ceiling 1.35
 *
 * Multiplicative gates, not a weighted average. A weighted average would let a
 * pile of weak corroboration rescue a single anonymous source, which is exactly
 * the failure mode this design exists to prevent.
 */

const NUM_RUNS = 200;

function source(
  id: string,
  opts: { tier?: SourceTier; citesSourceIds?: string[]; primaryEvidence?: string } = {},
): Source {
  return {
    id,
    publisher: `pub-${id}`,
    tier: opts.tier ?? 3,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    citesSourceIds: opts.citesSourceIds ?? [],
    ...(opts.primaryEvidence ? { primaryEvidence: opts.primaryEvidence } : {}),
  };
}

function claim(supportingSourceIds: string[], extractionConfidence = 0.9): Claim {
  return {
    id: "clm-1",
    text: "A claim under test.",
    subjectNodeId: "node-hormuz",
    assertedAt: new Date("2026-03-01T00:00:00Z"),
    supportingSourceIds,
    contradictingSourceIds: [],
    extractionConfidence,
  };
}

const sc = (c: Claim, all: Source[]) => scoreClaim({ claim: c, allSources: all });

describe("scoreClaim - worked examples", () => {
  it("scores a claim with no supporting sources at exactly 0", () => {
    const { score, explanation } = sc(claim([]), [source("a")]);
    expect(score.value).toBe(0);
    expect(explanation.finalScore).toBe(0);
  });

  it("stamps the method version on every score so results stay auditable", () => {
    const { score, explanation } = sc(claim(["a"]), [source("a")]);
    expect(score.methodVersion).toBe(METHOD_VERSION);
    expect(explanation.methodVersion).toBe(METHOD_VERSION);
  });

  it("ranks a wire-service source above an anonymous social source", () => {
    const wire = sc(claim(["a"]), [source("a", { tier: 1 })]);
    const anon = sc(claim(["b"]), [source("b", { tier: 5 })]);
    expect(wire.score.value).toBeGreaterThan(anon.score.value);
  });

  it("never lets corroboration rescue an anonymous source past a wire service", () => {
    // 10 independent anonymous sources, vs 1 wire service source.
    const many: string[] = [];
    const all: Source[] = [];
    for (let i = 0; i < 10; i += 1) {
      many.push(`anon-${i}`);
      all.push(source(`anon-${i}`, { tier: 5 }));
    }
    const anonymous = sc(claim(many), all);
    const wire = sc(claim(["wire"]), [source("wire", { tier: 1 })]);
    expect(anonymous.score.value).toBeLessThan(wire.score.value);
  });

  it("treats a cascade as a single source, not as the sum of its outlets", () => {
    // 15 outlets all citing one anonymous root. Independence must be 1.
    const all: Source[] = [source("root", { tier: 5 })];
    const supporting: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      all.push(source(`o${i}`, { tier: 1, citesSourceIds: ["root"] }));
      supporting.push(`o${i}`);
    }
    const cascaded = sc(claim(supporting), all);
    expect(cascaded.explanation.independentSources).toHaveLength(1);
    expect(cascaded.explanation.independentSources[0]?.sourceId).toBe("root");
    expect(cascaded.explanation.collapsedFrom).toBe(15);
  });

  it("increases with genuinely independent corroboration", () => {
    const one = sc(claim(["a"]), [source("a", { tier: 2 })]);
    const three = sc(
      claim(["a", "b", "c"]),
      [source("a", { tier: 2 }), source("b", { tier: 2 }), source("c", { tier: 2 })],
    );
    expect(three.score.value).toBeGreaterThan(one.score.value);
  });

  it("saturates rather than growing without bound", () => {
    const many = Array.from({ length: 200 }, (_, i) => source(`s${i}`, { tier: 2 }));
    const { score } = sc(claim(many.map((s) => s.id)), many);
    expect(score.value).toBeLessThanOrEqual(1.35);
  });

  it("raises the score when a primary document is attached", () => {
    const without = sc(claim(["a"]), [source("a", { tier: 2 })]);
    const withDoc = sc(claim(["a"]), [source("a", { tier: 2, primaryEvidence: "pdf" })]);
    expect(withDoc.score.value).toBeGreaterThan(without.score.value);
  });

  it("lowers the score when claim extraction was less certain", () => {
    const certain = sc(claim(["a"], 1), [source("a")]);
    const unsure = sc(claim(["a"], 0.4), [source("a")]);
    expect(unsure.score.value).toBeLessThan(certain.score.value);
  });

  it("scales linearly with extraction confidence at fixed evidence", () => {
    const full = sc(claim(["a"], 1), [source("a")]).score.value;
    const half = sc(claim(["a"], 0.5), [source("a")]).score.value;
    expect(half).toBeCloseTo(full / 2, 10);
  });

  it("ignores a supporting id that is not in the source graph", () => {
    const result = sc(claim(["ghost"]), [source("a")]);
    expect(result.score.value).toBe(0);
  });

  it("is deterministic - repeated calls produce identical output", () => {
    const all = [source("a", { tier: 1 }), source("b", { tier: 3, citesSourceIds: ["a"] })];
    const c = claim(["a", "b"]);
    const first = sc(c, all);
    const second = sc(c, all);
    expect(second).toEqual(first);
  });
});

describe("scoreClaim - explainability is mandatory", () => {
  it("gives a reason for the base on every non-zero score", () => {
    const { explanation } = sc(claim(["a"]), [source("a", { tier: 2 })]);
    expect(explanation.baseWhy.length).toBeGreaterThan(0);
  });

  it("names the publisher behind the base tier, not just a number", () => {
    const { explanation } = sc(claim(["a"]), [source("a", { tier: 1 })]);
    expect(explanation.baseWhy).toContain("pub-a");
  });

  it("lists the collapsed independent sources and their raw counts", () => {
    const all = [source("root", { tier: 5 }), source("o1", { citesSourceIds: ["root"] })];
    const { explanation } = sc(claim(["o1"]), all);
    expect(explanation.independentSources).toHaveLength(1);
    expect(explanation.collapsedFrom).toBe(1);
  });

  it("reproduces the final score from the explanation", () => {
    const all = [source("a", { tier: 1 }), source("b", { tier: 4 })];
    const { score, explanation } = sc(claim(["a", "b"]), all);
    expect(explanation.finalScore).toBe(score.value);
  });
});

/* ------------------------------------------------------------------------- */
/* Property-based invariants (PLAN.md section 4.2)                           */
/* ------------------------------------------------------------------------- */

const tierArb = fc.constantFrom<SourceTier>(1, 2, 3, 4, 5);
const confArb = fc.double({ min: 0, max: 1, noNaN: true });

function buildScoredForest(n: number, salt: number) {
  const all: Source[] = [];
  for (let i = 0; i < n; i += 1) {
    const cites: string[] = [];
    for (let j = 0; j < i; j += 1) if ((i * 13 + j * 29 + salt) % 100 < 35) cites.push(`s${j}`);
    all.push(
      source(`s${i}`, {
        tier: (((i + salt) % 5) + 1) as SourceTier,
        citesSourceIds: cites,
        ...((i + salt) % 3 === 0 ? { primaryEvidence: `doc-${i}` } : {}),
      }),
    );
  }
  const supporting = all.map((s) => s.id).filter((_, i) => (i * 5 + salt) % 4 !== 0);
  return { all, supporting };
}

const forestArb = fc
  .integer({ min: 1, max: 10 })
  .chain((n) => fc.integer({ min: 0, max: 1_000_000 }).map((salt) => buildScoredForest(n, salt)));

test.prop([forestArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 7 (bounds): every score lands in 0 .. 1.35",
  ({ all, supporting }, confidence) => {
    const { score } = scoreClaim({ claim: claim(supporting, confidence), allSources: all });
    expect(score.value).toBeGreaterThanOrEqual(0);
    expect(score.value).toBeLessThanOrEqual(1.35);
  },
);

test.prop([tierArb, tierArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 1 (tier monotonicity): a better-tiered source never scores lower",
  (tierA, tierB, confidence) => {
    const better = Math.min(tierA, tierB);
    const worse = Math.max(tierA, tierB);
    const low = scoreClaim({
      claim: claim(["s"], confidence),
      allSources: [source("s", { tier: worse })],
    }).score.value;
    const high = scoreClaim({
      claim: claim(["s"], confidence),
      allSources: [source("s", { tier: better })],
    }).score.value;
    expect(high).toBeGreaterThanOrEqual(low);
  },
);

test.prop([tierArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 2 (independence monotonicity): adding an independent source never lowers the score",
  (tier, confidence) => {
    const one = scoreClaim({
      claim: claim(["a"], confidence),
      allSources: [source("a", { tier })],
    }).score.value;
    const two = scoreClaim({
      claim: claim(["a", "b"], confidence),
      allSources: [source("a", { tier }), source("b", { tier })],
    }).score.value;
    expect(two).toBeGreaterThanOrEqual(one);
  },
);

test.prop([forestArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 6 (determinism): the same input always produces an identical result",
  ({ all, supporting }, confidence) => {
    const c = claim(supporting, confidence);
    const a = scoreClaim({ claim: c, allSources: all });
    const b = scoreClaim({ claim: c, allSources: all });
    expect(b).toEqual(a);
  },
);

test.prop([forestArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 5 (idempotence): scoring is a pure function of its inputs, not of prior calls",
  ({ all, supporting }, confidence) => {
    const c = claim(supporting, confidence);
    const first = scoreClaim({ claim: c, allSources: all });
    // Interleave an unrelated call to prove no hidden state leaks.
    scoreClaim({ claim: claim([], 0.5), allSources: [] });
    const third = scoreClaim({ claim: c, allSources: all });
    expect(third).toEqual(first);
  },
);

test.prop([forestArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 10 (explainability completeness): every non-zero score carries a full derivation",
  ({ all, supporting }, confidence) => {
    const { score, explanation } = scoreClaim({
      claim: claim(supporting, confidence),
      allSources: all,
    });
    if (score.value === 0) return;
    expect(explanation.baseWhy.length).toBeGreaterThan(0);
    expect(explanation.independentSources.length).toBeGreaterThan(0);
    expect(explanation.methodVersion).toBe(METHOD_VERSION);
    expect(explanation.finalScore).toBe(score.value);
  },
);

test.prop([forestArb, confArb], { numRuns: NUM_RUNS })(
  "INVARIANT 9 (empty support): a claim with no resolvable support scores exactly 0",
  (forest, _confidence) => {
    const result = scoreClaim({
      claim: claim(forest.supporting, 0.9),
      allSources: [], // nothing resolvable
    });
    expect(result.score.value).toBe(0);
  },
);

test.prop([forestArb, fc.integer({ min: 0, max: 1000 })], { numRuns: NUM_RUNS })(
  "order invariance: reordering the source graph never changes the score",
  (forest, salt) => {
    void salt;
    const c = claim(forest.supporting, 0.8);
    const forward = scoreClaim({ claim: c, allSources: forest.all }).score.value;
    const reversed = scoreClaim({ claim: c, allSources: [...forest.all].reverse() }).score.value;
    expect(reversed).toBeCloseTo(forward, 12);
  },
);
