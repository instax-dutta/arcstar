# apps/api

## Purpose

Hono HTTP boundary exposing credibility scoring, graph traversal, and demo data. Adapter layer between pure packages and clients. Reads no network in tests; uses recorded demo fixtures.

## Ownership

- HTTP routes and request validation (Zod coercion at the boundary)
- Demo graph/claim seeds
- Process entrypoint

## Local contracts

- Pure packages (`packages/*`) stay I/O-free; this app may perform I/O
- Date fields cross HTTP as strings and must be coerced at the boundary
- No scoring logic may live here beyond dispatching to `packages/credibility` and `packages/graph`

## Work guidance

- Keep routes thin: validate, call package, return JSON
- New data sources require recorded fixtures and a no-network test

## Verification

- `pnpm --filter @arcstar/api test`
- `pnpm --filter @arcstar/api typecheck`
- `pnpm --filter @arcstar/api lint`

## Child DOX index

None.
