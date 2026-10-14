# Project Arcstar - Master Build Doctrine

**One line:** Credibility scoring as infrastructure, dependency graph as the interface.

**License:** AGPL-3.0.

**Status:** Phase 0 and Phase 1 complete. Phase 2 complete for blast radius. Phase 3 and
Phase 4 have basic application shells. Phase 5, the benchmark that is the actual
go/no-go gate, is not yet built. No service has been deployed for external users.

This document is the governing contract for the project. Where code, README, and this
document disagree, this document controls unless an amendment is recorded in the
corrections section with evidence.


**Execution roadmap:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is the canonical phase-wise execution order, backlog, exit criteria, and release gate plan. This file remains authoritative for methodology, core contracts, graph semantics, invariants, and recorded corrections. The implementation roadmap supersedes the original phase ordering for work not yet shipped.
---

## 0. Thesis

Every existing dashboard is a feed of events. None of them is a model of the world.
Arcstar ingests claims from open sources, scores each claim's credibility using a
transparent and auditable methodology, links claims to nodes in a dependency graph of
countries, companies, chokepoints, and commodities, and answers the question no
existing tool answers well:

> If X happens, here is what breaks, ranked, and here is how confident we are in each
> link.

The credibility methodology is the moat. It is public, versioned, and improves with
use. The graph is the product surface. Both are free and open.

Arcstar does not compete on breadth. Breadth is the wedge of systems such as
World Monitor, which fuses live conflict, markets, shipping, aviation, and cyber
signals onto one situational-awareness map. Arcstar's wedge is depth and trust:
deterministic, reproducible credibility arithmetic; cascade-collapsed provenance; and
relation-aware blast radius. A user should be able to ask why any number exists and
receive a complete derivation.

## 1. Doctrine: what this system is

1. **Credibility is infrastructure, not opinion.** No human editor scores a claim.
2. **Deterministic arithmetic only.** Scores are functions of validated inputs.
3. **The LLM never scores.** It extracts claims and links entities. Extraction
   confidence is a gate, not a score.
4. **Cascade collapse is the core innovation.** Twenty outlets citing one source count
   as one source.
5. **Multiplicative gates, never weighted averages.** A pile of weak corroboration
   cannot rescue a garbage source.
6. **Every score is explainable.** An unexplained score is not shipped.
7. **Scores are descriptive, never predictive.** The UI must say this.
8. **Errors are surfaced.** Overrides feed the benchmark.
9. **Phase gates hold.** Logic before interface. Tests before commitment.
10. **The benchmark decides.** AUC below 0.80 means the methodology is not shipped,
    regardless of how clean the code is.

## 2. Stack and deliberate exclusions

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.9.3 (strict) | End-to-end type sharing. The score type is a public contract. |
| Monorepo | pnpm workspaces + Turborepo 2 | Pure libraries in `packages/*`, deployables in `apps/*`. |
| Tests | Vitest 5 + fast-check 4.x | Property testing is non-negotiable for invariants. |
| Validation | Zod 4 | Schema-first contracts with inferred types. |
| Lint | ESLint 10 flat config + typescript-eslint 8 | Shared config, no rule-level purity substitute. |
| DB | Postgres 17 | Recursive CTE traversal. `ltree` for materialised paths. |
| Queue | pg-boss | Same Postgres, no Redis in Phase 1. |
| API | Hono + Zod | JSON boundary, typed validators. |
| Graph render | Sigma.js v3 + graphology | WebGL at 10k+ nodes. |
| LLM | OpenAI-compatible, Ollama default | Extraction only. |
| Runtime | Node 22+, developed on 26 | LTS ecosystem fit. |
| CI | GitHub Actions | Every push runs the purity gate, typecheck, lint, tests. |

Version pinning: TypeScript stays at 5.9.x until `typescript-eslint` supports 7.x.

Deliberately excluded: Neo4j, Kafka, microservices, Next.js for the API, Kubernetes,
D3 for large graphs. Postgres recursive CTEs and a single VPS/Docker Compose deploy
are sufficient at the initial scale of roughly 5,000 nodes and 50,000 edges.

## 3. Repository contract

```
arcstar/
  AGENTS.md
  PLAN.md
  packages/
    contracts/       # Zod schemas, wire contract
    credibility/     # pure scoring engine
    graph/           # dependency graph and blast radius
  apps/
    api/             # Hono HTTP boundary
    web/             # Vite + React + Sigma.js
  evals/            # benchmark (not yet built)
  scripts/          # check-purity.mjs
```

The credibility engine has no dependencies except itself and `contracts`. It accepts
plain objects and returns plain objects. It is reproducible by anyone with
`git clone && pnpm test`.

The DOX hierarchy is part of the product contract. Every durable boundary has an
`AGENTS.md`; changes require a DOX pass.

## 4. Credibility methodology

### 4.1 Core types

