# @arcstar/credibility

## Purpose

The moat. Deterministic credibility scoring, cascade detection, and explainability.
This is the part of Arcstar that cannot be reproduced by anyone else, and the part
that decides whether the project's central claim is true.

## Ownership

- Owns `independentSources` (cascade detection) and `scoreClaim` (score composition).
- Owns `METHOD_VERSION`, the identifier that makes scores auditable over time.
- Does not own wire schemas (see `@arcstar/contracts`), graph structure, persistence,
  HTTP, or rendering.

## Local Contracts

These bind this package and cannot be weakened by any child document.

- **Purity is enforced, not aspirational.** No I/O, no database, no network, no clock, no
  randomness. Time is injected by the caller. `scripts/check-purity.mjs` runs as part of
  `pnpm lint` and in CI before the test job. If a scoring function appears to need
  `Date.now()`, the design is wrong - fix the design.
- **The LLM never produces a score.** This package contains no model calls at all. Claim
  extraction and entity linking happen upstream. Scoring is arithmetic over validated inputs.
- Gates are multiplicative; corroboration is a saturating multiplier. A weighted average is
  forbidden, because it lets weak corroboration rescue a weak source, which is the exact
  failure this project exists to prevent.
- `base` is the BEST independent source tier, not an average across tiers.
- Contradiction is supplied by the caller as pre-scored `ContradictingClaim` items and
  collapsed to the MAX score per distinct `reason`. Do not reintroduce a formula that grows
  a group's divisor with its size: `total / (1 + ln(1+n))` was non-monotonic and let an
  attacker raise a claim's score by repeating a refutation of it.
- The contradiction penalty is capped at 0.5 (`MAX_CONTRADICTION_PENALTY`). This is what
  guarantees INVARIANT 8. Lowering the cap must be a deliberate, documented change.
- Every score ships a full `ScoreExplanation`. A score that cannot be explained must not
  exist.
- Scores are descriptive, never predictive. Do not add anything that reads as a forecast.
- Changing the scoring arithmetic requires bumping `METHOD_VERSION` and updating
  `__fixtures__/golden/`. Silent score changes are forbidden.

## Work Guidance

- Test-first, without exception. Write the failing test, watch it fail, then implement.
- The property-based invariants in `independence.test.ts` and `score.test.ts` are the
  product, not the test suite. If an invariant breaks, the score is unsound and nothing
  ships. Do not weaken or delete an invariant to make a change pass.
- When a property test fails, decide deliberately whether the implementation or the
  property is wrong, and write down which. Two properties in this package were found wrong
  this way; the reasoning is in comments at those sites.
- Keep the 100% coverage gate. A coverage drop here means untested logic, not unreachable
  code. If a new branch is genuinely unreachable, remove the dead code rather than lowering
  the threshold.
- Prefer a small, explicitly named pure function over a clever one. Every function here must
  be explainable to a journalist in plain English.
- Known limitation to keep in mind: a source citing a deleted (unresolvable) source is
  treated as an origin, because inventing a shared root we cannot observe would fabricate
  evidence. This can overstate corroboration. The fix is surfacing "provenance incomplete"
  in the explanation layer, not collapsing on a guess.

## Verification

- `pnpm --filter @arcstar/credibility test` - 86 tests including 23 property-based
  invariants, each running 200 cases, plus 10 golden score snapshots, with a 100%
  coverage gate on all four metrics.
- `pnpm --filter @arcstar/credibility lint` - runs ESLint AND the purity gate. Both must
  pass.
- `pnpm --filter @arcstar/credibility typecheck`.
- In CI the purity gate runs as its own step, before typecheck, lint, and tests.

### Golden fixtures

`__fixtures__/golden/*.json` holds frozen `(claim, sources) -> (score, explanation)` pairs.
Hand-written JSON, deliberately NOT Vitest snapshots: `-u` would let a score change be
accepted by re-running a command with nobody writing down why the methodology moved.

Rules:
- Every case carries a `rationale` explaining what it demonstrates, asserted by test.
- Case names are unique across all fixture files, asserted by test.
- Each fixture is parsed through the real Zod schemas, so a malformed fixture cannot pass
  by producing an error score.
- Every expected value must be computed by hand from the documented formula BEFORE being
  confirmed against the implementation. Capturing output from a run only freezes whatever
  the code currently does, bugs included. This caught a real transcription error during
  Phase 1: a value computed for confidence 0.5 was pasted into the 0.45 case.
- Changing an expected value requires editing the fixture with a written justification in
  the commit, and bumping `METHOD_VERSION` when the arithmetic itself moves.
- The file name carries the method version (`scores.v1.json`) so a methodology change is
  visible in the tree.

## Child DOX Index

None. This package is a leaf.
