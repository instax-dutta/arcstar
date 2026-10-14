# Arcstar — Complete Implementation Plan

**Document type:** Execution roadmap and phase-gate contract  
**Last reviewed:** 2026-10-14  
**Repository:** https://github.com/instax-dutta/arcstar  
**License:** AGPL-3.0

## 1. Purpose and authority

This document turns Arcstar's product thesis and engineering constraints into an executable, phase-wise delivery plan. It defines work order, deliverables, dependencies, exit criteria, acceptance tests, risks, and release rules.

Authority is split deliberately:

- **PLAN.md** owns the credibility methodology, graph semantics, invariants, architecture decisions, and documented corrections.
- **IMPLEMENTATION_PLAN.md** owns the order of remaining work, phase scope, deliverables, phase exit criteria, and release sequencing.
- **AGENTS.md and child AGENTS.md files** define operational instructions for coding agents and repository boundaries.
- **Contracts and tests** are the executable source of truth for wire schemas and behavior. When they disagree with documentation, stop and reconcile the discrepancy rather than assuming either side is correct.

This plan does not claim unbuilt work is complete. Phase status below reflects repository evidence observed on 2026-10-14 and must be updated when work actually passes its exit gate.

## 2. Product definition

Arcstar is open-source geopolitical intelligence infrastructure that connects sourced claims to an auditable model of real-world dependencies. It helps a user investigate an event, assess the evidence behind claims, and identify which entities may be affected by a disruption, through which relationships, and on what evidence.

The product's central workflow is:

1. Find or open a geopolitical event or disruption.
2. Inspect atomic claims and the passages that support, contradict, or qualify them.
3. Examine source ancestry and determine which reports are genuinely independent.
4. Select a country, company, commodity, infrastructure asset, or chokepoint.
5. Compute a bounded downstream impact ranking over a dated dependency graph.
6. Inspect every important path, evidence item, assumption, and uncertainty.
7. Compare scenarios or historical snapshots and export a reproducible assessment.

The initial product wedge is **maritime chokepoints and energy-supply dependencies**, beginning with a carefully sourced Strait of Hormuz / oil and LNG flow scenario. Do not expand to all geopolitical domains until this vertical slice is defensible and useful.

### Explicit product promise

Arcstar explains:
- What is being claimed and by whom.
- What evidence supports, disputes, or qualifies the claim.
- Whether multiple reports share an origin.
- Which dependency paths connect a disruption to a potentially affected entity.
- Which parts are verified, estimated, disputed, stale, or unknown.
- Which version of the method and which evidence/graph snapshot produced an output.

Arcstar must not imply that a deterministic score is a probability, that a graph score is a forecast, or that inferred relationships are verified facts.

## 3. Non-negotiable product principles

1. **Evidence is inspectable.** Every published claim must link to source material and, where available, the relevant passage. Missing evidence must be disclosed.
2. **Independence is not article count.** Syndication, quotation, shared press releases, and common upstream origins must be represented.
3. **Determinism is not accuracy.** The methodology needs independent empirical evaluation before the system claims it measures credibility reliably.
4. **Method scores are not probabilities.** The existing score may exceed 1.0; do not label it as a probability or percentage. Add a separate calibrated probability only after held-out validation.
5. **The LLM does not choose the score.** Models may extract candidate claims, passages, entities, stance, or provenance candidates. Validated code applies the documented method.
6. **Every relationship has context.** Dependency edges carry provenance, temporal meaning, confidence state, and assumptions.
7. **Unknown is a valid state.** Do not quietly treat unresolved provenance or a missing graph edge as proof of independence or absence.
8. **Time and revision history are first-class.** Preserve what was published, when Arcstar observed it, the period an assertion is believed to describe, and when corrections became known.
9. **Errors remain visible.** Ingestion failures, stale feeds, deleted sources, model uncertainty, and conflicting reports must be inspectable.
10. **Data rights are part of implementation.** Access, attribution, retention, and redistribution terms must be reviewed before a provider is integrated into a public product.
11. **Phase gates are real.** No release gate is passed by attractive UI, test coverage, or an assertion in documentation alone.
12. **Keep operations simple.** Prefer the current TypeScript monorepo, PostgreSQL, pg-boss, Hono, React, and Sigma.js. Add infrastructure only when measured needs justify it.

## 4. Current baseline

The repository currently contains:
- A TypeScript/pnpm/Turborepo monorepo.
- Shared Zod contracts.
- A pure credibility package with source-cascade handling, contradiction handling, method versioning, and explanation output.
- A pure dependency graph package with relation-aware blast-radius traversal and as-of edge resolution.
- A Hono API with health, demo graph, demo claim, score, and blast-radius endpoints.
- A React/Sigma.js graph UI that loads the demo graph and requests impact results.
- CI for purity, type checking, linting, and tests.
- A documented 300-claim benchmark concept whose workflow is currently disabled because the evaluation harness has not been implemented.

