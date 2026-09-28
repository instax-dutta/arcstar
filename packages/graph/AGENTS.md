# @arcstar/graph

## Purpose

The dependency graph and its traversal. Answers "if X is disrupted, what breaks,
ranked". This is the product surface that sits on top of the credibility engine:
claims attach to nodes, blast radius ranks what those nodes would take down.

## Ownership

- Owns `blastRadius`, the impact propagation model, and the result ordering.
- Owns `PROPAGATION`, the table that says which way impact travels per relation.
- Does not own wire schemas (see `@arcstar/contracts`), credibility scoring
  (see `@arcstar/credibility`), persistence, HTTP, or rendering.

## Local Contracts

- **Pure.** No I/O, no clock, no randomness. The graph is passed in; nothing is fetched.
- **Relation direction is a contract, not an implementation detail.** `PROPAGATION` says
  how far impact travels for each relation, and it is the single most important table in
  this package. `depends_on` and `transits_through` propagate in reverse; `supplies`,
  `produces`, and `owns` propagate forward; `sanctions` carries no direction at all.
- **`sanctions` is deliberately excluded from traversal.** A tightening and a relaxation
  move impact in opposite directions, and picking one would manufacture a blast radius
  nobody can defend. Do not add it without modelling the direction explicitly.
- **Ordering is total and stable.** `compareBlastResults` sorts by descending impact then
  ascending node id. Without the tiebreak, equal-scoring nodes reorder between calls and
  the UI flickers, which corrodes trust in a number users are meant to act on.
- **Traversal is cycle-safe and finite.** `maxHops` bounds the path count, which is what
  makes a cyclic graph tractable rather than infinite. A path may never revisit a node in
  its own chain.
- `impactScore` follows PLAN.md 5.1 exactly: `weight * decay^hops`, summed across all
  paths, so decay applies from the first hop onward. Results are clamped to `ceiling`.
- The disrupted node is excluded from its own blast radius. The question is what else
  breaks.

## Work Guidance

- Test-first. Write the failing test, watch it fail, then implement.
- The 100% coverage gate has twice found unreachable code in traversal logic, because
  BFS-level iteration makes "keep the shortest path" comparisons dead by construction.
  If a coverage drop appears, check whether the code is reachable before assuming a test
  is missing.
- `maxHops` is the reason this is tractable, not an arbitrary limit. Do not "optimise" it
  away or make it unbounded.
- Every new relation must be added to `PROPAGATION` and given a test in both directions
  where the direction is meaningful. A relation with no honest direction belongs in
  `"none"`, not in whichever direction happens to be convenient.
- Keep graph algorithms pure and side-effect free so they can be property tested against
  arbitrary graphs. Determinism is asserted directly, because reordering an array must
  never change an answer a user sees.

## Verification

- `pnpm --filter @arcstar/graph test` - 42 tests including 6 property-based invariants
  (cycle safety, determinism, bounds, ordering, exclusion, hop monotonicity) each running
  200 generated graphs, with a 100% coverage gate on all four metrics.
- `pnpm --filter @arcstar/graph typecheck` and `pnpm --filter @arcstar/graph lint`.

## Child DOX Index

None. This package is a leaf.
