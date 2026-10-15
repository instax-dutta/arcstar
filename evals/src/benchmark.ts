import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ClaimSchema, SourceSchema } from "@arcstar/contracts";
import { scoreClaim } from "@arcstar/credibility";

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
  id: z.string().min(1),
  split: z.enum(["development", "heldout"]),
  eventId: z.string().min(1),
  sourceFamily: z.string().min(1),
  label: z.enum(["true", "false", "ambiguous", "unscorable"]),
  claim: claimSchema,
  allSources: z.array(sourceSchema),
  contradictingClaims: z.array(z.object({ claimId: z.string(), score: z.number(), reason: z.string() })).optional(),
  cascadeExpected: z.boolean().optional(),
  notes: z.string(),
});

const datasetSchema = z.object({
  datasetVersion: z.string().min(1),
  labelProtocolVersion: z.string().min(1),
  records: z.array(recordSchema).min(1),
});

const criteria = {
  minBinaryRecords: 20,
  auc: 0.8,
  separation: 0.25,
  precisionAtThreshold: 0.7,
  threshold: 0.7,
  cascadeCollapse: 0.9,
};

function aucTrueFalse(rows: Array<{ label: string; score: number }>): number {
  const positives = rows.filter((row) => row.label === "true");
  const negatives = rows.filter((row) => row.label === "false");
  if (positives.length === 0 || negatives.length === 0) return Number.NaN;
  const ranked = [...rows].sort((a, b) => a.score - b.score);
  const grouped: Array<{ indexes: number[]; score: number }> = [];
  ranked.forEach((row, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last.score === row.score) last.indexes.push(index);
    else grouped.push({ indexes: [index], score: row.score });
  });

  const ranks = new Map<number, number>();
  for (const group of grouped) {
    const average = group.indexes.reduce((sum, index) => sum + index + 1, 0) / group.indexes.length;
    for (const index of group.indexes) ranks.set(index, average);
  }

  const positiveRankSum = ranked.reduce((sum, row, index) => (row.label === "true" ? sum + (ranks.get(index) ?? 0) : sum), 0);
  const u = positiveRankSum - (positives.length * (positives.length + 1)) / 2;
  return u / (positives.length * negatives.length);
}

function leakageFailures(records: Array<z.infer<typeof recordSchema>>): string[] {
  const failures: string[] = [];
  const development = records.filter((record) => record.split === "development");
  const heldout = records.filter((record) => record.split === "heldout");
  if (development.length === 0) failures.push("development split is empty");
  if (heldout.length === 0) failures.push("heldout split is empty");

  const seen = new Set<string>();
  for (const record of [...development, ...heldout]) {
    for (const family of [record.eventId, record.sourceFamily, record.claim.text]) {
      const key = `${family}`;
      if (seen.has(key)) failures.push(`leakage: split shares ${key}`);
      seen.add(key);
    }
  }

  return failures;
}

function main(): void {
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), "..", "real", "benchmark.v1.json");
  const reportPath = join(dirname(fileURLToPath(import.meta.url)), "..", "reports", "benchmark.v1.json");

  if (!existsSync(dataPath)) {
    const report = {
      status: "not-yet-evaluable",
      reason: "adjudicated real benchmark dataset is absent; synthetic pilot cannot satisfy the real gate",
      datasetPath: "evals/real/benchmark.v1.json",
      criteria,
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.warn(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const parsed = datasetSchema.parse(JSON.parse(readFileSync(dataPath, "utf8")) as unknown);
  const heldout = parsed.records.filter((record) => record.split === "heldout");

  const rows = heldout.map((record) => {
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
      rawSupportCount: record.claim.supportingSourceIds.length,
      cascadeExpected: record.cascadeExpected,
    };
  });

  const binaryRows = rows.filter((row) => row.label === "true" || row.label === "false");
  const mean = (label: string) => {
    const subset = rows.filter((row) => row.label === label);
    return subset.length === 0 ? Number.NaN : subset.reduce((sum, row) => sum + row.score, 0) / subset.length;
  };

  const highRows = binaryRows.filter((row) => row.score >= criteria.threshold);
  const highTrue = highRows.filter((row) => row.label === "true").length;
  const precision = highRows.length === 0 ? Number.NaN : highTrue / highRows.length;
  const trueCount = rows.filter((row) => row.label === "true").length;
  const recall = trueCount === 0 ? Number.NaN : highTrue / trueCount;

  const cascadeExpectedRows = rows.filter((row) => row.cascadeExpected !== undefined);
  const cascadeCorrect = cascadeExpectedRows.filter((row) =>
    row.cascadeExpected ? row.independentSources === 1 : row.independentSources > 0,
  ).length;
  const cascadeAccuracy = cascadeExpectedRows.length === 0 ? Number.NaN : cascadeCorrect / cascadeExpectedRows.length;

  const metrics = {
    binaryRecordCount: binaryRows.length,
    aucBinary: aucTrueFalse(binaryRows),
    separationTrueMinusFalse: mean("true") - mean("false"),
    precisionAtThreshold: precision,
    recallAtThreshold: recall,
    cascadeCollapseAccuracy: cascadeAccuracy,
  };

  const failures: string[] = [];
  if (heldout.length === 0) failures.push("heldout split is empty");
  if (binaryRows.length < criteria.minBinaryRecords) failures.push(`heldout binary records below ${criteria.minBinaryRecords}`);
  if (!Number.isFinite(metrics.aucBinary) || metrics.aucBinary < criteria.auc) failures.push("AUC criterion failed");
  if (!Number.isFinite(metrics.separationTrueMinusFalse) || metrics.separationTrueMinusFalse < criteria.separation) failures.push("separation criterion failed");
  if (!Number.isFinite(precision) || precision < criteria.precisionAtThreshold) failures.push("precision criterion failed");
  if (!Number.isFinite(recall)) failures.push("recall is undefined");
  if (!Number.isFinite(cascadeAccuracy) || cascadeAccuracy < criteria.cascadeCollapse) failures.push("cascade criterion failed");
  failures.push(...leakageFailures(parsed.records));

  const passed = failures.length === 0;
  const report = {
    status: passed ? "passed" : "failed",
    datasetVersion: parsed.datasetVersion,
    labelProtocolVersion: parsed.labelProtocolVersion,
    methodVersion: "credibility@1.0.0",
    criteria,
    metrics,
    failures,
    notes: "Real benchmark report. Synthetic pilot output must never be used for this gate.",
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.warn(JSON.stringify(report, null, 2));
  if (!passed) process.exitCode = 1;
}

main();
