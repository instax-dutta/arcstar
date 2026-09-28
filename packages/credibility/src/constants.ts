/**
 * Named constants for the credibility methodology.
 *
 * These are exported so tests, benchmarks, and the API can reference the same
 * values the scorer uses, rather than re-deriving magic numbers that could drift.
 *
 * Changing any value here changes published scores and therefore requires
 * bumping METHOD_VERSION in score.ts.
 */

/**
 * Hard ceiling on how much contradiction can reduce a credibility score.
 *
 * INVARIANT 8: no amount of contradicting evidence may drive a score below half
 * its uncorrected value. Without this, coordinated opposition could zero out a
 * well-sourced claim, which would make the score trivial to attack.
 */
export const MAX_CONTRADICTION_PENALTY = 0.5;