The repository documentation reports strong automated coverage and passing tests for the pure packages. Those tests demonstrate implementation behavior against defined inputs; they do not establish that the scoring model is valid on real-world claims.

### Known gaps to address

- No production-ready persistent evidence store or migrations.
- No completed production ingestion adapters.
- No implemented and reviewed real-world benchmark.
- No documented, evidence-backed graph corpus at the target initial scale.
- The current source-tier and score parameters are methodological assumptions that require empirical scrutiny.
- Citation ancestry alone cannot prove independence; inferred and unknown lineage need explicit states.
- Claim-to-passage support, contradiction, and qualification needs a first-class contract.
- Graph impact outputs lack enough supporting evidence and uncertainty information for analysts to audit them end to end.
- The current UI is a basic graph MVP rather than a complete investigation workflow.
- Deployment, operations, security, source governance, and restore procedures are not yet beta-ready.

## 5. Scope and non-goals

### Included in the first validated vertical slice

- Curated maritime/energy scope.
- Recorded source fixtures and an initial live adapter path.
- Persistent source, document, claim, evidence, entity, edge, assessment, and revision records.
- Source lineage and duplicate/syndication representation.
- Candidate claim extraction with explicit passage links and review states.
- Versioned deterministic method scores and explanations.
- Evidence-backed, date-aware dependency graph.
- Bounded blast-radius investigation with path explanations.
- Analyst workflow to inspect claims, sources, paths, caveats, and scenario assumptions.
- Reproducible benchmark and expert-reviewed graph scenarios.
- Self-hosting and limited-beta hardening.

### Explicitly deferred

- Universal coverage of countries, sectors, and event types.
- Autonomous AI analyst that writes authoritative conclusions without evidence review.
- Forecasts for armed conflict, commodity prices, or financial markets.
- Public unrestricted compute API.
- Accounts, team collaboration, paid plans, and enterprise access control before user validation.
- Neo4j, Kafka, Kubernetes, or distributed microservices without measured need.
- PageRank and advanced graph algorithms before graph quality is established.
- Redistribution of provider data without verified permission.

## 6. Architecture and durable boundaries

Keep the existing top-level boundaries. Add a new package or deployable only when its responsibility and contract are clear.

### Target responsibilities

- **packages/contracts:** Shared schemas and wire types. Schema changes require compatibility notes and updates to all consumers.
- **packages/credibility:** Pure deterministic scoring and explanation logic. No database, network, filesystem, clock, or model calls.
- **packages/graph:** Pure relation-aware traversal, temporal snapshots, path aggregation, and impact ranking.
- **packages/provenance (planned):** Pure/source-independent functions for lineage representation and independence classification, where that logic can remain pure.
- **packages/ingestion (planned):** Shared adapter types, normalization contracts, canonical identifiers, and fixture helpers. I/O-specific adapter code may live in the worker.
- **apps/api:** Hono HTTP boundary, input validation, authorization/rate limiting where needed, application orchestration, and repository calls.
- **apps/worker (planned):** Scheduled and queued ingestion, extraction, reprocessing, and retry workflows.
- **apps/web:** React/Sigma.js investigation experience.
- **evals (planned):** Versioned datasets, benchmark definitions, scenario cases, evaluation runners, and reports.
- **migrations (planned):** Ordered PostgreSQL schema migrations.
- **scripts:** Reproducible operational checks and local development helpers.

The credibility and graph packages must remain independently testable. I/O and side effects belong in adapters, API, worker, or repositories. Avoid circular package dependencies.

### Persistence direction

Use PostgreSQL as the source of truth and pg-boss as the initial processing queue, as specified in PLAN.md. Begin with one deployable API and one worker process. Use Docker Compose for self-hosted deployment. Do not add Redis or a separate graph database just to follow a fashionable architecture.

### Initial data model

The implementation should support these logical records. Physical table names and normalization details can be refined during migrations, but semantic differences must remain represented.

