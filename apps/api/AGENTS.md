# apps/api

## Purpose

Hono HTTP boundary exposing deterministic scoring, server-owned graph scenarios, persisted
claim/evidence/assessment investigations, evidence extraction, RSS ingestion, and persistence
mappings. Tests read no network; adapters run against recorded feed fixtures.

## Ownership

- HTTP routes and request validation (Zod coercion at the boundary)
- Demo maritime and claim seeds
- Source adapters and idempotent feed ingestion
- Repository interfaces plus in-memory, PostgreSQL, and input-snapshot mappings
- Source lineage gap records and assessment reproducibility
- Data-layer selection from environment configuration
- Bounded single-process rate limiting
- Process entrypoint and environment configuration

## Local contracts

- Pure packages (`packages/*`) stay I/O-free; this app may perform I/O
- Date fields cross HTTP as strings and must be coerced at the boundary; invalid dates must fail validation
- No scoring logic may live here beyond dispatching to `packages/credibility` and `packages/graph`
- RSS ingestion is idempotent per canonical link; a repeated feed item must not create a second source
- PostgreSQL repositories map the canonical migration schema; no schema drift is allowed in this app
- Every stored assessment stores its exact input snapshot and a snapshot reference
- Unresolved source lineage is stored as an explicit gap, never as proof of independence
- Scenario routes read server-owned snapshots and never treat a client-supplied graph as authoritative product data
- Single-process rate limiting is bounded; multi-process deployments require shared or proxy-level limiting

## Work guidance

- Keep routes thin: validate, call package or repository, return JSON
- New data sources require recorded fixtures and a no-network test
- Keep persistence checks against a fake SQL client unless a local database service exists
- Run the persisted workflow tests after repository or contract changes

## Verification

- `pnpm --filter @arcstar/api test`
- `pnpm --filter @arcstar/api typecheck`
- `pnpm --filter @arcstar/api lint`
- `node scripts/verify-claim-evidence.mjs`
- `node scripts/verify-assessment-snapshot.mjs`
- `node scripts/verify-scenario-snapshot.mjs`

## Child DOX index

None.
