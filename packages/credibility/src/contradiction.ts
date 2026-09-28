import type { ContradictionEntry } from "@arcstar/contracts";

/**
 * Contradiction scoring. Spec: PLAN.md section 3.3.
 *
 *   penalty = sum over distinct reasons of max score in that group
 *   score'  = score * (1 - min(0.5, penalty))
 *
 * Two deliberate design decisions:
 *
 *   1. Repetition is collapsed by taking the MAXIMUM score per distinct reason.
 *      Ten outlets repeating one counter-claim is not ten times the evidence of
 *      one, so the group counts once, at its strongest. This is the same
 *      instinct as cascade collapse applied to the opposing side.
 *
 *      CORRECTION TO PLAN.md SECTION 3.3: the plan originally specified
 *      `groupTotal / (1 + ln(1 + n))`. That formula is provably non-monotonic.
 *      For a group with total T and size n, adding one more item grows the
 *      denominator faster than the numerator, so the penalty can FALL:
 *
 *          n=1, T=1.35   penalty = 1.3500 / 1.6931 = 0.7973
 *          n=2, T=1.3501 penalty = 1.3501 / 2.0986 = 0.6433
 *
 *      Adding contradiction evidence made the penalty smaller and therefore the
 *      score HIGHER, which means an attacker could raise a claim's credibility
 *      by repeating a refutation of it. Max-per-reason is monotonic by
 *      construction, order invariant, and still collapses repetition.
 *
 *   2. The penalty is capped at 0.5 (INVARIANT 8). A strong claim is never fully
 *      destroyed by a pile of weak contradiction. Without this, coordinated
 *      opposition could zero out a well-sourced claim.
 *
 * This module is pure: no clock, no randomness, no I/O.
 */

import { MAX_CONTRADICTION_PENALTY } from "./constants.js";

export { MAX_CONTRADICTION_PENALTY };

/** Upper bound of any credibility score, mirroring MAX_SCORE in contracts. */
const SCORE_CEILING = 1.35;

/**
 * A claim that contradicts the one being scored, with its own already-computed
 * credibility. The caller supplies these rather than this module recursing,
 * because a source id alone does not identify what was actually claimed. Keeping
 * the input explicit also keeps the function pure and trivially testable.
 */
export interface ContradictingClaim {
  claimId: string;
  /** Pre-computed score of the contradicting claim, 0..SCORE_CEILING. */
  score: number;
  /**
   * The proposition being contradicted. Claims sharing a reason are treated as
   * repetition of one counter-claim and are damped together. Two outlets saying
   * the same wrong thing is not two independent refutations.
   */
  reason: string;
}

export interface ContradictionResult {
  score: number;
  /** Raw penalty before the cap is applied. Exposed for explainability. */
  penalty: number;
  contradiction: ContradictionEntry[];
}

/**
 * Clamp to the legal score range and drop non-finite values.
 *
 * The scorer must never throw or emit NaN: a bad number from one upstream
 * adapter must not be able to take down a scoring run. Clamping is safe here
 * because a score above the ceiling could not legitimately make a claim less
 * credible, and a negative one is not evidence of anything.
 */
function sanitise(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score, 0), SCORE_CEILING);
}

export function contradictionPenalty(contradicting: readonly ContradictingClaim[]): number {
  if (contradicting.length === 0) return 0;

  // Group by reason and keep the strongest. Monotonic: adding an item can only
  // raise a group maximum or add a group, never lower the total. Repetition of
  // one counter-claim therefore counts once, at its strongest form.
  const strongest = new Map<string, number>();
  for (const item of contradicting) {
    const score = sanitise(item.score);
    const current = strongest.get(item.reason);
    if (current === undefined || score > current) strongest.set(item.reason, score);
  }

  let penalty = 0;
  for (const score of strongest.values()) penalty += score;

  return penalty;
}

export function applyContradiction(
  score: number,
  contradicting: readonly ContradictingClaim[],
): ContradictionResult {
  const base = sanitise(score);
  if (contradicting.length === 0) {
    return { score: base, penalty: 0, contradiction: [] };
  }

  const rawPenalty = contradictionPenalty(contradicting);
  const penalty = Math.min(rawPenalty, MAX_CONTRADICTION_PENALTY);
  const corrected = base * (1 - penalty);

  // Deduplicate by claim id so the explanation does not repeat an entry when
  // the same counter-claim is supplied more than once.
  const seen = new Set<string>();
  const entries: ContradictionEntry[] = [];
  for (const item of contradicting) {
    if (seen.has(item.claimId)) continue;
    seen.add(item.claimId);
    entries.push({
      claimId: item.claimId,
      score: sanitise(item.score),
      reason: item.reason,
    });
  }

  return { score: corrected, penalty, contradiction: entries };
}
