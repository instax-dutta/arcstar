# apps/web

## Purpose

Vite + React + Sigma.js product surface. Renders the dependency graph, runs blast-radius queries against the API, and displays score explanations.

## Ownership

- Sigma.js graph rendering and interaction
- API client calls
- Product UI only

## Local contracts

- No scoring or propagation logic may live here
- HTTP boundary concerns (CORS, proxies) stay in the app/API layer

## Work guidance

- Keep the graph renderer a thin visualization over API results
- Explainability must stay visible alongside any score

## Verification

- `pnpm --filter @arcstar/web build`
- `pnpm --filter @arcstar/web typecheck`
- `pnpm --filter @arcstar/web lint`

## Child DOX index

None.
