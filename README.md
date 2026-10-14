# Arcstar

## Overview

Arcstar is an open-source geopolitical intelligence system. Its central thesis is that
credibility should be treated as infrastructure rather than as an editorial judgment:
every claim drawn from open sources is scored by deterministic arithmetic over
validated inputs, and every score is published with its complete derivation.

Arcstar answers the question that existing feeds, dashboards, and alerting systems do
not answer well:

> If a given node is disrupted, what breaks, ranked by impact, and how strong is each
> link in that chain?

The system is composed of two moats:

1. **Credibility scoring.** A multiplicative, gate-based methodology with cascade
   collapse, contradiction handling, and full explainability. See
   `packages/credibility`.
2. **Dependency graph.** A typed, as-of-dated graph with relation-aware blast radius
   computation. See `packages/graph`.

Scores are descriptive, never predictive. Errors are surfaced rather than concealed,
and users may override any score; overrides feed the public benchmark.

License: AGPL-3.0. Free, open, no accounts, no paywall.

## Status and phase gates

Phases are enforced. No phase that depends on logic may ship before that logic is
proven by tests.

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, contracts, CI, purity gate | Complete |
| 1 | Credibility core, invariants, golden snapshots | Complete |
| 2 | Graph core, blast radius, as-of dating | Complete for blast radius; min-cut deferred |
| 3 | Ingest adapters and HTTP API | Basic API implemented; adapters not yet built |
| 4 | Web application | Basic Sigma.js MVP implemented |
| 5 | 300-claim benchmark (AUC >= 0.80) | Not yet built; project go/no-go gate |
| 6 | Hardening, versioning, self-hosting | Not started |

Current automated status across all packages: 100% statement, branch, function, and
line coverage on `packages/contracts`, `packages/credibility`, and `packages/graph`;
all 178 tests pass; the purity gate passes in both directions.

## Monorepo structure

```
arcstar/
  AGENTS.md                     # DOX contract and package index
  PLAN.md                       # governing build plan
  packages/
    contracts/                  # Zod schemas, the wire contract
    credibility/                # pure scoring engine
    graph/                      # dependency graph and blast radius
  apps/
    api/                        # Hono HTTP boundary
    web/                        # Vite + React + Sigma.js product surface
  scripts/
    check-purity.mjs            # I/O-freedom gate for packages/credibility
```

`packages/*` are pure libraries. `apps/*` are deployables. Dependency direction is
strict: apps depend on packages; packages depend only on each other where declared;
`packages/credibility` depends on nothing outside itself except `packages/contracts`.

## Credibility methodology

### Core types

```ts
type SourceTier = 1 | 2 | 3 | 4 | 5; // 1 = primary/wire, 5 = anonymous social
interface Source { id; publisher; tier; publishedAt; citesSourceIds; primaryEvidence?; }
interface Claim { id; text; subjectNodeId; assertedAt; supportingSourceIds;
                  contradictingSourceIds; extractionConfidence; }
```

### Score composition

Scores use multiplicative gates followed by a saturating corroboration boost. Weighted
averages are deliberately not used, because a pile of weak corroboration could then
rescue a garbage source.

```
base         = tierWeight(source.tier)              // 0.40 .. 0.90
independence = independentSourceCount(supporting)   // cascade-collapsed
evidence     = hasPrimaryEvidence ? 1.0 : 0.75
extraction   = claim.extractionConfidence

gate  = base * evidence * extraction                // 0.0 .. 1.0
boost = 1 - exp(-independence / 2)                 // saturates at 1
score = gate * (1 + 0.35 * boost)                  // 0.0 .. ~1.35
```

`independence` is cascade-collapsed: twenty outlets citing one anonymous source count
as one independent source, not twenty. This is the core technical decision of the
system and the reason Arcstar exists. Any source that cites another resolvable source
is not an origin; origins are the independent units.

### Contradiction

Contradicting claims arrive as pre-scored items, each with the proposition it
disputes. Repetition of one counter-claim collapses to its strongest form; distinct
reasons accumulate.

```
groupMax = max(score) over contradicting claims sharing the same reason
penalty  = sum of groupMax across distinct reasons
score'   = score * (1 - min(0.5, penalty))
```

The 0.5 cap is invariant: no amount of contradicting evidence drives a score below
half of its uncorrected value.

### Explainability

Every non-zero score carries a `ScoreExplanation` containing the base value and its
reason, the cascade-collapsed independent sources, the raw collapsed count,
contradiction entries, the final score, and the `methodVersion`. Scores are only
auditable because the method version is part of the value.

### Method version

`credibility@1.0.0`.

## Dependency graph

### Relation direction

Edge direction means different things for different relation types, so traversal
consults the `PROPAGATION` table rather than walking stored edges uniformly.

