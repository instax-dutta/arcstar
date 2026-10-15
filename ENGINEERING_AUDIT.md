# Arcstar Engineering Audit and Remediation Backlog

**Audit date:** 2026-10-15  
**Repository:** https://github.com/instax-dutta/arcstar  
**Baseline reviewed:** main at 646a545341fb968a777613f4138cd9989ef066c5  
**Purpose:** Give coding agents a prioritized, testable remediation queue based on the repository review.  
**Document authority:** This file ranks audit findings and defines acceptance criteria. IMPLEMENTATION_PLAN.md remains authoritative for phase order and exit gates; PLAN.md remains authoritative for methodology, core semantics, and invariants.

## 1. Instructions for the coding agent

This is an engineering audit, not permission to rewrite the architecture wholesale. Before changing a finding, re-open the current implementation and verify that the defect still exists on the active branch. Code may have changed since the baseline above.

1. Start with the P0 items, in dependency order. Do not begin speculative features while a correctness, evidence-integrity, or reproducibility blocker remains.
2. Make small, reviewable changes. Add a regression test before or alongside each fix; preserve public contracts unless a deliberate, documented migration is required.
3. A finding is not complete merely because code changed or unit tests passed. Satisfy its acceptance criteria, including database integration tests where called for.
4. Do not label synthetic tests as real-world validation. Do not label heuristic extraction as verified fact, confidence as calibrated probability, or ungrounded seed edges as evidence-backed.
5. When a finding is fixed, update the status and include the fixing commit and test evidence. If the finding no longer applies, mark it **Not reproducible** with the current file/line evidence. Do not silently delete findings.
6. If work uncovers a contradiction between this file, PLAN.md, IMPLEMENTATION_PLAN.md, contracts, and runtime behavior, reconcile it explicitly. Executable contracts and tests describe current behavior; PLAN.md controls methodology; IMPLEMENTATION_PLAN.md controls order of work.

### Status convention

- **Open:** Not fixed or not yet verified against current main.
- **In progress:** A focused implementation and tests are underway.
- **Blocked:** A prerequisite or a product/methodology decision is required.
- **Done:** Acceptance criteria met; include the fixing commit and verification.
- **Not reproducible:** Current code no longer exhibits the reported issue; include evidence.

Severity is about product/release risk, not coding difficulty:
- **P0 — release/correctness blocker:** results may be materially misleading, evidence may be lost, or core semantics are not reproducible.
- **P1 — high priority:** meaningful integrity, robustness, security, or usability risk; resolve before a production/self-hosted reliability claim.
- **P2 — follow-up:** important maintainability or product-quality work after higher-risk behavior is stable.

All findings start **Open**.

## 2. Executive assessment

Arcstar has meaningful foundations: deterministic credibility and graph packages, typed contracts, an API and browser workflow, evidence-review records, source ingestion primitives, PostgreSQL repository mappings, and a synthetic evaluation pilot. The principal risk is no longer the absence of code. It is whether data and explanations remain correct as they pass through the complete system.

The most important audit themes are:

- **Evaluation validity:** the reported synthetic pilot can achieve AUC 1.0 because its labels and features are constructed together. It is useful as a smoke test, not evidence of real-world discrimination.
- **Persistence fidelity:** important source metadata and source-lineage semantics appear to be lost or flattened at PostgreSQL boundaries.
- **Temporal graph correctness:** database and in-memory edge-history resolution need a shared, explicit rule, particularly for same-time revisions and edge termination.
- **Assessment completeness:** contradiction evidence must influence the final assessment through a reproducible, persisted input snapshot.
- **Integrity and operations:** multi-step writes need atomicity; real PostgreSQL migrations and lifecycle behavior need integration coverage.
- **Product honesty:** heuristic extraction, manually seeded relationships, and hypothetical scenarios must be presented as such.

README.md reports 231 passing tests and describes coverage gates for core pure packages. Those are useful regression controls, but they do not establish methodology validity, database compatibility, source coverage, or real-world performance. The audit did not run the test suite itself. The most recent main CI run observed at the audit baseline was successful; verify CI again against any remediation commits.

## 3. Prioritized findings

### A0 — P0: Replace the synthetic pilot as the real benchmark gate

