# Project Arcstar - Build Plan

**One line:** Credibility scoring as infrastructure, dependency graph as the interface.
**License:** AGPL-3.0 (matching the open-source-first goal).
**Status:** Plan approved in principle. Nothing built yet. Empty repo.

---

## 0. The thesis, in one paragraph

Every existing dashboard is a feed of events. None of them is a model of the world.
Arcstar ingests claims from open sources, scores each claim's credibility using a
transparent, auditable methodology, links claims to nodes in a dependency graph of
countries, companies, chokepoints and commodities, and answers the question no
existing tool answers well: **"if X happens, here is what breaks, ranked, and here is
how confident we are in each link."**

The credibility methodology is the moat. It is public, versioned, and improves with use.
The graph is the product surface. Both are free and open.

---

## 1. Stack decisions and why

| Layer | Choice | Reasoning |
|---|---|---|
| Language | TypeScript 5.9.3 (strict) | End-to-end type sharing between engine, API, and UI. The credibility score type must be identical in all three. Non-negotiable for a system where a score is a public API contract. |
| Monorepo | pnpm workspaces + Turborepo 2 | `packages/*` are pure libraries, `apps/*` are deployables. Turborepo gives per-package caching on test+build. |
| Test runner | Vitest 5 | Native TS/ESM, fast, single tool for unit + integration. Pairs with `@fast-check/vitest@0.5.0` for property testing. |
| Property testing | fast-check 4.x | Non-negotiable for the credibility engine. See §4.2. The scoring invariants are the product. |
| Validation | Zod 4 | Schema-first contracts, inferred types. |
| Lint | ESLint 10 flat config + typescript-eslint 8 | Shared config at the repo root. The purity check is a separate script, not an ESLint rule. |
| DB | Postgres 17 | `claims`, `sources`, `scores`, `nodes`, `edges`. Use recursive CTEs for graph traversal. `ltree` for materialised paths. |
| Queue | pg-boss | Job queue on the same Postgres. No Redis in Phase 1. Removes an infra dependency for zero throughput cost at our scale. |
| API | Hono + Zod | Fast, Zod schemas double as OpenAPI source. Zod types are the wire contract. |
| Graph render | Sigma.js v3 + graphology | WebGL, handles 10k+ nodes. graphology gives community detection and layout. MIT licensed. Chosen over D3 (cannot do 10k nodes) and Cytoscape (canvas, slower). |
| LLM | Any OpenAI-compatible endpoint, Ollama default | Credibility is **deterministic arithmetic, not LLM output.** The LLM does extraction (claim parsing, entity linking) only. See §3.4. |
| Runtime | Node 22+ (developed on 26) | LTS, best ecosystem fit. |
| CI | GitHub Actions | Fast: unit+property on every push, integration on PR, full eval nightly. |

### Version pinning constraint

TypeScript is deliberately held at **5.9.x, not 7.x**. TypeScript 7 exists but
`typescript-eslint@8` declares `typescript >=4.8.4 <6.1.0`, so the linter does not yet
support it. Revisit when typescript-eslint widens its range; do not force TS 7 ahead of the
linter.

### What we are deliberately NOT doing
- No Neo4j. Recursive CTEs in Postgres handle our graph scale (est. 5k nodes, 50k edges initially) and cost zero extra infra. Revisit past ~500k edges.
- No Kafka. pg-boss is sufficient for a daily-ingest workload.
- No microservices. Two apps, three libraries, one deploy. Monolith until proven painful.
- No Next.js for the API. The API is pure JSON, not SSR, so the framework buys nothing. The web app is Vite + React.
- No Kubernetes. Single VPS, Docker Compose, nightly backups.

---

## 2. Repository layout

```
arcstar/
  packages/
    credibility/      # PURE. The moat. Zero I/O, zero DB, deterministic.
      src/
        types.ts      # Claim, Source, Score, Evidence
        normalize.ts  # source normalisation, dedup
        tier.ts       # source tier classification
        independence.ts# cascade detection (the hard part)
        contradiction.ts
        score.ts      # the composition
        explain.ts    # human-readable derivation
    graph/
      src/
        types.ts      # Node, Edge, RelationType
        traverse.ts   # blast radius, min-cut, reachability
        rank.ts       # severity ranking
    contracts/        # Zod schemas shared by everything
  apps/
    api/              # Hono server, ingest endpoints, cron
    web/              # Vite + React + Sigma.js
  evals/              # the falsifiable benchmark
```