| Relation | Propagation | Reasoning |
|---|---|---|
| `depends_on` | reverse | A breaks when B breaks |
| `transits_through` | reverse | Closing B stops A |
| `consumes` | reverse | Losing B hurts A |
| `located_in` | reverse | Disruption in B reaches A |
| `supplies` | forward | A breaking hurts B |
| `produces` | forward | A breaking stops B |
| `owns` | forward | A breaking endangers B |
| `sanctions` | none | Direction is genuinely ambiguous |

### Blast radius

```
blastRadius(graph, disruptedNode, { maxHops, decay, ceiling }) ->
  [{ node, hops, impactScore, path }]
```

Impact travels along the direction specified by `PROPAGATION`. `impactScore` is the
sum over all paths of `weight * decay^hops`, so nodes reachable several ways score
higher, and decay applies from the first hop. `maxHops` bounds the path count and
makes cyclic graphs tractable. The disrupted node is excluded from its own results;
ties break by ascending node id.

### As-of dating

Edges carry `asOf`. `resolveEdgesAsOf` reduces a history to the most recent edge at
or before a query date for each `(from, to, relation)` triple. A weight-0 edge acts
as an end marker, so a lapsed dependency is recorded rather than deleted. Exact
collisions resolve to the maximum weight, so results are independent of array order.

## Credibility invariants

These are the product, not the test suite. If any breaks, the score is unsound and
nothing ships.

1. Tier monotonicity: a better-sourced claim never scores worse.
2. Independence monotonicity: adding an independent source never decreases the
   score.
3. Cascade collapse: all sources citing one root yield `independentCount == 1`.
4. Order invariance: source ingestion order never affects the result.
5. Idempotence: `score(score(x)) == score(x)`.
6. Determinism: no clock, no randomness; time is injected.
7. Score bounds: `0 <= score <= 1.35`.
8. Contradiction cap: no score falls below half of its uncorrected value.
9. Empty support: a claim with zero supporting sources scores exactly zero.
10. Explainability completeness: every non-zero score has a complete explanation.

## Engineering contracts

- `packages/credibility` is pure: no I/O, no database, no network, no clock. The
  purity gate (`scripts/check-purity.mjs`) enforces this in CI.
- The LLM never produces a credibility score. It performs claim extraction and
  entity linking only.
- TypeScript is held at 5.9.x because `typescript-eslint@8` does not yet support 7.
- No Neo4j, Kafka, Kubernetes, microservices, or Next.js (for the API). Postgres,
  pg-boss, Vite + React, a single deploy.

## HTTP API

Base URL in development: `http://localhost:8787`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/graph` | Demo dependency graph |
| GET | `/claim` | Demo claim and supporting sources |
| POST | `/score` | Score a claim against a source graph |
| POST | `/blast-radius` | Compute blast radius for a disrupted node |

Date fields cross the HTTP boundary as strings and are coerced at the boundary.

## Falsifiable acceptance criteria

Benchmark (Phase 5, not yet built):

- Mean score(confirmed-true) - mean score(confirmed-false) >= 0.25
- AUC >= 0.80
- Cascade detection >= 90%
- Claims scoring above 0.7 are true at >= 70% precision

Graph criteria:

- Hormuz closure blast radius top-10 matches an expert ordering on at least 8
  of 10.
- Any critical chokepoint identified is genuinely on at least 3 known major routes.

Engineering criteria:

- `packages/credibility` has zero I/O dependencies, enforced in CI.
- All invariants hold for 1,000 fast-check runs each.
- Full suite runs in under 60 seconds locally.

## Getting started

Requirements: Node 22+, pnpm 11.9.0.

```bash
pnpm install
pnpm build
```

Run all gates:

```bash
pnpm check
```

Individual gates:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm purity
```

Start the API (default port 8787):

```bash
pnpm --filter @arcstar/api dev
```

Start the web application:

```bash
pnpm --filter @arcstar/web dev
```

The web development server proxies `/api` to `http://localhost:8787`.

## Testing

- Vitest 5 for unit and integration tests.
- `@fast-check/vitest` for property-based invariants.
- Golden snapshots are hand-written JSON in
  `packages/credibility/__fixtures__/golden/`, not auto-accepted Vitest snapshots, so
  a score change requires an explicit edited justification.
- No network access in CI; ingest adapters use recorded fixtures.

Local test runner that avoids saturating a shared machine:

```bash
./scripts/gentle-test.sh
./scripts/gentle-test.sh graph
```

## Governance and contribution

- Every meaningful change requires a DOX pass: update the nearest owning
  `AGENTS.md` and affected parents.
- Phase gates hold. Do not wire the engine to a UI or API before its logic is
  proven by tests.
- `packages/contracts` changes are breaking across all three consumers and must
  land with migration notes.
- Scores are reproducible forever; method version bumps are methodological events,
  not cosmetic changes.

## License

AGPL-3.0.