**Status:** Blocked: protocol, synthetic smoke boundary, and fail-closed real runner implemented; adjudicated real corpus remains a product-owner handoff
**Affected areas:** [evals/src/generatePilot.ts](https://github.com/instax-dutta/arcstar/blob/main/evals/src/generatePilot.ts), [evals/reports/pilot.v1.json](https://github.com/instax-dutta/arcstar/blob/main/evals/reports/pilot.v1.json), evaluation docs, README and PLAN benchmark criteria.

**Observed risk**

The current pilot creates a small set of placeholder claims with labels coupled to engineered source-tier, confidence, corroboration, and contradiction settings. The checked-in report shows 30 cases (12 true, 12 false, 6 ambiguous), AUC of 1.0, separation around 0.9209, and a passed-targets result. The report describes itself as a smoke pilot rather than a real adjudicated benchmark. Those outcomes show that the pipeline runs and the constructed cases separate; they do not show that Arcstar discriminates true from false claims from messy, independent sources.

There is also a gate-alignment risk: the benchmark criteria described in project documentation include threshold-level precision and cascade-detection goals, while the pilot runner appears primarily to calculate AUC and score separation. Confirm exactly which published gates are evaluated by code before representing them as enforced.

**Required work**

- Keep the current fixture generator as a deterministic smoke test with an explicit name such as eval:smoke; do not remove its value as a regression fixture.
- Add a distinct real-benchmark status and command. It must fail closed or report **not yet evaluable** if an adjudicated dataset is absent; synthetic data must never satisfy the release gate.
- Define a documented annotation protocol for atomic claims, truth status, ambiguity, evidence dates, adjudicator disagreement, and adjudication provenance.
- Build a small but genuinely sourced and human-adjudicated corpus before claiming real-world performance. Store stable source references, retrieval/publication dates where available, label provenance, and dataset version.
- Split the corpus to prevent leakage by source, event, duplicated/syndicated article, and near-duplicate claim. Keep related reporting from crossing train/test boundaries.
- Evaluate a simple baseline as well as Arcstar. Add ablations for cascade collapse, source quality factors, contradiction handling, and other material scoring factors.
- Enforce every published go/no-go criterion in the actual runner, including threshold precision and recall where specified, cascade detection, and class-specific metrics. Document undefined-metric behavior.
- Include confusion matrices, class counts, threshold-selection procedure, per-slice metrics, and uncertainty intervals appropriate to the dataset size. Never tune thresholds on the held-out test set.
- Version the dataset, evaluation methodology, method configuration, and generated report together.

**Acceptance criteria**

- CI runs the smoke test but clearly labels it as synthetic.
- A synthetic-only report cannot set the real benchmark gate to pass.
- A real benchmark run records exact dataset/method versions and verifies every criterion promised by the docs.
- Tests prove the gate fails when the dataset is missing, leakage checks fail, a required metric is absent, or any required criterion fails.
- README, PLAN.md, and IMPLEMENTATION_PLAN.md use consistent language about benchmark status.

### A1 — P0: Preserve scoring-critical Source fields through PostgreSQL round trips

**Status:** In progress: primary_evidence and published_at now persist; PostgreSQL integration suite added but live CI result must pass before calling this Done
**Affected areas:** Source contract; PostgreSQL source repository mapping; migrations; scoring input assembly.

**Observed risk**

The Source contract includes primaryEvidence, and scoring uses this field as an input. The inspected PostgreSQL mapping/schema appears not to persist or restore it. If confirmed on the current branch, a Source written to PostgreSQL and loaded back can be scored differently from the same Source in memory.

**Required work**

- Verify the current Source contract and full PostgreSQL read/write mapping.
- Persist primaryEvidence with a typed database representation and a forward-only migration, or deliberately redesign the contract and scoring logic so this input is not lost.
- Define behavior for existing rows where the field is absent; do not silently infer evidence quality.
- Add round-trip tests covering true, false, and absent/legacy values, and demonstrate that memory and PostgreSQL produce the same scoring inputs.

**Acceptance criteria**

- Persist → reload preserves every scoring-relevant Source field according to the schema.
- A regression test proves the assessment input is unchanged after persistence and reload.
- The migration works both on an empty database and on a database created by the prior migrations.

### A2 — P0: Preserve full source-lineage semantics instead of flattening to citations

**Status:** Done: full lineage kind/status/evidence persists; unresolved citations remain explicit gaps; tests cover round trips and API exposure
**Affected areas:** SourceLineageSchema, source repository, source_lineage table, source read/write mapping.

**Observed risk**

The schema has source-lineage concepts beyond a simple citation, including lineage kind and status. The repository mapping appears to read lineage as citesSourceIds and write records with a fixed kind/status (cites / observed). If so, upstream/republication/other lineage distinctions are lost after persistence. That weakens cascade collapse and makes independent-source reasoning unreliable.

**Required work**

- Establish the canonical relationship between Source, SourceLineage, and ClaimEvidence. Do not use a citesSourceIds convenience field as the sole representation if lineage type/status matters.
- Preserve kind, status, timing, and relevant provenance on read and write. If only a subset is supported today, encode the restriction in contracts and reject unsupported values rather than silently flattening them.
- Define how duplicate, revised, removed, and disputed lineage assertions are handled.
- Make lineage changes versioned or reviewable if they can alter credibility scores.

**Acceptance criteria**

- Round-trip tests prove every supported lineage kind/status survives PostgreSQL storage.
- A test with syndicated/republication lineage proves a cascade does not accidentally count the same origin as independent corroboration.
- Database and in-memory behavior use the same lineage semantics.

### A3 — P0: Define graph path aggregation and prevent misleading explanations

**Status:** Done: blast results carry a representative path flag, option validation includes ceiling/budget/asOf, and GraphBudgetError is explicit
**Affected area:** [packages/graph/src/blast.ts](https://github.com/instax-dutta/arcstar/blob/main/packages/graph/src/blast.ts).

**Observed risk**

Blast-radius propagation sums contributions from paths and keeps one representative path in the result. A displayed path can therefore look like the explanation for a score that actually includes several paths. Cycles, repeated edges, and semantically redundant routes may produce double counting. With a high hop limit and a dense graph, path-state expansion can consume excessive CPU or memory even when node and edge counts are bounded.

**Required work**

- Write down the semantics of a node score: what one edge means, how sequential edge weights combine, how alternate paths combine, and which paths are redundant.
- Decide whether path sums are the intended measure or whether the product needs a bounded influence/reachability measure. Do not change math without updating PLAN.md, invariants, and golden cases.
- Return enough path/contribution data to explain the aggregate honestly, or label the single returned path explicitly as an example rather than a full derivation.
- Add independent limits for path states/work, not only maximum nodes/edges/hops. Validate all numeric options, including ceiling, for finiteness, bounds, and NaN.
- Define a deterministic partial-result or explicit failure contract when a budget is exceeded; never silently present a truncated result as complete.
- Test duplicate edges, cycles, alternate paths, order permutations, disconnected components, zero/negative/non-finite inputs, and dense graphs.

**Acceptance criteria**

- Every displayed score can be reconciled with the documented aggregation rule.
- Same graph and query parameters produce the same ordered output and explanation.
- Budget exhaustion is explicit, bounded, and covered by tests.
- Results cannot be made non-finite by invalid options.

### A4 — P0: Unify temporal edge-history semantics across memory and PostgreSQL

**Status:** Done: observed_at and valid_from are distinct; memory and Postgres use latest revision then maximum weight; tests cover equal timestamps and invalid dates
**Affected areas:** apps/api/src/repositories/postgresEdge.ts, graph in-memory temporal resolver, migrations.

**Observed risk**

The PostgreSQL listAsOf query reportedly resolves competing rows using DISTINCT ON ordered by latest valid_from and then descending weight. The in-memory resolver chooses the maximum weight for an exact timestamp. If a weight-zero edge is used as a termination marker and shares a timestamp with a positive version, PostgreSQL may choose the positive edge while memory resolves differently. The repository also appears to write the same input timestamp into valid-time and observed-time fields, even though those dates answer different questions.

**Required work**

- Define a temporal contract: valid time (when the fact applies), observed/recorded time (when Arcstar learned it), revision order, tie-breaking, and termination semantics.
- Prefer an explicit termination/valid-to representation over encoding deletion only as a zero-weight edge. If zero-weight edges are retained, document and consistently enforce their meaning.
- Use one resolution specification for memory and SQL, including same-time ties and retractions.
- Preserve valid time and recorded time separately.
- Add deterministic ordering/tie-breaking and indexes that match the query.

**Acceptance criteria**

- Shared temporal test vectors pass against the in-memory resolver and a real PostgreSQL instance.
- Tests cover insert, correction, retraction/termination, equal timestamps, out-of-order arrival, and historical asOf queries.
- A historical result does not change just because a later revision was recorded, unless the requested temporal semantics explicitly require it.

### A5 — P0: Make assessment inputs complete, persisted, and reproducible

**Status:** Done: reviewed contradictions are resolved into assessments, snapshots store claim/sources/contradictions, assessment IDs are deterministic, and reproduction is tested
**Affected areas:** [apps/api/src/app.ts](https://github.com/instax-dutta/arcstar/blob/main/apps/api/src/app.ts), assessment orchestration, credibility package, claim/source/evidence repositories.

**Observed risk**

The claim-assessment route appears to load the claim and all sources and call assessClaim with claim/allSources but without passing the contradictory claims supported by the scoring API. Claim-evidence records can carry stances such as supports, contradicts, qualifies, and mentions, but these reviewed records do not necessarily get resolved into the scoring input. This can leave contradiction evidence visible in the application but absent from the resulting assessment. The generic /score endpoint also accepts client-supplied data, so its result must not be confused with an authoritative assessment over stored records.

**Required work**

- Map evidence stance, source lineage, relevant claims, and source metadata into a single explicit assessment-input builder.
- Make it impossible for the product assessment route to omit known contradiction records by accident.
- Store an immutable snapshot/reference to every input used by an assessment, including method version, source/lineage versions, evidence-review states, and temporal cutoff.
- Clearly separate experimental/client-supplied scoring from product assessment. Product claims and scenarios should use server-owned persisted inputs.
- Make assessment identity and tie-breaking deterministic. Avoid generating a fresh random ID and then relying on ON CONFLICT(id) as if it made equivalent assessment requests idempotent.
- Define what happens when evidence changes during assessment creation; use a transaction or explicit version/snapshot boundary.

**Acceptance criteria**

- A test with an explicitly contradictory, reviewed evidence item demonstrably changes the expected assessment pathway.
- The assessment response identifies its immutable input snapshot and method version.
- Re-running against the same snapshot and method produces the same score and explanation.
- Client-supplied scoring cannot be represented as a persisted, server-verified assessment without going through the authoritative path.
- Concurrent identical assessment requests follow a documented deduplication or append-only policy.

### A6 — P0: Make multi-record database mutations atomic and verify against real PostgreSQL

**Status:** In progress: transaction boundaries, migration runner, PostgreSQL CI, rollback test, and constrained integration suite are added; live CI pass is still required
**Affected areas:** apps/api/src/repositories/, migrations, data-layer construction, self-hosting docs and CI workflows.

**Observed risk**

Several repository workflows make a sequence of independent statements: for example, source plus lineage/gaps, claim plus source links, and multi-item evidence writes. Without a transaction, one statement may succeed while a later one fails, leaving partially updated state. Repository tests reportedly use a fake SQL client, and the self-hosting documentation says the mappings have not yet been verified against a live PostgreSQL database.

**Required work**

- Introduce a transaction boundary for each logical mutation, keeping claim/source/evidence/link changes atomic where they represent one operation.
- Add rollback and injected-failure tests at each meaningful write boundary.
- Add CI with a supported PostgreSQL service. Apply all migrations to an empty database and test upgrade from the previous migration state.
- Exercise CRUD, foreign keys, check constraints, JSONB snapshots, temporal resolution, unique conflicts, rollback, concurrent writes, and restart/reload behavior.
- Define migration ordering and schema-version/readiness checks. Avoid relying on manually remembered SQL steps as the only safe deployment procedure.
- Ensure application shutdown stops intake, drains/finishes in-flight work within a deadline, closes the database pool, and then exits.

**Acceptance criteria**

- A failed multi-step write leaves no partial mutation.
- CI runs a real PostgreSQL integration suite in addition to fake-client unit tests.
- A clean database and an upgraded database both reach the expected schema and pass the integration suite.
- Deployment instructions include recovery/backup/restore expectations and are tested where practical.

### A7 — P0: Enforce the documented benchmark gate, not a weaker approximation

**Status:** Done: real and synthetic runs are separate, the real runner enforces documented metrics and fails closed, and documentation no longer conflates them
**Affected areas:** evaluation runner, README.md, PLAN.md section 6.1, IMPLEMENTATION_PLAN.md.

**Observed risk**

Project docs describe multiple go/no-go targets, including threshold precision and cascade detection. The synthetic report appears to evaluate only part of this set. A passing pilot could therefore be mistaken for satisfying all published criteria even when some criteria are not implemented or do not have reliable labels.

**Required work**

- Create a single machine-readable definition for benchmark criteria, or add tests proving code and documented criteria cannot drift.
- Calculate all required metrics and enforce all thresholds in the gate; include precision/recall and cascade-collapse-specific metrics where stated.
- Define handling for ambiguous examples, missing labels, unscorable examples, small class counts, and undefined metrics.
- Keep threshold selection separate from held-out reporting.

**Acceptance criteria**

- Each benchmark requirement maps to a named metric, an executable assertion, and a test that proves the gate fails when it does not pass.
- Documentation does not claim a criterion is enforced unless the runner actually checks it.
- Synthetic pilot output is never described as the real benchmark result.

## 4. P1 — High-priority integrity, security, and reliability fixes

### B1 — Use server-owned graph snapshots for product blast-radius analysis

**Status:** Done: client /score and /blast-radius are labeled experimental; product scenarios use server-owned snapshots with query metadata
**Affected area:** apps/api/src/app.ts, /blast-radius request schema and response.

The endpoint accepts a caller-supplied graph (with bounded but sizable node/edge counts and a maximum hop count reportedly up to 10). Its response identifies the graph as client-provided. This is useful for an explicitly experimental graph-analysis utility, but it is not an evidence-backed product answer.

**Work**
- Keep arbitrary-graph analysis clearly separated as an experimental utility route, with explicit limits and no implication that its results are Arcstar's verified graph.
- Product scenarios must resolve against server-owned data or an immutable server-owned snapshot.
- Attach snapshot ID/hash, query parameters, as-of cutoff, method version, and completeness/budget metadata to product results.
- Add request-level CPU/memory budgets, concurrency limits, output caps, and bounded pagination for graph retrieval.

**Acceptance criteria**
- A user cannot supply their own edges and have the result presented as a verified Arcstar scenario.
- Result metadata is enough to reproduce or identify the exact graph/query snapshot.

### B2 — Separate publisher/source identity from individual document identity

**Status:** Open: URL normalization, GUID precedence, publisher retention, and invalid-item skipping are fixed; document and revision identity persistence remains incomplete
**Affected areas:** apps/api/src/ingestion.ts, RSS adapter, Source and Document contracts, persistence.

**Observed risk**

Ingestion appears to derive a source ID from a hash of the raw URL (truncated) and stores feed items as Source records, using the feed channel name as publisher. URL tracking variants can create duplicates, and identical URLs discovered via different feeds can inherit whichever publisher was seen first. A Source row is not a reliable substitute for a publisher, feed, and individual document.

**Work**
- Define explicit identities for publisher, feed/connector, document, and document revision.
- Normalize URLs for identity carefully while preserving the raw observed URL and retrieval context. Do not drop query components that are semantically meaningful.
- Use provider GUIDs where available, canonical URL, and/or a content fingerprint according to a documented precedence rule.
- Keep content revisions and retrieval timestamps instead of overwriting the only representation of an updated article.
- Make re-ingestion idempotent and record source-tier rationale/provenance. Avoid silently assigning a default tier without an explicit policy.

**Acceptance criteria**
- Tracking-parameter variants of the same article resolve according to the documented normalization rules.
- The same article found through multiple feeds does not create duplicate independent sources or incorrect publisher ownership.
- Changed content can be traced to a revision, retrieval timestamp, and stable document identity.

### B3 — Replace regex-only RSS parsing with a maintained parser

**Status:** Done: RSS/Atom parsing uses a maintained parser, malformed items are isolated, and unsupported documents fail clearly
**Affected area:** apps/api/src/adapters/rss.ts.

**Observed risk**

The parser appears to handle only a limited RSS fixture format using regular expressions. Namespaces, CDATA, encoded entities, Atom feeds, malformed entries, and alternative date formats can be mishandled.

**Work**
- Adopt a maintained XML/RSS parsing library compatible with the project.
- Support explicitly documented feed formats, at minimum common RSS 2.0 and Atom variations if both are intended.
- Parse each item independently so one malformed entry does not discard the entire feed.
- Add size, entity-expansion, timeout, and malformed-input safeguards appropriate to the selected parser.
- Keep feed fetching/worker concerns separate from pure parsing and mapping.

**Acceptance criteria**
- Fixtures cover namespaces, escaped markup, CDATA, missing optional fields, invalid dates, duplicate entries, and a malformed item between valid items.
- Unsupported feed formats fail clearly instead of returning plausible empty success.

### B4 — Connect reviewed contradictions to assessment and make review history auditable

**Status:** Done: review history is append-only and auditable; assessments reference the snapshot used and do not rewrite old evidence
**Affected areas:** ClaimEvidence, evidence review route and repository, assessment input builder.

Evidence records use several stances, but assessment generation may not resolve them all into scoring inputs. Review-state updates also need an explicit audit model. A single current status is not the same as a history of who changed the review and why.

**Work**
- Preserve review state transitions as append-only events or an equivalent auditable history.
- Record actor, timestamp, prior/new status, reason, and method version where available and appropriate to the deployment.
- Distinguish observed evidence, machine-suggested evidence, and human-reviewed evidence.
- Define retention and deletion semantics without silently discarding assessment history.
- Make each assessment snapshot reference the exact evidence/review versions used.

**Acceptance criteria**
- Status changes are attributable and historically inspectable.
- Review edits do not silently rewrite the evidence basis of an old assessment.
- Tests cover supports, contradicts, qualifies, mentions, rejected/duplicate evidence, and stale review states.

### B5 — Harden rate limiting, trusted proxies, and resource budgets

**Status:** In progress: trusted proxy logic, readiness route, pagination for /graph, explicit budgets, and config are fixed; unbounded source/assessment list reads remain
**Affected areas:** apps/api/src/rateLimit.ts, app routing, server deployment configuration.

**Observed risk**

Rate limiting reportedly falls back to the first X-Forwarded-For value when a socket address is unavailable. That header is client-controlled unless a trusted proxy boundary is configured. In-memory rate limiting does not coordinate across instances. Request payload caps exist, but expensive graph work and full-list endpoints need independent cost controls.

**Work**
- Trust forwarded client addresses only when the immediate peer is a configured trusted proxy; document the exact proxy topology.
- Make limits configurable and distinguish liveness/readiness traffic from expensive analysis calls.
- Add bounded pagination for graph/source/evidence list routes rather than returning all records indefinitely.
- Apply per-route body, output, work, timeout, and concurrency budgets.
- Add a shared rate-limit backend only if/when multi-instance deployment is supported; document the in-memory single-instance scope meanwhile.
- Replace misleading always-green health behavior with separate liveness and dependency readiness, plus ingestion freshness/job health when workers exist.

**Acceptance criteria**
- Tests prove untrusted forwarded headers cannot bypass per-client limits when the socket peer is available.
- Over-budget graph requests fail with a stable, documented error and bounded resource usage.
- Operators can distinguish a live process from a process that cannot reach PostgreSQL or whose ingestion is stale.

### B6 — Make the browser workflow race-safe and expose failures

**Status:** In progress: browser requests are cancellation-safe and errors are visible; component split and browser failure/race tests remain
**Affected area:** apps/web/src/App.tsx.

**Observed risk**

Fetch logic is scattered, a claim identifier is hard-coded, and one scenario failure path clears state without presenting a visible error. Rapid scenario changes can allow a slow, stale response to overwrite the most recent selection.

**Work**
- Add request cancellation or monotonically increasing request IDs, and ignore stale responses.
- Keep loading, empty, stale, and error states explicit; do not turn all request failures into an empty graph or empty result.
- Replace hard-coded claim identifiers with selected/persisted investigation state and URL-addressable identifiers where useful.
- Mark seeded/hypothetical scenarios clearly, and show the graph snapshot, as-of time, uncertainty, and missing-evidence state.
- Split the page into focused graph, scenario, claim-inspector, and evidence-review components; share API contracts rather than duplicating wire types.
- Add keyboard/accessibility checks and a browser-level happy path plus failure/race tests.

**Acceptance criteria**
- An older request cannot overwrite the currently selected investigation.
- Network/API errors are distinguishable from legitimate empty results.
- A refreshed URL can restore the intended investigation or scenario where persistence is claimed.

### B7 — Label extraction as candidate generation and test difficult language cases

**Status:** In progress: span semantics and difficult-language tests exist; real precision/recall measurement remains
**Affected area:** packages/extraction/src/index.ts and extraction tests.

**Observed risk**

The deterministic extractor uses fixed trigger phrases and assigns a fixed confidence to candidates; entity matching is largely pattern-based. It does not establish semantic truth, reliable attribution, negation, quotation scope, or whether a reported assertion is explicitly contradicted. Entity alias matching can be ambiguous, and normalized text must not invalidate character-span offsets.

**Work**
- Keep extraction results as candidates pending evidence review; do not pass their confidence off as claim credibility.
- Specify whether spans index raw source text or normalized text and use that convention consistently.
- Add tests for negation, quoted speech, attribution, hedging, corrections, abbreviations, Unicode normalization, overlapping aliases, ambiguous entities, and no-match cases.
- Measure precision/recall on a labeled extraction set and report failure slices.
- If model-assisted extraction is introduced, validate its output against a versioned schema and keep scoring deterministic and separate.

**Acceptance criteria**
- Span offsets point to the documented text representation.
- Extraction confidence has a defined meaning and is not silently treated as truth probability.
- Quality is measured on a labeled set before making production accuracy claims.

### B8 — Correct seed dates, relationship evidence, and edge-weight meaning

**Status:** In progress: seed nodes/edges are marked unverified and scenario outputs disclose hypothetical shocks; source-backed edge evidence remains incomplete
**Affected areas:** apps/api/src/data/maritime.ts, maritime graph seed data, edge contracts, scenario UI.

**Observed risk**

The maritime sample is small and manually seeded (roughly a dozen nodes and a handful of edges), with common seed timestamps and hard-coded weights. Some sample claim wording references a March outcome while the claim's asserted timestamp is January 1 of the same year. The wire-level edge model appears not to require evidence references for every relationship. The graph is an effective demo scaffold, not yet an evidence-backed supply-chain model.

**Work**
- Correct inconsistent event, assertion, publication, and observation dates; represent unknown dates as unknown rather than inventing precision.
- Document the unit and semantics of each edge weight. A probability, capacity share, dependency strength, and normalized display weight are not interchangeable.
- Attach provenance/evidence references, source timestamps, confidence/uncertainty, and valid-time semantics to consequential edges.
- Model maritime energy exposure through route-specific flow, capacity, inventory, alternate suppliers/routes, substitution, and time horizon when supported by sources. Do not fabricate missing values.
- Make hypothetical inputs and inferred relationships visible in UI and API payloads.

**Acceptance criteria**
- Every production-represented edge has either traceable support or an explicit, visible unverified/inferred status.
- Seed dates are internally coherent.
- Scenario output separates observed facts, assumptions, and hypothetical shocks.

### B9 — Make container and self-hosting operations repeatable and safe

**Status:** In progress: migrations are repeatable, production defaults are refused, container is non-root, readiness health and graceful shutdown exist; full operational test remains
**Affected areas:** apps/api/Dockerfile, docker-compose.yml, migrations, apps/api/src/index.ts, self-hosting docs.

**Observed risk**

Compose uses known default credentials (the service is bound to localhost, which is a useful containment measure). Migrations are described as manually applied. The API container's runtime hardening and graceful shutdown can be improved. These are acceptable prototype shortcuts only if clearly presented as such.

**Work**
- Make credentials overrideable and require a non-default secret for non-development deployments; document safe secret handling.
- Add a repeatable migration service/entry point and a schema readiness preflight.
- Run the API as a non-root user, use a deliberate multi-stage runtime image, and define image/dependency update policy.
- Add container health checks consistent with liveness/readiness semantics.
- Gracefully stop accepting requests, drain in-flight work, close database resources, and terminate by a bounded deadline.
- Document backup, restore, upgrade, downgrade limitations, logs, and operational recovery.

**Acceptance criteria**
- A new operator can start an empty deployment from documented commands with no manual hidden migration step.
- Production mode refuses unsafe defaults rather than merely warning silently.
- Shutdown and restart tests do not lose acknowledged writes or leave hung processes.

## 5. P2 — Follow-up hardening and contract clean-up

### C1 — Canonicalize snapshot hashing and expose result completeness

**Status:** Done: snapshot IDs canonicalize sorted content and include method/query parameters; omitted asOf is not a wall-clock input

Snapshot IDs should be stable for identical content and query semantics, not differ merely because a fresh wall-clock timestamp was generated for an otherwise unchanged graph. Sort canonicalized nodes/edges, include the true graph revision and relevant method/query parameters, and preserve asOf as explicit metadata. Add tests for order permutations, property insertion order, equivalent timestamps, and changes that should or should not change the hash.

### C2 — Audit entity property persistence and schema constraints

**Status:** In progress: database enum constraints are added; full Entity property round-trip audit remains

Verify that PostgresEntityRepository round-trips the full Entity contract instead of storing all properties under an external_ids interpretation and reconstructing only selected fields. Add database CHECK constraints for finite relation types and other enum-like contract fields, and test that the database rejects values the API schema would reject. Keep migration and Zod validation aligned.

### C3 — Paginate, cache, and bound read amplification

**Status:** Open: /graph paginates; source/evidence and assessment list reads still load all matched rows

Avoid loading the entire source pool on every assessment or returning unbounded graph payloads as data grows. Add query plans and indexes for expected filters, pagination/cursors with stable ordering, and request-level limits. Cache only when cache keys include temporal cutoff, snapshot/method version, and other relevant dependencies.

### C4 — Unify API contracts, errors, and observability

**Status:** In progress: request IDs and stable error categories are present; structured metrics/logging remains

Use stable structured error categories across validation, conflict, missing resource, timeout, database unavailable, and budget exhaustion. Add request correlation IDs, route latency/error metrics, ingestion freshness, queue/retry metrics, and assessment snapshot IDs. Never return stack traces or sensitive SQL details to clients.

### C5 — Align user-facing claims about override workflows and product maturity

**Status:** Done: README and PLAN no longer claim an unreviewed override workflow

README.md says users may override any score and that overrides feed the public benchmark. The reviewed routes did not appear to expose a complete general override workflow. Verify current routes before changing docs. Either implement a governed, auditable review/override flow and benchmark ingestion policy or narrow the product claim. Never put unreviewed user overrides directly into a public benchmark without provenance, validation, and abuse controls.

### C6 — Explicitly initialize seeded in-memory data and document demo scope

**Status:** Done: data-layer readiness is explicit before serve and in-memory seeding happens during ready

Avoid relying on async methods with currently synchronous effects to finish seeding before a request arrives. Expose data-layer readiness or initialize the seed deterministically before accepting traffic. Keep example/demo graph status visible in API and UI.

## 6. Recommended execution order

This is a risk-based queue, not a replacement for the existing phase plan. Keep IMPLEMENTATION_PLAN.md as the canonical phase/exit-gate ordering and update it when this work changes a gate.

1. **Evaluation truthfulness:** separate smoke and real benchmark; align executable gates with documented metrics.
2. **Persistence fidelity:** preserve Source scoring fields and full lineage semantics across PostgreSQL round trips.
3. **Temporal graph consistency:** define edge revision/termination rules and test both implementations against real PostgreSQL.
4. **Assessment correctness:** resolve contradictory evidence, snapshot all inputs, and make assessments reproducible.
5. **Transactionality and integration CI:** atomic writes, migration tests, real database restart/upgrade verification.
6. **Graph scoring safety:** define aggregation mathematics, representative-path semantics, and compute budgets.
7. **Source ingestion correctness:** publisher/feed/document identity, robust RSS/Atom parsing, revisions, retries, and freshness.
8. **API trust boundaries:** distinguish arbitrary client graphs from server-owned investigations, then complete resource budgets and proxy trust.
9. **UI correctness and disclosure:** race-safe requests, visible errors, snapshot/uncertainty labels, browser E2E.
10. **Extraction quality and evidence-backed maritime corpus:** measure candidate quality and ground consequential edges.
11. **Self-hosting and operational hardening:** repeatable migrations, secure defaults, health/readiness, graceful shutdown, backup/restore.
12. **Secondary cleanup:** canonical hashes, entity mapping, pagination/caching, observability, and docs consistency.

Do not defer A0 correctness work merely because the unit coverage number is high. Conversely, do not expand to forecasting, autonomous authoritative analysis, speculative graph algorithms, or broader geography until the benchmark, provenance, persistence, and explainability gates are credible.

## 7. Cross-cutting definition of done

A remediation is complete only when the relevant criteria below are satisfied:

- **Contracts:** types/schemas and database constraints agree; invalid or unsupported values fail explicitly.
- **Regression:** focused tests reproduce the original failure before the fix and pass after it.
- **Parity:** in-memory and PostgreSQL behavior agree for persistent/domain semantics.
- **Determinism:** identical persisted inputs, method version, and query parameters yield reproducible output.
- **Provenance:** every consequential score or relationship can be traced to the exact evidence and snapshot used.
- **Failure handling:** partial writes roll back; timeouts and budget exhaustion are explicit; errors are visible.
- **Security:** untrusted inputs cannot bypass proxy/rate limits or force unbounded work.
- **Documentation:** README, PLAN, IMPLEMENTATION_PLAN, AGENTS, API contracts, and self-hosting docs describe the same shipped behavior.
- **Evidence of verification:** the fixing commit references the test(s) and CI/integration result; do not claim a live database or production validation if it was not run.

## 8. Audit limitations and evidence discipline

This is a static review of the repository at the baseline commit named in the header. The review used code, schemas, migrations, docs, synthetic evaluation output, and the latest CI status observed at that point. It did not execute tests locally, deploy the service, run live ingestion, or validate against a live PostgreSQL database. File paths and observations must be rechecked against the current branch before editing because the repository is actively changing.

This document intentionally distinguishes **observed implementation**, **reported test results**, and **hypotheses to verify**. Preserve that distinction in PR descriptions, commit messages, README claims, and user-facing product copy.