**The critical boundary:** `packages/credibility` has no dependencies on anything
except each other. It takes plain objects, returns plain objects. This is what makes
it exhaustively testable, and it is the reason the moat is defensible - it is
reproducible by anyone, forever, with `git clone && npm test`.

---

## 3. The credibility methodology (the moat)

### 3.1 Core types

```ts
type SourceTier = 1 | 2 | 3 | 4 | 5;  // 1 = primary/wire, 5 = anonymous social

interface Source {
  id: string;
  publisher: string;
  tier: SourceTier;
  publishedAt: Date;
  citesSourceIds: string[];   // provenance chain - drives cascade detection
  primaryEvidence?: string;   // document, video, dataset, direct observation
}

interface Claim {
  id: string;
  text: string;
  subjectNodeId: string;      // graph node this claim is about
  assertedAt: Date;
  supportingSourceIds: string[];
  contradictingSourceIds: string[];
  extractionConfidence: number; // 0-1, how sure are we we parsed it right
}
```

### 3.2 Score composition

The score is **not** a weighted average. Weighted averages are what existing tools do
and they have a fatal property: high corroboration can rescue a garbage source. We use
**multiplicative gates, then a saturating boost.**

```
base        = tierWeight(source.tier)                     // 0.40 .. 0.90
independence = independentSourceCount(supporting)        // 0,1,2,... (cascade-collapsed)
evidence    = hasPrimaryEvidence ? 1.0 : 0.75
extraction  = claim.extractionConfidence

gate  = base * evidence * extraction                      // 0.0 .. 1.0
boost = 1 - exp(-independence / 2)                       // saturates at 1
score = gate * (1 + 0.35 * boost)                          // final 0.0 .. ~1.35
```

`independence` is cascade-collapsed: 20 outlets all citing one anonymous Telegram post
counts as **1**, not 20. This is the single most important technical decision in the
system, and it is what nobody else does.

### 3.3 Contradiction

Contradicting claims are supplied by the caller as pre-scored items, each with the
proposition it disputes. Repetition of one counter-claim is collapsed to its strongest form.

```
groupMax    = max(score) over contradicting claims sharing the same reason
penalty     = sum of groupMax across distinct reasons
score'      = score * (1 - min(0.5, penalty))
```

Capped at 50% so a strong claim is never fully destroyed by weak contradicting noise.
Distinct `reason` values are treated as genuinely separate objections and accumulate in full.

**Correction to this plan.** The original formulation was
`sum over groups of (groupTotal / (1 + ln(1 + n)))`, intended to damp repetition. That
formula is provably non-monotonic: for a group of total `T` and size `n`, adding one item
grows the denominator faster than the numerator, so the penalty can fall.

```
n=1, T=1.35    penalty = 1.3500 / 1.6931 = 0.7973
n=2, T=1.3501  penalty = 1.3501 / 2.0986 = 0.6433   <-- penalty DROPPED
```

Adding contradiction evidence made the score *higher*, which means an attacker could raise
a claim's credibility by repeating a refutation of it. Taking the max per group is monotonic
by construction, is order invariant, and still collapses repetition: ten repeats of one
counter-claim cost the same as one, while ten distinct objections accumulate in full.

### 3.4 The LLM boundary (important)

The LLM **does not** produce credibility scores. Ever. It performs only:
- claim extraction from raw text (text -> `Claim` draft)
- entity linking (text -> candidate `Node` ids)
- source tier *suggestion* (always validated by deterministic rules)

All scoring is arithmetic on validated inputs. This means:
- scores are reproducible
- scores are auditable (see §3.5)
- the system works with no LLM at all, degraded

### 3.5 Explainability as a hard requirement

Every score ships with its full derivation. Not optional.

```ts
interface ScoreExplanation {
  base: number; baseWhy: string;
  independentSources: string[];   // the actual cascade-collapsed set
  collapsedFrom: number;          // raw count before collapsing
  contradiction: { sourceId: string; score: number; reason: string }[];
  finalScore: number;
  methodVersion: string;          // e.g. "credibility@1.2.0"
}
```

`methodVersion` on every score means scores are reproducible forever and method changes
are auditable. This is a research-grade requirement and a genuine differentiator.

---

## 4. TDD strategy

The credibility engine is the moat, so it gets the most rigorous testing. The UI gets
the least. Test effort is allocated by risk, not uniformly.

