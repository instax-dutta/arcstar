# @arcstar/extraction

## Purpose

Pure text-to-evidence helpers: normalization, source span tracking, sentence and claim
candidate extraction, and entity span matching. No I/O and no scoring.

## Ownership

- Text normalization and offset-safe sentence splitting.
- Claim candidate extraction with normalized source spans.
- Entity span extraction from labels and aliases.

## Local Contracts

- Spans refer to the input string. Normalization must not silently change span offsets.
- This package never assigns a credibility score. It produces candidates only.
- Entity extraction is deterministic substring/alias matching, not semantic resolution.

## Work Guidance

- Keep every function pure and total on string inputs.
- Record sentence and claim spans relative to the original input.

## Verification

- `pnpm --filter @arcstar/extraction test`
- `pnpm --filter @arcstar/extraction typecheck`
- `pnpm --filter @arcstar/extraction lint`

## Child DOX Index

None. This package is a leaf.