- **Source:** Publisher identity, canonical identity, source tier/category if used, language, access/licensing policy reference, and observed metadata.
- **Document:** Original and canonical URL, provider ID, content hash, publication time, retrieval time, revision identity, retrieval status, and retained text or permitted excerpt.
- **Claim:** Atomic proposition, subject/entity links, event or asserted time, publication relation, language, resolution state, and extraction provenance.
- **ClaimEvidence:** Claim-to-passage relationship with stance such as supports, contradicts, qualifies, or mentions; passage locator/text span; extraction method/version; and confidence/status.
- **SourceLineage:** Source-to-source relationship with type (cites, syndicates, quotes, shared release, or inferred derivation), evidence, and verification state.
- **Entity:** Canonical identity, entity type, aliases, external identifiers, and resolution evidence.
- **DependencyEdge:** Typed relationship, direction semantics, strength/units where justified, effective validity interval, observed timestamp, evidence references, confidence state, and verification method.
- **Assessment:** Method version, assessment timestamp, input/evidence snapshot reference, component values, output, complete explanation, and evaluation status.
- **Revision/Audit event:** Who or what changed a record, when, why, and what the prior/new values were. Preserve historical assessments instead of overwriting them silently.
- **SourcePolicy:** Access method, attribution, retention, redistribution permission, review date, and relevant restrictions.

Use W3C PROV-O as a compatible conceptual reference for provenance, not as a mandate to replace Arcstar's TypeScript contracts.

## 7. Phase status overview

| Phase | Scope | Initial status |
|---|---|---|
| 0 | Foundation, monorepo, CI, pure package boundaries | Complete |
| 1 | Credibility core and deterministic invariants | Complete as implementation; empirical validity unproven |
| 2 | Dependency graph core and as-of resolution | Core blast-radius behavior implemented; graph corpus and min-cut deferred |
| 3 | Evaluation protocol and benchmark pilot | Not started |
| 4 | Evidence contracts, persistence, migrations, repositories | Not started |
| 5 | Source adapters and reliable ingestion pipeline | Not started |
| 6 | Claim extraction, entity resolution, evidence review | Not started |
| 7 | Evidence-backed dependency corpus and scenario evaluation | Partial foundation; corpus/evaluation incomplete |
| 8 | Analyst API and investigation UI | Demo API and graph MVP exist; target workflow incomplete |
| 9 | Hardening, self-hosting, limited beta | Not started |
| 10 | Expansion to additional domains and contributors | Deferred until beta gates pass |

Phase numbers describe the updated execution order. The original status table in PLAN.md is historical; this document controls the order of unshipped work. Existing methodological decisions and corrections in PLAN.md remain binding unless explicitly changed with evidence.

## 8. Phase 0 — Foundations

**Status: Complete.**

### Purpose
Establish reproducible developer workflows, package boundaries, shared contracts, and automated verification.

### Existing deliverables
- TypeScript monorepo with pnpm and Turborepo.
- Contracts, credibility and graph packages.
- CI for purity, typecheck, lint, and tests.
- Agent instruction hierarchy and package-level guidance.
- Deterministic fixtures and initial property tests.

### Maintenance requirements
- Keep the default branch CI green.
- Preserve the credibility purity gate.
- Keep project status documents aligned with code.
- Keep CI free of live network dependencies.
- Avoid adding new dependencies without explaining the responsibility they serve.

### Exit gate
Already passed as a foundation gate. Any regression reopens this gate for the affected boundary.

## 9. Phase 1 — Credibility core

**Status: Implementation complete; method validity unproven.**

### Purpose
Provide reproducible method scores with explicit inputs and full explanations.

### Required behavior
- Validate claim and source inputs through shared contracts.
- Calculate scores deterministically with a method version.
- Collapse source cascades according to the documented lineage rules.
- Apply documented contradiction handling.
- Return a complete explanation for every score.
- Preserve zero-score and malformed/missing-source semantics.
- Keep the scoring package free of I/O and external model influence.

### Required work
1. Re-read PLAN.md and source package AGENTS.md before modifying the method.
2. Document each score component as a hypothesis to evaluate, not an established empirical fact.
3. Audit source tier mapping, primary evidence factor, extraction-confidence gate, corroboration saturation, and contradiction cap.
4. Add benchmark hooks without introducing I/O into the pure engine.
5. Keep the score labeled as a **method score**. Do not call it a probability or confidence percentage.
6. Any arithmetic change requires a method-version bump, updated golden fixtures, tests, and a dated correction explaining the evidence.

### Exit gate
All existing invariants and CI checks pass; explanations are complete; outputs are versioned; the method's numerical semantics are explicit. Empirical release approval remains blocked until Phase 3 passes.

## 10. Phase 2 — Dependency graph core

**Status: Core traversal and as-of edge resolution implemented; real graph validation remains.**

### Purpose
Compute bounded, reproducible impact rankings using relation-aware propagation.

### Required behavior
- Explicitly encode propagation semantics by relation type.
- Resolve graph edges against a requested historical timestamp.
- Prevent infinite traversal through cycles.
- Bound hops and computational cost.
- Aggregate path contributions deterministically.
- Return stable ordering and explanatory paths.