| Layer | Technique | Target | Why |
|---|---|---|---|
| `credibility` scoring | example-based unit | 100% branch | Spec compliance, gates |
| `credibility` independence | **property-based** | invariants | See below |
| `credibility` score | **property-based** + golden | invariants + regression | Monotonicity is the guarantee |
| `graph` traverse | unit + property | 100% branch | Cycles, disconnected graphs |
| `graph` rank | property | 100% branch | Ordering stability |
| `contracts` | schema validation | 100% | Everything depends on these |
| `api` | integration + MSW | 100% branch | Route behaviour |
| ingest adapters | contract tests + **recorded fixtures** | 100% branch | Never hit live network in CI |
| `web` | Vitest + Testing Library | critical paths | Spend effort on graph interactions, not snapshot everything |

### 4.1 The test pyramid in numbers

- ~1,200 example-based unit tests (credibility, graph, contracts)
- ~40 property-based properties with 200+ runs each (the invariants)
- ~60 integration tests against MSW-mocked sources
- ~30 component tests on the web app
- 1 nightly evaluation run against the labelled benchmark

### 4.2 Property-based invariants (these ARE the product)

These are the properties that must never break. If one of these fails, the credibility
score is unsound and we ship nothing.

1. **Tier monotonicity.** For any claim, `score(tier N) >= score(tier N+1)` when all else
   is held constant. A better-sourced claim never scores worse.
2. **Independence monotonicity.** Increasing the number of *independent* sources never
   decreases the score. Adding a 5th genuinely independent wire never hurts.
3. **Cascade collapse.** For any set of sources all citing a single root source,
   `independentCount == 1`.
4. **Order invariance.** `independentCount(S)` is identical for any permutation of S.
   Source ingestion order must never affect the score.
5. **Idempotence.** Scoring is a pure function. `score(score(x)) == score(x)`.
6. **Determinism.** Same input, same output, always. No `Math.random()`, no
   `Date.now()` in the scoring path - time is injected.
7. **Score bounds.** `0 <= score <= 1.35` for all valid inputs.
8. **Contradiction cap.** No amount of contradicting evidence drives score below
   `0.5 * uncorrectedScore`.
9. **Empty support.** A claim with zero supporting sources scores exactly 0.
10. **Explainability completeness.** Every non-zero score has a non-empty explanation
    with at least one reason string per gate.

Properties 4 and 6 will find real bugs. Property 6 in particular - the accidental
`Date.now()` in a scoring path - is the single most common way credibility systems
become unreproducible, and it is invisible without property testing.

### 4.3 Golden tests

Hand-written JSON fixtures in `packages/credibility/__fixtures__/golden/`, deliberately not
Vitest snapshots: `vitest -u` would let a score change be accepted by re-running a command
with nobody recording why the methodology moved.

Every case carries a `rationale` and a unique name, both asserted by test, and every fixture
is parsed through the real Zod schemas so a malformed fixture cannot pass by producing an
error score. Expected values are computed by hand from the documented formula and *then*
confirmed against the implementation, because capturing output from a run only freezes
whatever the code currently does, bugs included. Ten cases exist, covering single-source
scores with and without primary evidence, the cascade case, honest corroboration, zero
support, contradiction, the contradiction cap, repetition collapse, and linear extraction.

Changing an expected value means editing the fixture with a written justification. The file
name carries the method version (`scores.v1.json`) so a methodology change is visible in
the tree.

### 4.4 Recorded fixtures for ingest

Every external adapter has a `__fixtures__/*.json` capturing real (redacted) API
responses. Tests replay fixtures, never the network. When an upstream API changes, the
fixture test fails loudly rather than the pipeline silently rotting.

---

## 5. Dependency graph model

```ts
type NodeType = 'country' | 'company' | 'chokepoint' | 'commodity' | 'infrastructure' | 'org';

type RelationType =
  | 'depends_on' | 'supplies' | 'transits_through'
  | 'sanctions' | 'owns' | 'located_in' | 'produces' | 'consumes';

interface Node { id: string; type: NodeType; label: string; props: Record<string, unknown>; }
interface Edge { from: string; to: string; relation: RelationType; weight: number; asOf: Date; }
```

Edges are **as-of dated**. This matters: the Russia-Ukraine gas relationship has a
start and an end. Blast radius is computed on the graph as it stood at a given date, so
we can ask "what depended on this in March 2022" and "what depends on it now."

### 5.1 Blast radius

The core product query: **"if node X is disrupted, what breaks?"**

```
blastRadius(graph, disruptedNode, { maxHops: 3, decay: 0.6 })
  -> [{ node, hops, impactScore, path: NodeId[] }]  // sorted desc by impactScore
```

- Follow only *reversed* dependency edges - if `A depends_on X`, disrupting X affects A.
- `impactScore = weight * decay^hops`, summed across all paths to the same node.
- Cycle-safe via visited set. This is a property-tested invariant (no infinite
  traversal, no duplicate paths inflating scores).