```ts
type SourceTier = 1 | 2 | 3 | 4 | 5;
interface Source {
  id: string; publisher: string; tier: SourceTier; publishedAt: Date;
  citesSourceIds: string[]; primaryEvidence?: string;
}
interface Claim {
  id: string; text: string; subjectNodeId: string; assertedAt: Date;
  supportingSourceIds: string[]; contradictingSourceIds: string[];
  extractionConfidence: number; // 0..1
}
```

### 4.2 Score composition

Weighted averages are rejected because high corroboration can rescue a garbage source.

```
base        = tierWeight(source.tier)                 // 0.40 .. 0.90
independence = independentSourceCount(supporting)     // cascade-collapsed
evidence    = hasPrimaryEvidence ? 1.0 : 0.75
extraction  = claim.extractionConfidence

gate  = base * evidence * extraction                  // 0.0 .. 1.0
boost = 1 - exp(-independence / 2)                   // saturates at 1
score = gate * (1 + 0.35 * boost)                    // 0.0 .. ~1.35
```

`independence` collapses citations. Origins are sources in the transitive closure
that cite nothing else inside that closure. Repetition of an origin by synthesis
still counts as one unit per genuinely independent origin.

### 4.3 Contradiction

Contradicting claims arrive pre-scored with a `reason`. Identical reasons collapse
to the maximum score; distinct reasons accumulate.

```
penalty = sum over distinct reasons of max score per reason
score'  = score * (1 - min(0.5, penalty))
```

The 0.5 cap prevents coordinated opposition from destroying a strong claim.

Correction recorded during implementation: the original `groupTotal / (1 + ln(1+n))`
formula was non-monotonic and has been replaced.

### 4.4 LLM boundary

The LLM performs extraction and entity linking only. It never produces a score,
never bypasses gates, and never overrides the arithmetic. The system degrades
gracefully with no LLM at all.

### 4.5 Explainability

Every non-zero score carries base, base reason, independent sources with their
collapsed counts, collapsed-from count, contradiction entries, final score, and
`methodVersion`. A score without an explanation is not shipped. Version is part of
the value, so scores remain reproducible after method changes.

## 5. Dependency graph

### 5.0 Relation direction

An edge's meaning depends on its relation type. Traversal consults `PROPAGATION`.

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

### 5.1 Blast radius - implemented

```
blastRadius(graph, disruptedNode, { maxHops, decay, ceiling }) ->
  [{ node, hops, impactScore, path }]
```

Impact is the sum over paths of `weight * decay^hops`, evaluated only along the
propagation direction. `maxHops` bounds paths, making cyclic graphs tractable.
Cycle-safe: a path may not revisit a node. The disrupted node is excluded.
Results order by descending impact, then ascending id.

### 5.2 Min-cut - not implemented

Single points of failure. Bounded `k <= 3` with a hard time budget. Returns
partial results with `complete: false` rather than hanging.

### 5.3 Ranking - deferred

Direct multi-path `impactScore` ranks in v1. PageRank is deferred because the
direct score is more explainable; revisit if benchmark ranking data supports it.

### 5.4 As-of dating - implemented

`resolveEdgesAsOf` selects the most recent edge at or before the query date for
each `(from, to, relation)` triple. A zero-weight edge is an end marker. Exact
collisions resolve to maximum weight, so output is order-independent.

## 6. Invariants (the product)

1. Tier monotonicity.
2. Independence monotonicity.
3. Cascade collapse.
4. Order invariance.
5. Idempotence.
6. Determinism.
7. Score bounds.
8. Contradiction cap.
9. Empty support.
10. Explainability completeness.

If any fails, the score is unsound and nothing ships.

## 7. Verification gates

Automated evidence counts. Manual attestations only when necessary and proportional
to risk. Abandonment is terminal and must be surfaced.

- Purity gate: `packages/credibility` has zero I/O.
- All invariants run 1,000 fast-check cases.
- Coverage is 100% on statements, branches, functions, and lines for the pure
  packages.
- Typecheck, lint, and tests pass in CI.
- Full suite runs in under 60 seconds locally.
- The benchmark's acceptance numbers are mandatory, not aspirational.

## 8. Falsifiable acceptance criteria

### 8.1 Benchmark

300 real-world geopolitical claims: 100 confirmed true, 100 confirmed false, 100
ambiguous. Sourced from public fact-check networks plus deliberate cascade cases.

- Separation: mean(true) - mean(false) >= 0.25.
- Ranking: AUC >= 0.80.
- Cascade detection: at least 90% of deliberately cascaded false claims collapse to
  `independence == 1`.
- Calibration: claims scoring above 0.7 are true at least 70% of the time.

### 8.2 Graph

- Hormuz closure: top 10 match an expert human ordering on at least 8 of 10.
- Any critical chokepoint is genuinely on at least 3 known major trade routes.

### 8.3 Engineering

- Zero I/O in credibility, enforced in CI.
- All invariants at 1,000 runs.
- Suite under 60 seconds.
- Reproducible by cloning and running `pnpm test`.

