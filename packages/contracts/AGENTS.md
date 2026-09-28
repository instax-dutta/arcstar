# @arcstar/contracts

## Purpose

Zod schemas and inferred types shared by the credibility engine, the graph engine, the API,
and the web app. One definition of a `Claim`, `Source`, `Node`, or `Edge`, validated at
every boundary.

## Ownership

- Owns the wire and domain type definitions.
- Owns `MAX_SCORE` (1.35), the documented ceiling of the credibility score.
- Does not own any scoring logic, graph algorithms, or I/O.

## Local Contracts

- Changing a schema here is a breaking change for the engine, the API, and the web app
  simultaneously. No schema change ships without updating all consumers in the same commit.
- `Source.citesSourceIds` drives cascade detection. A source may not cite itself; this is
  enforced in `SourceSchema`, not trusted from callers.
- A claim may not list the same source as both supporting and contradicting.
- `Score.methodVersion` is mandatory and non-empty. A score without a method version is not
  auditable and must not be constructible.
- `Edge` is as-of dated and may not be a self-loop.
- `SourceTier` accepts integers 1-5 only. A fractional tier is invalid by design, not a
  rounding concern.
- Zod 4 is a dependency. Do not add other validation libraries here.

## Work Guidance

- Schemas are the single source of truth. If a type is needed in two packages, it belongs
  here rather than being duplicated.
- Prefer refining an existing schema over adding a parallel one. Two schemas for one concept
  guarantees drift.
- Derive TypeScript types from schemas with `z.infer`; never hand-write a type that a schema
  already produces.
- Semantic validation that needs cross-field knowledge (for example, a source citing itself)
  belongs in `superRefine`, not in the caller.

## Verification

- `pnpm --filter @arcstar/contracts test` - 18 example tests, 100% coverage gate on
  statements, branches, functions, and lines.
- `pnpm --filter @arcstar/contracts typecheck` and `pnpm --filter @arcstar/contracts lint`
  both run in CI and are required to pass.

## Child DOX Index

None. This package is a leaf.