### Required work
1. Preserve tests for every relation direction and relation type.
2. Add fixtures for missing nodes, disputed edges, edge revisions, and terminated dependencies.
3. Add a maximum graph/request budget and test pathological inputs.
4. Specify whether a returned path is representative or whether multiple material paths should be returned; do not imply one path explains a multi-path aggregate when it does not.
5. Defer min-cut, PageRank, and other higher-cost algorithms until evidence-backed graph quality and user need justify them.

### Exit gate
Pure graph tests pass; time-travel and relation semantics are documented; graph resource limits are explicit. Domain-level ranking claims remain blocked until Phase 7 passes.

## 11. Phase 3 — Evaluation protocol and benchmark pilot

**Priority: P0. Must be the first new product-validation milestone.**

### Purpose
Test whether the methodology discriminates between supported and refuted real-world claims, whether source cascades are identified, and whether numerical outputs justify their intended interpretation.

### Work packages
1. **Benchmark specification**
   - Define inclusion/exclusion criteria, claim unit, time window, languages, domains, and adjudication process.
   - Keep event claims distinct from opinion, predictions, and ambiguous compound statements.
   - Record label rationale and source URLs.
2. **Pilot corpus**
   - Build an initial 30–50 claim set.
   - Include supported, refuted, mixed/qualified, and unresolved cases.
   - Include deliberate cascade and shared-origin cases.
   - Ensure each example has reviewable supporting references.
3. **Label governance**
   - Prefer primary evidence and multiple independent expert-quality references where available.
   - Record reviewer reasoning, disagreement, adjudication, and dataset version.
   - Do not automatically treat the result of one fact-check publisher as perfect ground truth.
4. **Leakage controls**
   - Split by event and, where feasible, source family/provenance group rather than randomly splitting near-duplicate articles.
   - Keep development, calibration, and final test sets separate.
5. **Evaluation runner**
   - Compute confusion matrices, ROC AUC on an appropriate binary subset, precision/recall, and threshold-specific results.
   - Add calibration metrics only for outputs intended to be probabilities.
   - Evaluate unresolved and mixed labels separately instead of forcing them into true/false.
   - Evaluate cascade classification independently from claim truth.
6. **Baseline report**
   - Run the current method without tuning on the held-out subset.
   - Compare with simple baselines, including source-tier-only and naive article-count/corroboration baselines.
   - Record dataset version, method version, configuration, code commit, metrics, and known limitations.

### Target scale and gates
The existing master doctrine specifies a 300-claim benchmark with 100 confirmed true, 100 confirmed false, and 100 ambiguous cases. Refine the label protocol rather than treating those counts as permission to force ambiguity into binary labels. Aim for at least 300 adjudicated claim records in the expanded benchmark, with a sufficiently large and clean held-out binary subset.

Initial acceptance targets retained from PLAN.md:
- AUC at least 0.80 on the defined held-out binary subset.
- Mean score difference between supported/true and refuted/false cases at least 0.25, if the defined score scale makes that comparison meaningful.
- At least 90% correct collapse on the separately labeled deliberate-cascade set.
- The existing threshold criterion for high scores is evaluated, but must not be presented as probability calibration unless the output is actually calibrated as a probability.

Additional requirements:
- Publish per-class and per-subgroup results.
- Include confidence intervals or an appropriate uncertainty analysis where practical.
- Test sensitivity to missing lineage and extraction errors.
- Establish a written procedure for updating labels and reproducing a report.

### Methodology decisions that must be made from evidence
- Does tiering generalize across publishers and languages?
- Does extraction confidence correspond to extraction correctness?
- Does primary-evidence presence have consistent value?
- Does the contradiction cap preserve wrong claims that should be refuted?
- Does source-cascade collapse improve results beyond naive source counting?
- Which cases should result in an abstention/unknown state?

### Exit gate
A reproducible benchmark report and pilot dataset exist; leakage checks pass; the current method is compared against baselines; known failure modes and decision recommendations are documented. AUC alone does not authorize a probability label. If the method misses the target, it remains experimental and Phase 1 is revised before making validated-product claims.

## 12. Phase 4 — Evidence contracts, persistence, and migrations

**Priority: P0.**

### Purpose
Replace demo-only data paths with durable, auditable canonical records while preserving existing pure packages.

### Work packages
1. Finalize contracts for source, document, claim, claim evidence, source lineage, entity, dependency edge, assessment, revisions, and source policies.
2. Separate publication time, Arcstar observation/retrieval time, assertion/event time, and effective validity intervals.
3. Make support, contradiction, qualification, and mention explicit relations tied to evidence passages.
4. Represent provenance relationships as observed, inferred, verified, disputed, or unknown as appropriate.
5. Add an ordered PostgreSQL migration framework and repository interfaces.
6. Store versioned assessments with input snapshot references; do not silently overwrite past outputs.
7. Add stable IDs, uniqueness constraints, foreign keys, indexes, transaction boundaries, and idempotent upserts.
8. Use UTC instants at API and storage boundaries; validate date parsing instead of accepting invalid dates.
9. Retain source metadata and permitted excerpts in accordance with source policy. If a provider forbids retention or redistribution, store only what is permitted and a link/reference to the source.
10. Add deterministic fixtures and repository integration tests.

