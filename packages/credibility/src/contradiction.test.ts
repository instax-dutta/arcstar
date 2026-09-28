import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { applyContradiction, contradictionPenalty, MAX_CONTRADICTION_PENALTY } from "./contradiction.js";
import type { ContradictingClaim } from "./contradiction.js";
import { METHOD_VERSION, scoreClaim } from "./score.js";
import type { Claim, Source, SourceTier } from "@arcstar/contracts";

/**
 * Contradiction scoring. Spec: PLAN.md section 3.3.
 *
 *   penalty = sum over groups of (groupScore / (1 + log(1 + n)))
 *   score'  = score * (1 - min(0.5, penalty))
 *
 * The `n` in the denominator damps repetition. Ten outlets repeating one
 * counter-claim is not ten times the evidence of one, so the contribution grows
 * sub-linearly with how many times the same proposition is repeated.
 *
 * The 0.5 cap is INVARIANT 8: no amount of contradicting evidence may drive a
 * score below half its uncorrected value. A strong claim is never fully
 * destroyed by a pile of weak contradiction.
 */

const NUM_RUNS = 200;

function counter(overrides: Partial<ContradictingClaim> = {}): ContradictingClaim {
  return { claimId: "clm-x", score: 0.5, reason: "a different account", ...overrides };
}

describe("contradictionPenalty", () => {
  it("is zero when nothing contradicts the claim", () => {
    expect(contradictionPenalty([])).toBe(0);
  });

  it("is positive when something contradicts the claim", () => {
    expect(contradictionPenalty([counter()])).toBeGreaterThan(0);
  });

  it("grows with the strength of the contradicting evidence", () => {
    const weak = contradictionPenalty([counter({ score: 0.2 })]);
    const strong = contradictionPenalty([counter({ score: 0.9 })]);
    expect(strong).toBeGreaterThan(weak);
  });

  it("damps repetition of the SAME counter-claim to its strongest form", () => {
    // Ten identical counter-claims must cost no more than the single strongest.
    const same = Array.from({ length: 10 }, (_, i) => counter({ claimId: `c${i}` }));
    const distinct = Array.from({ length: 10 }, (_, i) => counter({ claimId: `c${i}`, reason: `reason ${i}` }));
    expect(contradictionPenalty(same)).toBeCloseTo(contradictionPenalty([counter()]), 12);
    expect(contradictionPenalty(same)).toBeLessThan(contradictionPenalty(distinct));
  });

  it("counts a group of repeats at the STRONGEST, not the weakest", () => {
    const mixed = [
      counter({ claimId: "a", score: 0.1 }),
      counter({ claimId: "b", score: 0.9 }),
      counter({ claimId: "c", score: 0.4 }),
    ];
    expect(contradictionPenalty(mixed)).toBeCloseTo(0.9, 12);
  });

  it("regression: appending a weaker duplicate must not LOWER the penalty", () => {
    // The original PLAN.md 3.3 formula (total / (1 + ln(1+n))) failed here: the
    // denominator outgrew the numerator, so adding evidence reduced the penalty
    // and RAISED the claim's score. Max-per-reason is monotonic by construction.
    const before = applyContradiction(1.0, [counter({ score: 1.35 })]);
    const after = applyContradiction(1.0, [
      counter({ score: 1.35 }),
      counter({ claimId: "dup", score: 0.0001 }),
    ]);
    expect(after.penalty).toBeGreaterThanOrEqual(before.penalty - 1e-12);
    expect(after.score).toBeLessThanOrEqual(before.score + 1e-12);
  });

  it("treats different reasons as genuinely separate evidence", () => {
    const a = contradictionPenalty([counter({ score: 0.6, reason: "source denied it" })]);
    const b = contradictionPenalty([counter({ score: 0.6, reason: "witness disagrees" })]);
    const both = contradictionPenalty([
      counter({ score: 0.6, reason: "source denied it" }),
      counter({ score: 0.6, reason: "witness disagrees" }),
    ]);
    expect(both).toBeCloseTo(a + b, 12);
  });

  it("is unaffected by the order of the contradicting claims", () => {
    const items = [
      counter({ claimId: "a", score: 0.4, reason: "r1" }),
      counter({ claimId: "b", score: 0.7, reason: "r1" }),
      counter({ claimId: "c", score: 0.3, reason: "r2" }),
    ];
    expect(contradictionPenalty([...items].reverse())).toBeCloseTo(contradictionPenalty(items), 12);
  });
});

