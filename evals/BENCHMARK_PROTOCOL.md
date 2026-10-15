# Arcstar Real Benchmark Annotation and Evaluation Protocol

**Status:** protocol defined; adjudicated corpus not yet collected.  
**Audience:** labelers, reviewers, reproducibility reviewers.  
**Boundary:** `evals/pilot` is a synthetic smoke fixture. It is not real-world evidence. The real benchmark lives at `evals/real/benchmark.v1.json` and is absent until an adjudicated corpus is collected.

## 1. Claim unit

A benchmark record must describe one atomic, checkable proposition. It must not bundle multiple events, multiple locations, and multiple outcomes into one claim. Opinions, forecasts, and ambiguous compound claims belong in `ambiguous` or `unscorable`, never forced into a binary label.

Each record requires:

- Stable `id`.
- `claim`: the exact atomic proposition scored by the credibility method.
- `label`: `true`, `false`, `ambiguous`, or `unscorable`.
- `split`: `development` or `heldout`.
- `eventId`: the real-world event or linked event family.
- `sourceFamily`: publisher/syndication family or shared upstream origin.
- `allSources`: full source graph used by the scorer.
- `contradictingClaims`: pre-scored contradicting claims, where relevant.
- `cascadeExpected`: whether the record is deliberately a same-origin cascade.
- `notes`: review rationale and unresolved issues.

## 2. Annotation and adjudication

1. Prefer primary evidence and multiple independent, high-quality references.
2. A single fact-check publisher result is not automatic perfect truth. Record disagreement.
3. Record label rationale, source references, dates, adjudicator reasoning, and disagreement.
4. Ambiguous or unscorable records stay non-binary and are reported separately.
5. An adjudicated corpus is not complete unless records carry provenance and an agreed label protocol version.

## 3. Leakage controls

Related material must not cross the development/held-out boundary.

- No `eventId` may appear in both splits.
- No `sourceFamily` may appear in both splits.
- No identical claim text may appear in both splits.
- Near-duplicates and syndicated variants must stay together in the same split.

## 4. Published gate

The real runner currently enforces all of the following on the held-out split:

- At least 20 adjudicated binary records.
- AUC >= 0.80.
- Mean supported-true score minus mean refuted-false score >= 0.25.
- Precision at score threshold 0.70 >= 0.70.
- Recall is defined and reported.
- Cascade-collapse accuracy >= 0.90 on records with a declared cascade expectation.
- No leakage failures.
- The real benchmark report records dataset version, label protocol version, method version, criteria, metrics, and failures.

If any required metric is missing or any criterion fails, the real benchmark is not pass. Synthetic pilot output cannot make this gate pass.

## 5. Required handoff

The remaining work is product ownership: build and adjudicate a genuinely sourced corpus with stable source references, retrieval/publication dates where available, and reviewer disagreement records. Until that corpus exists, the real benchmark remains **not yet evaluable** and Arcstar cannot claim real-world benchmark validation.