## 9. Phased delivery

### Phase 0 - Foundations: complete

Scaffold, contracts, CI, purity gate.

### Phase 1 - Credibility core: complete

Cascade detection, score composition, contradiction, explainability, 86 tests and
golden snapshots.

### Phase 2 - Graph core: complete for blast radius

Blast radius, propagation, cycle safety, as-of dating. Min-cut and golden fixtures
remain.

### Phase 3 - Ingest and API: partial

Basic Hono API implemented. Ingest adapters and persistent data remain:
- ACLED adapter; registration flow and non-commercial terms.
- GDELT Cloud adapter; event families, confidence, and pagination constraints.
- RSS adapter for a hand-curated publisher list.
- Recorded fixtures for every adapter.
- Postgres persistence, pg-boss queue, recursive CTE graph queries.

Notes from source research: ACLED returns a maximum of 5,000 rows by default and
requires pagination for larger result sets; GDELT Cloud event endpoints use
30-day windows and page limits; neither service may be called from tests.

### Phase 4 - Web application: partial

Basic Vite + React + Sigma.js view with node click and blast-radius results.
Required before completion:
- Persistent panel showing score and full explanation.
- Selected-node claim inspection.
- Stable handling for graphs beyond the demo seed.
- Component tests on graph interactions.

### Phase 5 - Benchmark: not built

This is the project's go/no-go gate.

### Phase 6 - Hardening and launch

Self-hosting docs, Docker Compose, method version changelog, exportable scores.

## 10. Immediate next actions

1. Build the benchmark harness and first 30-claim pilot set.
2. Implement one ingest adapter with recorded fixtures, using ACLED first.
3. Replace demo graph with a curated graph seed of at least 100 nodes and 1,000
   edges, with provenance.
4. Implement min-cut, or formally defer it with a revisit condition.
5. Add graph golden fixtures.
6. Add self-hosting documentation and Docker Compose.

## 11. Data and source governance

- Every external source adapter must have a recorded fixture set and a contract test.
- Live network access is prohibited in CI.
- Adapters must degrade gracefully when sources rate-limit or change shape.
- Source tier suggestions from any heuristic or LLM are validated deterministically.
- Deletion of upstream sources is not collapsed silently: provenance gaps are
  surfaced in explanations.

## 12. Security, privacy, and licensing

- AGPL-3.0 applies to the whole project.
- No accounts and no paywall for the core graph or credibility data.
- API and web must not log or persist user queries without disclosure.
- No secrets may be committed; configuration is environment-driven.
- Security review is required before any public deployment.

## 13. Scalability and performance

- Pure package tests must run in under 60 seconds locally.
- Graph traversal must terminate on cycles and pathological inputs.
- Blast radius uses bounded hops rather than recursion without bounds.
- Min-cut runs under a hard time budget and returns partial results.
- UI rendering must handle at least 10,000 nodes via WebGL.

## 14. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Methodology is fallible against real claims | Medium | Benchmark gate, explicit error reporting, user overrides |
| Entity resolution overwhelms curated scope | High | Curated node set first; no open extraction in v1 |
| Loss of breadth comparison to World Monitor | High | Do not chase breadth; compete on depth and trust |
| Data source instability or terms changes | Medium | Multiple adapters, recorded fixtures, graceful degradation |
| LLM extraction drift | Medium | Golden tests, extraction confidence gate, nightly eval |
| Scope creep into map product | Medium | Phase gates and documented non-goals |
| Reproducibility failure | Low | Purity gate, method version, property tests |

## 15. Decisions recorded (no reopening without evidence)

- TypeScript end-to-end, Zod contracts.
- Deterministic arithmetic only; extraction is the LLM's only role.
- Multiplicative gates with saturating boost, never weighted averages.
- Cascade collapse is mandatory.
- Postgres, pg-boss, no Neo4j, no Kafka.
- Sigma.js for graph rendering.
- AGPL-3.0, free and open.
- Invariants are product-level constraints.
- Benchmark precedes any claim of effectiveness.
- As-of dating uses zero-weight end markers rather than `validUntil`.

## 16. Corrections recorded

1. Invariant 3: `independentCount <= supportingCount` is false in general.
2. `collapsedFrom` is a covering, not a partition.
3. Contradiction formula replaced due to non-monotonicity.
4. Blast radius required `PROPAGATION`; naive traversal was wrong.
5. PageRank deferred in favour of direct impact score.
6. Deleted-source provenance gaps are not silently collapsed.
7. CI schedule and unimplemented benchmark job were disabled to prevent false
   failure spam; re-enable with `pnpm run eval`.
8. Claude co-author trailers were removed from commit history.

## 17. Change control

- `PLAN.md` is amended only with dated corrections and evidence.
- `AGENTS.md` remains the operational DOX rail and reflects current structure.
- Every phase merges only when its exit criteria are demonstrably met.
- A planned boundary becomes a real DOX boundary when first committed.
- No weakening of the credibility invariants is accepted.
