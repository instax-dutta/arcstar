import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaimSchema, SourceSchema } from "@arcstar/contracts";
import { METHOD_VERSION, scoreClaim } from "./score.js";
import type { ContradictingClaim } from "./contradiction.js";

/**
 * Golden score snapshots. Spec: PLAN.md section 4.3.
 *
 * These are hand-written JSON rather than Vitest snapshots on purpose. Vitest's
 * `-u` flag would let a score change be accepted by re-running a command, with
 * nobody writing down why the methodology moved. Here, changing a score means
 * editing a fixture, and every fixture carries a `rationale` explaining what it
 * demonstrates. A silent score change is not possible.
 *
 * Dates are ISO strings in the fixture and revived before scoring.
 *
 * Tolerance is 1e-10: tight enough to catch any real change to the arithmetic,
 * loose enough to ignore float noise in the exponent.
 */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__", "golden");

/**
 * Precision for every score comparison. 10 decimal places is tight enough to
 * catch any real change to the arithmetic and loose enough to ignore float
 * noise inside the saturating exponent.
 */
const PRECISION = 10;

interface GoldenCase {
  name: string;
  rationale: string;
  input: {
    claim: unknown;
    allSources: unknown[];
    contradictingClaims?: ContradictingClaim[];
  };
  expected: {
    score: number;
    base: number;
    independentCount: number;
    collapsedFrom: number;
    contradictionCount: number;
    baseWhy: string;
  };
}

interface GoldenFile {
  methodVersion: string;
  description: string;
  cases: GoldenCase[];
}

function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "publishedAt" || k === "assertedAt" ? new Date(v as string) : reviveDates(v);
    }
    return out;
  }
  return value;
}

const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
const loaded = files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8")) as GoldenFile,
}));

describe("golden score fixtures", () => {
  it("found at least one golden fixture file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(loaded.map((l) => l.file))("%s declares the current method version", (file) => {
    const entry = loaded.find((l) => l.file === file)!;
    expect(entry.data.methodVersion).toBe(METHOD_VERSION);
  });

  for (const { file, data } of loaded) {
    describe(file, () => {
      for (const goldenCase of data.cases) {
        it(`holds: ${goldenCase.name}`, () => {
          // The fixture itself must satisfy the wire contract, otherwise a
          // malformed fixture would "pass" by producing an error score.
          const claim = ClaimSchema.parse(reviveDates(goldenCase.input.claim));
          const allSources = goldenCase.input.allSources.map((s) =>
            SourceSchema.parse(reviveDates(s)),
          );

          const { score, explanation } = scoreClaim({
            claim,
            allSources,
            contradictingClaims: goldenCase.input.contradictingClaims ?? [],
          });

          expect(score.methodVersion).toBe(METHOD_VERSION);
          expect(score.value).toBeCloseTo(goldenCase.expected.score, PRECISION);
          expect(explanation.finalScore).toBeCloseTo(goldenCase.expected.score, PRECISION);
          expect(explanation.base).toBeCloseTo(goldenCase.expected.base, PRECISION);
          expect(explanation.independentSources).toHaveLength(goldenCase.expected.independentCount);
          expect(explanation.collapsedFrom).toBe(goldenCase.expected.collapsedFrom);
          expect(explanation.contradiction).toHaveLength(goldenCase.expected.contradictionCount);
          expect(explanation.baseWhy).toBe(goldenCase.expected.baseWhy);
        });
      }
    });
  }

  it("every golden case carries a non-empty rationale", () => {
    for (const { data } of loaded) {
      for (const goldenCase of data.cases) {
        expect(goldenCase.rationale.length).toBeGreaterThan(0);
        expect(goldenCase.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("golden case names are unique across all fixture files", () => {
    const names = loaded.flatMap((l) => l.data.cases.map((c) => c.name));
    expect(new Set(names).size).toBe(names.length);
  });
});