### Data-integrity requirements
- Duplicate ingestion must not create duplicate logical documents.
- A changed source document creates a traceable revision rather than silently overwriting past evidence.
- Unknown sources or missing lineage must be represented explicitly.
- Deleted/unavailable sources create provenance gaps; they are not silently removed from past explanations.
- Every derived assessment identifies its method version and evidence snapshot.

### Exit gate
A clean database migrates from empty state; seeds and fixtures load deterministically; repositories pass integration tests; a service restart preserves records and revision history; assessment outputs are reproducible from stored snapshots.

## 13. Phase 5 — Source adapters and reliable ingestion

**Priority: P0 for one adapter, then incremental expansion.**

### Purpose
Ingest a narrow selection of useful, lawful-to-use source material reliably without turning external API instability into core-engine instability.

### Initial source order
1. Curated RSS/Atom feeds and selected official sources.
2. GDELT document/news discovery as a discovery input, subject to provider behavior and terms.
3. Google Fact Check Tools API as a source of existing fact-check references, not universal truth labels.
4. ACLED or specialist datasets only after access, attribution, retention, and redistribution conditions are reviewed.
5. Later, domain-specific data for shipping routes, energy flows, commodity exposure, sanctions, and ports.

Provider choice is conditional on current technical documentation, access availability, and legal/contractual review at implementation time. This plan does not grant data access or redistribution rights.

### Adapter contract
Each adapter must define:
- Stable provider identifier and configuration.
- Fetch method with cursor/checkpoint support where available.
- Normalized output schema.
- Publication/retrieval timestamps and canonical URL rules.
- Rate limits, pagination, maximum window, retry rules, and timeout.
- Access and licensing metadata.
- Health/freshness reporting.
- Recorded fixtures and contract tests.

### Processing pipeline
1. Fetch using a bounded timeout and provider-specific limits.
2. Record request state, checkpoint/cursor, retrieval time, and response status.
3. Normalize canonical identity, publisher, dates, language, and metadata.
4. Deduplicate provider IDs, canonical URLs, and content fingerprints while preserving meaningful revisions.
5. Validate normalized documents and persist them idempotently.
6. Queue extraction only for new or materially changed content.
7. Record partial failures and resume safely without duplicate writes.
8. Track last successful refresh, lag, failure count, and provider-specific quota/rate-limit conditions.

### Safety and source governance
- Do not fetch arbitrary URLs extracted from article text.
- Prevent server-side request forgery by restricting outbound hosts, resolving and validating destinations, and blocking loopback, private, link-local, and metadata-service addresses.
- Treat retrieved content as untrusted data and defend extraction prompts against document-borne prompt injection.
- Store source policy metadata, attribution, retention limits, redistribution restrictions, and review dates.
- No live network dependencies in unit tests or default CI runs.

### Exit gate
At least one real adapter is integrated end to end using fixtures for CI; retries and failures are observable; ingestion is idempotent; freshness is exposed; source policies are documented; replaying a batch produces no duplicate logical records.

## 14. Phase 6 — Claim extraction, entity resolution, and evidence review

**Priority: P0 after the first persistent ingestion path exists.**

### Purpose
Convert retrieved documents into reviewable candidate claims without pretending the model has established truth.

### Work packages
1. Extract atomic candidate claims and record exact source passage offsets or stable passage identifiers.
2. Keep extraction confidence distinct from factual credibility.
3. Assign candidate stance—supports, contradicts, qualifies, or mentions—relative to a specific proposition.
4. Link named entities to canonical entities with alias and resolution evidence.
5. Use deterministic normalization and high-confidence alias rules first; route ambiguous matches to an unresolved/review state.
6. Store extraction provider/model name, prompt/schema version, inference timestamp, and raw structured output where retention policy permits.
7. Validate outputs with Zod and reject malformed or unsupported IDs.
8. Keep a deterministic no-LLM path for testing and graceful degradation.
9. Add representative multilingual, negation, quotation, date, and conflicting-report fixtures.
10. Provide an explicit way for a reviewer to confirm, reject, or correct a candidate and preserve the audit record.

### Prompt-injection boundary
Documents are source data, never trusted instructions. A document must not be able to alter model/system policy, tools, credentials, scoring rules, or job controls. The extraction step may only return validated candidate records.

