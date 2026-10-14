# apps/api

## Purpose

Hono HTTP boundary exposing credibility scoring, graph traversal, evidence extraction, RSS
ingestion, and persistence mappings. It adapts pure packages and canonical migrations to
HTTP clients. Tests read no network; adapters run against recorded feed fixtures.

## Ownership

- HTTP routes and request validation (Zod coercion at the boundary)
- Demo maritime and claim seeds
- Source adapters and idempotent feed ingestion
- Repository interfaces plus in-memory and PostgreSQL mappings
- Process entrypoint and environment configuration

## Local contracts

- Pure packages (`packages/*`) stay I/O-free; this app may perform I/O
- Date fields cross HTTP as strings and must be coerced at the boundary
- No scoring logic may live here beyond dispatching to `packages/credibility` and `packages/graph`
- RSS ingestion is idempotent per canonical link; a repeated feed item must not create a second source
- PostgreSQL repositories map the canonical migration schema; no schema drift is allowed in this app

## Work guidance

- Keep routes thin: validate, call package, return JSON
- New data sources require recorded fixtures and a no-network test
- Keep persistence checks against a fake SQL client unless a local database service exists

## Verification

- `pnpm --filter @arcstar/api test`
- `pnpm --filter @arcstar/api typecheck`
- `pnpm --filter @arcstar/api lint`

## Child DOX index

None.