### 5.2 Min-cut

Single points of failure are the most valuable insight a graph can give.
`criticalChokepoints(graph)` finds edges whose removal most increases partition count.
Exponentially hard in general - we run bounded k (k <= 3) with a hard time budget, and
**the time budget is part of the contract**, tested by a property that asserts it
returns within budget on pathological input. Returns partial results with a
`complete: false` flag rather than hanging.

### 5.3 Ranking

Severity ranking is `PageRank`-ish on the subgraph, which handles the fact that being
downstream of ten things is worse than being downstream of one thing through a heavy
edge. Ordering must be **stable** across equal scores - a property test asserts this,
because unstable ordering in the UI is immediately visible and immediately corrosive
to trust.

---

## 6. Falsifiable acceptance criteria

**These decide whether the project works. If we cannot hit them, we do not ship.**

### 6.1 The benchmark (build this in Phase 5, not later)

A labelled set of **300 real-world geopolitical claims** (100 confirmed-true,
100 confirmed-false, 100 ambiguous/unresolved), hand-labelled with citations. Sourced
from public fact-check networks (PolitiFact, Full Fact, AFP Fact Check) plus
deliberate cascade cases.

**Success criteria:**
- **Separation:** mean score(confirmed-true) - mean score(confirmed-false) >= 0.25
- **Ranking:** AUC >= 0.80
- **Cascade detection:** >= 90% of deliberately-cascaded false claims collapse to
  `independence == 1`
- **Calibration:** claims scoring > 0.7 are true at >= 70% (precision, not just AUC)

This benchmark is public and the scores are reproducible. **It is the credibility
argument and it is the thing that makes journalists take us seriously.**

### 6.2 Graph criteria
- Hormuz closure blast radius: top-10 ranked entities match an expert human ordering
  on >= 8 of 10.
- Any single chokepoint identified as critical is genuinely on >= 3 known major
  trade routes.

### 6.3 Engineering criteria
- `packages/credibility` has zero I/O dependencies (enforced in CI by a lint rule).
- All 10 credibility properties hold for 1,000 runs each.
- Full suite runs in < 60s locally. If it does not, it is not being run, and it will rot.

### 6.4 The honest failure case
Predictive/scoring systems are wrong constantly. The design response:
- scores are **descriptive, never predictive**, and the UI must say so
- **every score is explainable** - a user can always ask "why" and get an answer
- users can **override** any score, and overrides feed the benchmark

If we cannot be honest about error, we do not get to build this.

---

## 7. Phased delivery

Each phase ends green or does not merge. No phase includes UI work unless the phase's
logic is proven by tests first.

### Phase 0 - Foundations (2-3 days)
- pnpm + Turborepo + Vitest + fast-check scaffold
- `@arcstar/contracts` with all Zod schemas
- CI pipeline, coverage gates, the no-I/O-in-credibility lint rule
- First failing test, then first passing test. Prove the loop works.
- **Exit:** `pnpm test` green, CI running, lint rule enforced.

### Phase 1 - Credibility core (1-2 weeks)
- `tier.ts` source classification
- `independence.ts` cascade detection **with all its property tests** - this is the
  single highest-risk component, build it first and hardest
- `score.ts` composition + the 10 invariants
- `explain.ts`
- Golden fixtures for ~50 hand-worked cases
- **Exit:** all properties hold at 1,000 runs. No integration yet. Pure library,
  fully tested.

### Phase 2 - Graph core (1 week)
- Types, traversal, blast radius, cycle safety
- Min-cut with time budget
- Ranking with stable ordering
- **Exit:** property tests green, incl. pathological-graph timing test.

### Phase 3 - Ingest + API (1-2 weeks)
- GDELT adapter (free, no key, documented 15-min update cadence)
- ACLED adapter (free non-commercial, registration required - **build this first
  because it forces the registration flow to be correct from day one**)
- RSS adapter for a hand-curated publisher list
- Recorded fixtures for all three
- Hono API exposing `/claims`, `/score`, `/blast-radius`, `/graph`
- **Exit:** integration tests green, real data flowing, no network in CI.

### Phase 4 - The web app (1-2 weeks)
- Sigma.js graph view, node/edge interaction
- Claim panel showing score + **full explanation, always visible**
- Blast radius query UI
- **Exit:** a user can pick a chokepoint, see what breaks, and see why we believe
  each link. This is the product moment.