### Exit gate
Every surfaced claim links to its source document and supporting passage or clearly discloses missing passage provenance; ambiguous entity matches are not silently auto-confirmed; extraction failure is recoverable; model and schema versions are stored; fixture evaluation demonstrates bounded, measurable extraction quality.

## 15. Phase 7 — Evidence-backed dependency corpus and scenarios

**Priority: P0 for the first domain-specific product.**

### Purpose
Build a small graph whose relationships are better evidenced than a large, unreliable graph.

### Initial domain
Maritime chokepoints and energy supply. Start with the Strait of Hormuz and a narrow set of connected routes, countries, commodities, ports, infrastructure, and downstream dependencies. Do not fabricate a target node/edge count merely to satisfy a scale metric; prioritize a source for every consequential edge.

### Work packages
1. Define node/edge inclusion criteria and a canonical entity dictionary.
2. Seed the graph from authoritative, legally usable sources with recorded provenance.
3. Separate verified, estimated, disputed, and unknown relationship states.
4. Record edge direction semantics, units/meaning for weights, valid time interval, observation time, evidence references, and verification method.
5. Define how an edge becomes stale and how conflicting updates are resolved.
6. Add graph snapshot creation and deterministic historical queries.
7. Build an expert-reviewed scenario corpus, initially including:
   - Strait of Hormuz transit disruption.
   - Loss of a supplier and downstream exposure.
   - Alternative supply route or source.
   - Termination of a historical dependency.
   - Conflicting reports about a relationship.
   - Multiple paths to the same affected entity.
8. Review graph paths and rankings with explicit domain assumptions; label scenario outputs conditional, not predictive.
9. Evaluate path correctness, top-k ranking, edge provenance completeness, and sensitivity to missing/estimated edges.
10. Defer min-cut and centrality algorithms until graph quality and a concrete user need justify them.

### Graph score semantics
- Maintain the deterministic impact score as an algorithm-specific ranking signal.
- Do not label it as predicted loss, probability, volume, or severity unless a separate validated model with appropriate units and data is developed.
- Explain whether a path is representative or whether multiple contributing paths were aggregated.
- Expose the graph snapshot, traversal options, propagation direction, relevant edges, and data caveats.
- Never infer that no recorded edge means no real-world dependency.

### Exit gate
The curated graph has source references for consequential edges; each target scenario has documented assumptions and expert-reviewed expected paths/ranking; historical edge resolution and edge termination work; users can inspect the explanation for a returned result; missing and estimated relationships are visible. Existing Hormuz top-10 agreement target of at least 8/10 remains a target, subject to a documented adjudication protocol.

## 16. Phase 8 — API and analyst investigation workflow

**Status: Basic API and graph demo exist; full workflow is not implemented.**

### Purpose
Join evidence, provenance, method assessments, and graph impact into a usable, auditable investigation.

### API work
Evolve the existing endpoints without needlessly breaking the shared contracts. Adopt a versioned API namespace for stable product routes. Initial candidate operations:

- Read an entity and its current/historical relationships.
- Read a claim, supporting evidence, lineage, and assessment.
- Read claim and assessment history.
- Create and inspect an investigation.
- Run a bounded scenario against a specific graph snapshot.
- Inspect a source, freshness, lineage, and associated claims.
- Check service and ingestion health.

These are proposed operations, not a demand to implement every endpoint in one change. Start with the minimum vertical slice: entity/graph read, claim and evidence read, create/inspect investigation, and scenario output.

### Request/response rules
- Validate all input and output contracts.
- Apply graph-size, hop-count, timeout, body-size, and result-size limits.
- Use stable error codes and avoid returning stack traces or secrets.
- Configure CORS as an explicit allowlist, not a permissive wildcard for a public deployment.
- Rate-limit expensive public endpoints.
- Do not accept a whole client-supplied graph as authoritative for a stored-data scenario; resolve a server-owned snapshot and record the snapshot ID.
- Keep API orchestration and database I/O out of the pure core packages.

### Frontend work
1. Situation/investigation list with freshness and unresolved-evidence indicators.
2. Interactive graph with selection, filtering, relation direction, and bounded exploration.
3. Persistent evidence inspector that shows passages, source lineage, contradictory evidence, and score derivation.
4. Impact results panel showing ranking, path, edge evidence, assumptions, and uncertainty state.
5. Timeline distinguishing publication, observation, event time, and relationship validity.
6. Scenario comparison and exportable evidence trail.
7. Loading, empty, stale, partial, and error states that do not masquerade as success.
8. Component and integration tests for graph selection, scenario requests, filtering, and evidence inspection.

### UX rule
Make evidence inspection and path explanations the primary workflow. Do not let graph animation, numeric badges, or polished design imply a stronger certainty level than the data supports.

