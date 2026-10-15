# Gates: persisted investigation workflow

OWNS: packages/contracts/**, apps/api/**, migrations/**, scripts/**, docs/self-hosting.md, README.md, AGENTS.md, GATES.md

Scope: build a persisted claim-evidence-assessment workflow, explicit source lineage gaps, reproducible snapshots, wired repositories, server-owned scenarios, bounded rate limiting, and cleanup.

- [ ] G1: claim evidence persists and reviews independently of claim upserts
  CHECK: node scripts/verify-claim-evidence.mjs
  EXPECT: claim evidence verification passed
  EVIDENCE: pending

- [ ] G2: assessments store and restore their exact input snapshot
  CHECK: node scripts/verify-assessment-snapshot.mjs
  EXPECT: assessment snapshot verification passed
  EVIDENCE: pending

- [ ] G3: unresolvable source lineage becomes an explicit gap record
  CHECK: node scripts/verify-source-lineage-gaps.mjs
  EXPECT: source lineage gap verification passed
  EVIDENCE: pending

- [ ] G4: the API wires persisted repositories when DATABASE_URL is set
  CHECK: node scripts/verify-database-wiring.mjs
  EXPECT: database wiring verification passed
  EVIDENCE: pending

- [ ] G5: scenario queries use a server-owned graph snapshot
  CHECK: node scripts/verify-scenario-snapshot.mjs
  EXPECT: scenario snapshot verification passed
  EVIDENCE: pending

- [ ] G6: expensive endpoints enforce a bounded request rate limit
  CHECK: node scripts/verify-rate-limit.mjs
  EXPECT: rate limit verification passed
  EVIDENCE: pending

- [ ] G7: unused local scripts and stale documentation are removed
  CHECK: node scripts/verify-cleanup.mjs
  EXPECT: cleanup verification passed
  EVIDENCE: pending

- [ ] G8: full repository checks, API behavior, and benchmark smoke run pass
  CHECK: node scripts/verify-full-check.mjs
  EXPECT: full check verification passed
  EVIDENCE: pending