### Phase 5 - The benchmark (1-2 weeks, runs parallel with Phase 4)
- Build the 300-claim labelled set
- Run evaluation, measure against §6.1
- Iterate the methodology **against the benchmark, not against vibes**
- **Exit:** AUC >= 0.80 or a written decision to iterate further. This is the
  go/no-go gate for the whole project.

### Phase 6 - Hardening + open launch
- Performance, caching, incremental scoring
- Method versioning + public changelog
- Docs, `SELF_HOSTING.md`, Docker Compose
- **Exit:** someone else can clone, run, and reproduce our scores.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Credibility engine is wrong often enough to be useless | Medium | Benchmark first-class, gate at AUC 0.80, honest about error |
| Cannot beat World Monitor on breadth | High | Do not try. Breadth is not the wedge. Depth and trust are. |
| Entity resolution is a swamp | High | Constrain to a curated node set first. Do not attempt open extraction in v1. |
| Nobody cares without a UI | Medium | Graph UI is Phase 4, before launch. The score is invisible without it. |
| Data sources rate-limit or vanish | Medium | Multiple adapters per signal type, recorded fixtures, graceful degradation |
| Scope creep into "just another map" | Medium | Phase gates. No map until the graph and the scoring are proven. |
| LLM extraction drifts and scores silently degrade | Medium | Golden tests + nightly eval in CI, extraction confidence is a scored gate |

---

## 9. Decisions already made (no revisiting without new evidence)

- TypeScript end-to-end. Zod for contracts.
- Credibility = deterministic arithmetic. LLM only extracts. Non-negotiable.
- Inductive, saturating boost over weighted average.
- Cascade collapse is the core innovation.
- Postgres, not Neo4j. pg-boss, not Kafka.
- Sigma.js for the graph.
- AGPL-3.0, free and open, no accounts, no paywall.
- Properties 1-10 are the product. If they break, we do not ship.
- Benchmark before launch, not after.

---

## 10. Immediate next actions

1. Scaffold the monorepo, get `pnpm test` green on a trivial test.
2. Write the first property test for `independence.ts` and watch it fail.
3. Define `contracts` schemas. Everything else depends on these.
4. Build the credibility core to green. No UI, no API, no ingest.
5. Only then: Phase 3 onward.

---

## 11. Build status

### Phase 0 - Foundations: COMPLETE
### Phase 1 - Credibility core: COMPLETE

Done and verified: `pnpm run check` green, 90 tests total, 100% coverage on statements,
branches, functions, and lines in both packages, purity gate verified in both directions
(passes clean code, fails injected violations).

Delivered:

- Monorepo, turbo pipeline, shared lint config, CI with nightly benchmark hook.
- `packages/contracts` - all Zod schemas and cross-field validation (18 tests).
- `packages/credibility/src/independence.ts` - cascade detection (8 property invariants).
- `packages/credibility/src/score.ts` - gate composition and explainability
  (8 property invariants).
- `packages/credibility/src/contradiction.ts` - contradiction penalty and the 0.5 cap
  (7 property invariants).
- `scripts/check-purity.mjs` - the purity gate.

23 property-based invariants in total, each running 200 generated cases.

All ten invariants from §4.2 are now enforced: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
Contradiction handling in §3.3 is live and `scoreClaim` no longer returns an empty
`contradiction` array. Scores are final for methodology version `credibility@1.0.0`.

Not yet done: `__fixtures__/golden/` score snapshots, then Phase 2 (graph).

### Corrections to this plan found during Phase 0/1

Recorded here because they change the specification, not just the implementation.

1. **§4.2 invariant 3 correction.** `independentCount <= supportingCount` is false in
   general. A synthesis that cites two independent origins contributes two independence
   units. The real bound is the closure size.
2. **`collapsedFrom` is a covering, not a partition.** A source drawing on two origins is
   counted under both, so per-origin counts are correct while their sum exceeds the
   supporting count. Both facts were found by property-based testing and are pinned in
   regression tests.
3. **§3.3 contradiction formula was non-monotonic.** `total / (1 + ln(1+n))` let appending
   evidence *reduce* the penalty, so repeating a refutation raised a claim's score.
   Replaced with max-per-distinct-reason, which is monotonic by construction. See §3.3.
4. **Deleted-source limitation.** A source citing an unresolvable (deleted) source is
   treated as an origin. We do not collapse on an unobservable shared root, because that
   would fabricate evidence. This can overstate corroboration and is a known gap to close
   by surfacing "provenance incomplete" in the explanation layer.

### Next

1. Add `__fixtures__/golden/` with frozen score snapshots, per §4.3.
2. Phase 2: `packages/graph/` - blast radius, min-cut, ranking. UI-free and API-free.