### Exit gate
A new user can run the initial investigation from persisted source documents through claims, evidence, graph path, and scenario output without manual database edits; every displayed conclusion links to evidence or discloses its limitations; UI has tests for primary interaction and failure states.

## 17. Phase 9 — Hardening, self-hosting, and limited beta

**Priority: P1 after a usable end-to-end vertical slice.**

### Security and reliability
- Threat-model ingestion, external documents, model extraction, API computation, secrets, and persistent records.
- Restrict adapter outbound requests and validate all external destinations.
- Use least-privilege database roles and environment-based secrets.
- Implement request validation, API timeouts, rate limits, CORS allowlist, and safe error responses.
- Add structured logs, adapter health/freshness, queue backlog, retry counts, ingestion lag, API latency, and error rates.
- Add idempotent jobs and a visible terminal-failure/replay process.
- Add database backup and restore verification.
- Test clean startup, migrations, shutdown, and restart behavior.
- Audit dependency licenses and source dataset rights.
- Document how to purge or correct data when required while preserving a lawful audit trail.

### Deployment and operations
- Provide Docker Compose for API, worker, PostgreSQL, and required supporting services.
- Provide a sample environment file with no secrets.
- Document install, upgrade, backup, restore, troubleshooting, supported source configuration, and data retention.
- Keep live-source credentials optional for a sample/demo deployment.
- Provide a reproducible sample dataset so the UI can be explored without external accounts.
- Run tests and static checks in CI; keep external integration tests opt-in and isolated.

### Exit gate
A clean install and backup restore succeed; no required source service is silently unavailable; data freshness and processing failures are visible; API protections are configured; all applicable CI gates pass; the evaluation report and known limitations are published; source rights and AGPL-3.0 obligations are documented.

### Beta rules
- If benchmark gates fail, label the scoring method experimental and do not market it as validated.
- If scenario ranking gates fail, present the output as exploratory and do not claim expert-validated rankings.
- Do not label method scores as calibrated probabilities.
- Do not publish content or provider data outside its permitted use.
- Do not launch until a user can trace a conclusion from output to evidence.

## 18. Phase 10 — Community and domain expansion

**Status: Deferred until Phase 9 gates pass.**

### Purpose
Expand carefully based on actual user demand and measured product quality.

### Candidate domains
- Sanctions and trade restrictions.
- Critical minerals and manufacturing dependencies.
- Ports, shipping routes, and logistics infrastructure.
- Additional energy flows and commodities.
- Wider geopolitical events and cross-sector dependencies.

### Work packages
1. Choose the next domain only after a written user/use-case rationale.
2. Define domain-specific source policy and data contract extensions.
3. Add benchmark records and expert scenarios before claiming domain readiness.
4. Add source adapters incrementally using recorded fixtures and contract tests.
5. Measure performance and graph-data completeness before optimizing or changing infrastructure.
6. Publish method, dataset, and evaluation changes.
7. Improve contributor onboarding, source adapter documentation, security reporting, and reproducible development.

### Exit gate
The existing vertical remains healthy; new domain sources have reviewed usage rights; domain-specific benchmark and scenario gates pass; architecture changes are justified by measured use or workload rather than speculative scale.

## 19. Cross-phase quality gates

These apply to every phase and cannot be waived silently.

### Code and architecture
- Typecheck, lint, tests, build, and the credibility purity gate pass.
- New packages have a clear responsibility and dependency direction.
- No live network access is required for normal CI.
- Shared contract changes include compatibility notes and consumer updates.
- Graph algorithms have explicit resource bounds and cycle behavior.
- Side effects live outside pure methodology packages.

### Evidence and methodology
- Every published score has an explanation and method version.
- Every claim links to evidence or visibly records a provenance gap.
- Unknown provenance is not automatically counted as independent.
- Source-lineage and contradiction changes include fixtures and evaluation results.
- Any scoring arithmetic change increments the method version.
- Method score and calibrated probability remain distinct.
- Every graph result identifies assumptions and its graph snapshot.

### Data governance
- Provider terms and data rights are reviewed before integration.
- Attribution, retention, deletion, and redistribution conditions are recorded.
- Source changes and deleted sources do not silently erase history.
- The system treats external documents as untrusted input.
- Credentials are not committed or included in logs.

### Delivery and documentation
- Exit criteria are checked with evidence, not prose assertions.
- The closest AGENTS.md and parent indexes are updated when durable boundaries or contracts change.
- README status and roadmap phase status reflect the actual repository.
- Known limitations remain visible to users and operators.

## 20. Performance and operational targets

Do not optimize against arbitrary scale claims without measurement. Start by defining reproducible test fixtures and measure:

