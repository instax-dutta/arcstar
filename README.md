# Arcstar

Open-source geopolitical intelligence: credibility scoring as infrastructure, dependency graph as the interface.

Arcstar ingests claims from open sources, scores each claim's credibility with transparent deterministic arithmetic, links claims to nodes in a dependency graph, and answers:

> If X happens, what breaks, ranked, and how confident are we in each link?

Credibility scores are descriptive, never predictive, and every score ships with its full derivation. Scores are computed by deterministic arithmetic over validated inputs; an LLM is only used for claim extraction and entity linking, never for scoring.

## Status

- Phase 0 (foundations): complete
- Phase 1 (credibility core): complete
- Phase 2 (graph core): complete for blast radius; min-cut deferred
- Phase 3/4 (ingest + API + web MVP): basic API and Sigma.js web app implemented
- Phase 5 (300-claim benchmark, AUC >= 0.80): not yet built

## Monorepo layout

- `packages/contracts` - Zod schemas shared by engine, API, and web
- `packages/credibility` - pure scoring engine: cascade detection, score composition, contradiction handling, explainability
- `packages/graph` - dependency graph traversal, blast radius, as-of dated edges
- `apps/api` - Hono HTTP API (`/health`, `/graph`, `/claim`, `/score`, `/blast-radius`)
- `apps/web` - Vite + React + Sigma.js graph product surface
- `scripts/check-purity.mjs` - purity gate for the credibility engine

## Getting started

Requires Node 22+ and pnpm 11.9.0.

```bash
pnpm install
pnpm build
```

Run all checks:

```bash
pnpm check
```

Run individual checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm purity
```

Start the API:

```bash
pnpm --filter @arcstar/api dev
```

Start the web app:

```bash
pnpm --filter @arcstar/web dev
```

The web dev server proxies `/api` to `http://localhost:8787`.

## Key design references

- `PLAN.md` - governing build plan, methodology, invariants, and phase gates
- `packages/credibility/AGENTS.md` - credibility package contract and the ten invariants
- `packages/graph/AGENTS.md` - graph contract and `PROPAGATION` table
- `AGENTS.md` - project DOX contract and package index

## License

AGPL-3.0.