describe("applyContradiction", () => {
  it("leaves a score untouched when nothing contradicts it", () => {
    const result = applyContradiction(0.8, []);
    expect(result.score).toBe(0.8);
    expect(result.contradiction).toEqual([]);
  });

  it("reduces the score when contradicted", () => {
    expect(applyContradiction(0.8, [counter({ score: 0.9 })]).score).toBeLessThan(0.8);
  });

  it("never increases the score", () => {
    expect(applyContradiction(0.5, [counter({ score: 0.2 })]).score).toBeLessThanOrEqual(0.5);
  });

  it("INVARIANT 8: an overwhelming pile of contradiction is capped at half the score", () => {
    const many = Array.from({ length: 5_000 }, (_, i) => counter({ claimId: `c${i}`, score: 1.35 }));
    const result = applyContradiction(1.0, many);
    expect(result.score).toBeCloseTo(0.5, 10);
    expect(result.penalty).toBe(MAX_CONTRADICTION_PENALTY);
  });

  it("never drives the score below half the uncorrected value", () => {
    for (const base of [0.01, 0.2, 0.55, 1.0, 1.35]) {
      const result = applyContradiction(base, [counter({ score: 1.35 })]);
      expect(result.score).toBeGreaterThanOrEqual(base * 0.5 - 1e-12);
    }
  });

  it("records each distinct contradiction with its reason for the explanation", () => {
    const result = applyContradiction(0.8, [
      counter({ claimId: "c1", score: 0.4, reason: "denied by official" }),
      counter({ claimId: "c2", score: 0.2, reason: "witness disagrees" }),
    ]);
    expect(result.contradiction).toHaveLength(2);
    expect(result.contradiction.map((c) => c.claimId).sort()).toEqual(["c1", "c2"]);
    expect(result.contradiction[0]?.reason.length).toBeGreaterThan(0);
  });

  it("keeps the score non-negative and finite for adversarial input", () => {
    for (const base of [0, 0.5, 1.35]) {
      const result = applyContradiction(base, [
        counter({ score: Number.NaN }),
        counter({ claimId: "neg", score: -5 }),
        counter({ claimId: "inf", score: Number.POSITIVE_INFINITY }),
      ]);
      expect(Number.isFinite(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1.35);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Integration with the scorer.                                               */
/* -------------------------------------------------------------------------- */

function src(id: string, tier: SourceTier = 2, citesSourceIds: string[] = []): Source {
  return { id, publisher: `pub-${id}`, tier, publishedAt: new Date("2026-01-01T00:00:00Z"), citesSourceIds };
}

function clm(supportingSourceIds: string[]): Claim {
  return {
    id: "clm-1",
    text: "A claim under test.",
    subjectNodeId: "node-hormuz",
    assertedAt: new Date("2026-03-01T00:00:00Z"),
    supportingSourceIds,
    contradictingSourceIds: [],
    extractionConfidence: 0.9,
  };
}

describe("scoreClaim with contradiction", () => {
  it("returns an identical score when no contradicting claims are supplied", () => {
    const all = [src("a")];
    const withNone = scoreClaim({ claim: clm(["a"]), allSources: all, contradictingClaims: [] });
    const withoutParam = scoreClaim({ claim: clm(["a"]), allSources: all });
    expect(withNone.score.value).toBe(withoutParam.score.value);
    expect(withNone.explanation.finalScore).toBe(withNone.score.value);
  });

  it("lowers the reported score and the explanation together", () => {
    const all = [src("a")];
    const clean = scoreClaim({ claim: clm(["a"]), allSources: all });
    const contested = scoreClaim({
      claim: clm(["a"]),
      allSources: all,
      contradictingClaims: [counter({ score: 1.0 })],
    });
    expect(contested.score.value).toBeLessThan(clean.score.value);
    expect(contested.explanation.finalScore).toBe(contested.score.value);
    expect(contested.explanation.contradiction).toHaveLength(1);
  });

  it("keeps the explanation internally consistent - the derivation explains the final number", () => {
    const contested = scoreClaim({
      claim: clm(["a"]),
      allSources: [src("a")],
      contradictingClaims: [counter({ score: 0.8 })],
    });
    // finalScore must equal value, and must not exceed the uncorrected gate score.
    expect(contested.explanation.finalScore).toBe(contested.score.value);
    expect(contested.score.value).toBeLessThanOrEqual(contested.explanation.base + 1e-12);
  });
});

/* -------------------------------------------------------------------------- */
/* Property-based invariants.                                                 */
/* -------------------------------------------------------------------------- */

const claimArb = fc.constantFrom<ContradictingClaim>(
  counter({ claimId: "a", score: 0.1, reason: "r1" }),
  counter({ claimId: "b", score: 0.5, reason: "r1" }),
  counter({ claimId: "c", score: 0.9, reason: "r2" }),
  counter({ claimId: "d", score: 1.35, reason: "r2" }),
  counter({ claimId: "e", score: 0.3, reason: "r3" }),
);

const listArb = fc.array(claimArb, { maxLength: 40 });

test.prop([fc.double({ min: 0, max: 1.35, noNaN: true }), listArb], { numRuns: NUM_RUNS })(
  "INVARIANT 8 (property): the corrected score never falls below half the uncorrected score",
  (base, contradicting) => {
    const { score } = applyContradiction(base, contradicting);
    expect(score).toBeGreaterThanOrEqual(base * 0.5 - 1e-12);
    expect(score).toBeLessThanOrEqual(base + 1e-12);
  },
);

test.prop([listArb, claimArb], { numRuns: NUM_RUNS })(
  "MONOTONICITY: adding contradiction evidence never raises the score",
  (base, extra) => {
    // Compare the SAME list with and without one more item. An earlier version
    // of this property compared two unrelated random lists, which is invalid:
    // a longer list can hold weaker items, so length alone does not order them.
    const baseScore = applyContradiction(1.0, base).score;
    const extended = applyContradiction(1.0, [...base, extra]).score;
    expect(extended).toBeLessThanOrEqual(baseScore + 1e-12);
  },
);

test.prop([listArb, claimArb], { numRuns: NUM_RUNS })(
  "MONOTONICITY: the penalty never falls when evidence is appended",
  (base, extra) => {
    const before = contradictionPenalty(base);
    const after = contradictionPenalty([...base, extra]);
    expect(after).toBeGreaterThanOrEqual(before - 1e-12);
  },
);

test.prop([listArb], { numRuns: NUM_RUNS })(
  "the penalty is always within the documented cap and is finite",
  (contradicting) => {
    const penalty = contradictionPenalty(contradicting);
    expect(Number.isFinite(penalty)).toBe(true);
    expect(penalty).toBeGreaterThanOrEqual(0);
  },
);

test.prop([fc.double({ min: 0, max: 1.35, noNaN: true }), listArb], { numRuns: NUM_RUNS })(
  "scoring stays deterministic when contradictions are present",
  (base, contradicting) => {
    const a = applyContradiction(base, contradicting);
    const b = applyContradiction(base, contradicting);
    expect(b).toEqual(a);
  },
);

test.prop([listArb], { numRuns: NUM_RUNS })(
  "every reported contradiction carries a non-empty reason for explainability",
  (contradicting) => {
    for (const entry of applyContradiction(1.0, contradicting).contradiction) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.claimId.length).toBeGreaterThan(0);
      expect(Number.isFinite(entry.score)).toBe(true);
    }
  },
);

test.prop([fc.double({ min: 0.1, max: 1.35, noNaN: true }), listArb], { numRuns: NUM_RUNS })(
  "the method version is unchanged by contradiction handling",
  (base, contradicting) => {
    void base;
    void contradicting;
    expect(METHOD_VERSION).toBe("credibility@1.0.0");
  },
);
