import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ClaimSchema, SourceSchema } from "@arcstar/contracts";
import type { ContradictingClaim } from "@arcstar/credibility";
import { scoreClaim } from "@arcstar/credibility";

interface EvalRecord {
  id: string;
  label: "true" | "false" | "ambiguous";
  claim: unknown;
  allSources: unknown[];
  contradictingClaims?: ContradictingClaim[];
  notes: string;
}

const sourceSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && "publishedAt" in value) {
    const v = value as Record<string, unknown>;
    return { ...v, publishedAt: new Date(v.publishedAt as string) };
  }
  return value;
}, SourceSchema);

const claimSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && "assertedAt" in value) {
    const v = value as Record<string, unknown>;
    return { ...v, assertedAt: new Date(v.assertedAt as string) };
  }
  return value;
}, ClaimSchema);

const recordSchema = z.object({
  id: z.string(),
  label: z.enum(["true", "false", "ambiguous"]),
  claim: claimSchema,
  allSources: z.array(sourceSchema),
  contradictingClaims: z.array(z.object({ claimId: z.string(), score: z.number(), reason: z.string() })).optional(),
  notes: z.string(),
});

function aucTrueFalse(rows: { label: string; score: number }[]): number {
  const positives = rows.filter((r) => r.label === "true");
  const negatives = rows.filter((r) => r.label === "false");
  if (positives.length === 0 || negatives.length === 0) return Number.NaN;
  const ranked = [...rows].sort((a, b) => a.score - b.score);
  const ranks = new Map<number, number>();
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1]!.score === ranked[i]!.score) j += 1;
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks.set(k, avg);
    i = j + 1;
  }
  let sumPos = 0;
  let posIndex = 0;
  for (let r = 0; r < ranked.length; r++) {
    if (ranked[r]!.label === "true") sumPos += ranks.get(r)!;
  }
  void posIndex;
  const u = sumPos - (positives.length * (positives.length + 1)) / 2;
  return u / (positives.length * negatives.length);
}

const filePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "evals", "pilot", "pilot.v1.json");
const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
const records = z.array(recordSchema).parse(raw);

const rows = records.map((record) => {
  const result = scoreClaim({
    claim: record.claim,
    allSources: record.allSources,
    contradictingClaims: record.contradictingClaims ?? [],
  });
  return {
    id: record.id,
    label: record.label,
    score: result.score.value,
    independentSources: result.explanation.independentSources.length,
  };
});

const binaryRows = rows.filter((r) => r.label === "true" || r.label === "false");
const auc = aucTrueFalse(binaryRows);
const mean = (label: string) => {
  const subset = rows.filter((r) => r.label === label);
  return subset.reduce((acc, r) => acc + r.score, 0) / subset.length;
};

// A claim that collapses to one independent source despite multiple raw supports.
const collapsedCorrect = rows.filter((r) => {
  const rawSupportCount = records.find((x) => x.id === r.id)!.claim.supportingSourceIds.length;
  return rawSupportCount > r.independentSources && r.independentSources === 1;
}).length;

const report = {
  methodVersion: "credibility@1.0.0",
  pilotVersion: "pilot.v1",
  recordCount: records.length,
  countsByLabel: {
    true: records.filter((r) => r.label === "true").length,
    false: records.filter((r) => r.label === "false").length,
    ambiguous: records.filter((r) => r.label === "ambiguous").length,
  },
  meanScoreByLabel: {
    true: mean("true"),
    false: mean("false"),
    ambiguous: mean("ambiguous"),
  },
  separationTrueMinusFalse: mean("true") - mean("false"),
  aucBinary: auc,
  collapseObservationCount: collapsedCorrect,
  scoreTargetAuc: 0.8,
  separationTarget: 0.25,
  notes: "Pilot only. It is a smoke benchmark, not evidence of real-world discrimination.",
};

const reportDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "evals", "reports");
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "pilot.v1.json"), JSON.stringify(report, null, 2) + "\n");

console.log(JSON.stringify(report, null, 2));
