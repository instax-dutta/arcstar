import type { Claim, Score, ScoreExplanation, Source, SourceTier } from "@arcstar/contracts";
import { independentSources } from "./independence.js";

/**
 * Score composition. Spec: PLAN.md section 3.2.
 *
 * Gates are MULTIPLICATIVE and corroboration is a SATURATING MULTIPLIER, never a
 * weighted average. A weighted average would let a pile of weak corroboration
 * rescue a single anonymous source - the exact failure mode this design exists to
 * prevent. Here, each gate can only ever reduce the score, and corroboration can
 * only ever amplify what the gates already allowed.
 *
 * Determinism (INVARIANT 6): this module reads no clock and no randomness. Time
 * is never consulted; the claim's own `assertedAt` is the caller's concern. If a
 * future change makes this function need `Date.now()`, the design is wrong.
 */

/**
 * Version the scoring methodology. Bump on any change to the arithmetic, because
 * scores are only auditable while we can say exactly which method produced them.
 */
export const METHOD_VERSION = "credibility@1.0.0";

/** Hard ceiling on any score. Enforced by MAX_SCORE in the contracts package. */
export const SCORE_CEILING = 1.35;

/** Weight applied to the saturating corroboration boost. */
const BOOST_WEIGHT = 0.35;

/** Score multiplier applied when at least one independent source has primary evidence. */
const PRIMARY_EVIDENCE_FACTOR = 1.0;
const NO_PRIMARY_EVIDENCE_FACTOR = 0.75;

/** How sharply the boost saturates. Larger = more reward per independent source. */
const SATURATION = 2;

/**
 * Base weight per source tier: 1 = primary/wire, 5 = anonymous social.
 * Monotonically decreasing, which is what makes INVARIANT 1 hold.
 */
const TIER_WEIGHT: Record<SourceTier, number> = {
  1: 0.9,
  2: 0.75,
  3: 0.6,
  4: 0.5,
  5: 0.4,
};

const TIER_LABEL: Record<SourceTier, string> = {
  1: "primary or wire service",
  2: "established outlet",
  3: "regional or secondary outlet",
  4: "aggregated or unverified",
  5: "anonymous or social",
};

export interface ScoreInput {
  claim: Claim;
  /**
   * The FULL known source graph, not just the supporting subset. Independence
   * depends on shared ancestry that often lives outside the supporting set.
   */
  allSources: readonly Source[];
}

export interface ScoreResult {
  score: Score;
  explanation: ScoreExplanation;
}

function saturatingBoost(independence: number): number {
  return 1 - Math.exp(-independence / SATURATION);
}

export function scoreClaim({ claim, allSources }: ScoreInput): ScoreResult {
  const independent = independentSources(claim.supportingSourceIds, allSources);

  // INVARIANT 9: nothing resolvable behind the claim means exactly zero.
  if (independent.length === 0) {
    const explanation: ScoreExplanation = {
      base: 0,
      baseWhy: "no resolvable supporting source",
      independentSources: [],
      collapsedFrom: 0,
      contradiction: [],
      finalScore: 0,
      methodVersion: METHOD_VERSION,
    };
    return { score: { value: 0, methodVersion: METHOD_VERSION }, explanation };
  }

  // `base` is the BEST independent tier, not the average. A single wire-service
  // anchor should hold the gate open even when weaker sources pile in, because the
  // question being asked is "how well is this sourced", not "what is the mean".
  const best = independent.reduce((a, b) => (a.tier <= b.tier ? a : b));

  const hasPrimaryEvidence = independent.some((s) => {
    const src = allSources.find((candidate) => candidate.id === s.sourceId);
    return src?.primaryEvidence !== undefined;
  });
  const evidence = hasPrimaryEvidence ? PRIMARY_EVIDENCE_FACTOR : NO_PRIMARY_EVIDENCE_FACTOR;

  const base = TIER_WEIGHT[best.tier];
  const gate = base * evidence * claim.extractionConfidence;
  const boost = saturatingBoost(independent.length);
  const finalScore = gate * (1 + BOOST_WEIGHT * boost);

  const baseWhy =
    `strongest independent source is ${best.publisher} (tier ${best.tier}: ${TIER_LABEL[best.tier]})` +
    (hasPrimaryEvidence ? ", with primary evidence attached" : ", no primary evidence attached");

  const explanation: ScoreExplanation = {
    base,
    baseWhy,
    independentSources: independent,
    collapsedFrom: claim.supportingSourceIds.length,
    contradiction: [],
    finalScore,
    methodVersion: METHOD_VERSION,
  };

  return { score: { value: finalScore, methodVersion: METHOD_VERSION }, explanation };
}