- p50/p95 API latency for entity read, claim inspection, and bounded scenario query.
- Maximum accepted node, edge, hop, and result counts per request.
- Time and memory for benchmark/evaluation runs.
- Adapter success rate, ingestion lag, retry count, and queue age.
- Database query plans for common graph and history queries.
- Browser responsiveness and interaction quality on the expected beta corpus.

The current plan's initial graph target (roughly 5,000 nodes and 50,000 edges) can remain a planning envelope, not a performance guarantee. Validate it with representative data and documented hardware before claiming support. WebGL rendering capability does not eliminate API, data-loading, layout, or browser-memory bottlenecks.

## 21. Main risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Method score fails on real claims | Product's central thesis is not demonstrated | Phase 3 pilot, baselines, held-out evaluation, experimental labeling if gate fails |
| Label leakage | Inflated and misleading benchmark performance | Split by event/source family; run duplicate/cascade leakage checks |
| Citation graph mistaken for independence | Source count overstates corroboration | Track lineage type and verification; preserve unknown state |
| Contradictions capped too aggressively | Well-refuted claims retain unjustified score | Compare alternatives on labeled data; version methodology changes |
| Incorrect entity linking | Impact graph is structurally wrong | Candidate links, resolution evidence, ambiguity/review state |
| Incomplete dependency edges | False negatives or exaggerated impact | Evidence-backed graph, known gaps, expert scenarios, sensitivity tests |
| Provider terms change | Data cannot lawfully be retained or redistributed | Source policy registry, periodic terms review, adapter disable path |
| Feed outage or schema drift | Stale/partial intelligence without warning | Health state, fixtures, schema validation, backoff, freshness indicators |
| Prompt injection in retrieved content | Extraction behavior or tool use manipulated | Treat documents as untrusted; restrict model tools; validate outputs |
| Scope creep | No end-to-end release | Single maritime/energy wedge, deferred feature list, exit gates |
| Premature infrastructure complexity | Maintenance cost without user value | PostgreSQL/pg-boss/single-service approach until measured need |
| Overconfident UI | Users mistake algorithm output for fact or forecast | Method-score labeling, uncertainty presentation, path/source inspection |

## 22. Immediate backlog

Execute these in order, with small reviewable changes:

1. Create the 30–50 record benchmark pilot and document labeling/split policy.
2. Write an evaluation runner for the current method and simple baselines.
3. Audit score semantics and publish the methodology questions that evaluation must resolve.
4. Add claim-to-passage and provenance contracts, including unknown states and temporal timestamps.
5. Design and implement the first PostgreSQL migrations and repositories.
6. Build one RSS/Atom adapter with recorded fixtures and idempotent persistence.
7. Add extraction and entity-resolution candidate records with reviewable status.
8. Build the curated maritime/energy graph and source-evidenced scenarios.
9. Connect persisted claims and graph results in one end-to-end analyst workflow.
10. Harden, document, and evaluate the limited beta against the release gates.

Do not begin by building multiple source adapters, min-cut, user accounts, or broad domain coverage in parallel.

## 23. Definition of done for the first credible beta

The first credible beta is complete only when all of the following are true:

- The narrow maritime/energy use case can be investigated end to end.
- Source documents and revisions persist with source policy metadata.
- Every visible claim has passage-level evidence or an explicit missing-evidence state.
- Provenance captures known dependencies and unresolved lineage.
- Scores are deterministic, versioned, explained, and not mislabeled as probability.
- Dependency results expose their paths, evidence, timestamp, snapshot, assumptions, and missing/estimated links.
- The pilot and expanded benchmark are reproducible, split correctly, and publish limitations.
- The documented credibility and graph acceptance gates either pass or the feature remains explicitly experimental.
- Source policies, self-hosting, upgrade, backup, and restore instructions are published.
- API security, ingestion reliability, freshness visibility, tests, and CI gates pass.
- README.md, PLAN.md, IMPLEMENTATION_PLAN.md, and AGENTS.md do not contradict the delivered code or each other.

## 24. Change control

- This roadmap is a living execution contract, not a claim that future milestones are done.
- Update status only after its exit gate is demonstrated.
- Record deviations with reason, evidence, impact, and replacement acceptance criteria.
- Methodology changes belong in PLAN.md's dated corrections and require method-version changes where output semantics change.
- Durable schema, boundary, security, and workflow changes require a DOX pass.
- Do not weaken quality gates solely to make a phase appear complete.
- If a gate fails, record the failure, keep the method/features experimental, and revise the appropriate phase.

**Next action:** start Phase 3 — evaluation protocol and benchmark pilot — while doing only the minimum contract/storage design needed to avoid blocking it. The next release should prove a narrow use case end to end, not maximize the feature count.
