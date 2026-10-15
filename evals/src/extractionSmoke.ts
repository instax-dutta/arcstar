import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { extractClaimCandidates, extractEntitySpans } from "@arcstar/extraction";

const entitySpanSchema = z.object({
  termId: z.string().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
});

const caseSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  expectedCandidateSentences: z.array(z.string()),
  expectedEntitySpans: z.array(entitySpanSchema),
  terms: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), aliases: z.array(z.string()).optional() })),
  notes: z.string(),
});

const datasetSchema = z.object({
  version: z.string().min(1),
  description: z.string(),
  cases: z.array(caseSchema).min(1),
});

const dataPath = join(dirname(fileURLToPath(import.meta.url)), "..", "extraction-smoke.v1.json");
const reportPath = join(dirname(fileURLToPath(import.meta.url)), "..", "reports", "extraction.smoke.v1.json");

if (!existsSync(dataPath)) {
  console.warn("extraction smoke dataset is missing");
  process.exit(1);
}

const dataset = datasetSchema.parse(JSON.parse(readFileSync(dataPath, "utf8")) as unknown);

const results = dataset.cases.map((testCase) => {
  const candidates = extractClaimCandidates(testCase.text);
  const entitySpans = extractEntitySpans(testCase.text, testCase.terms);

  const candidateTruePositives = candidates.filter((candidate) =>
    testCase.expectedCandidateSentences.includes(candidate.sentence),
  ).length;
  const candidateFalsePositives = candidates.length - candidateTruePositives;
  const candidatePrecision = candidates.length === 0 ? 1 : candidateTruePositives / candidates.length;
  const candidateRecall =
    testCase.expectedCandidateSentences.length === 0
      ? 1
      : candidateTruePositives / testCase.expectedCandidateSentences.length;

  const entityMatches = entitySpans.filter((span) =>
    testCase.expectedEntitySpans.some(
      (expected) => expected.termId === span.termId && expected.start === span.start && expected.end === span.end,
    ),
  );
  const entityFalsePositives = entitySpans.length - entityMatches.length;

  return {
    id: testCase.id,
    candidatePrecision,
    candidateRecall,
    candidateFalsePositives,
    candidateFalseNegatives: testCase.expectedCandidateSentences.length - candidateTruePositives,
    entityPrecision: entitySpans.length === 0 ? 1 : entityMatches.length / entitySpans.length,
    entityRecall:
      testCase.expectedEntitySpans.length === 0 ? 1 : entityMatches.length / testCase.expectedEntitySpans.length,
    entityFalsePositives,
    entityFalseNegatives: testCase.expectedEntitySpans.length - entityMatches.length,
  };
});

const metrics = {
  candidatePrecision: results.reduce((sum, result) => sum + result.candidatePrecision, 0) / results.length,
  candidateRecall: results.reduce((sum, result) => sum + result.candidateRecall, 0) / results.length,
  entityPrecision: results.reduce((sum, result) => sum + result.entityPrecision, 0) / results.length,
  entityRecall: results.reduce((sum, result) => sum + result.entityRecall, 0) / results.length,
};

const passed =
  metrics.candidatePrecision === 1 &&
  metrics.candidateRecall === 1 &&
  metrics.entityPrecision === 1 &&
  metrics.entityRecall === 1;

const report = {
  status: passed ? "passed" : "failed",
  kind: "synthetic-smoke",
  version: dataset.version,
  caseCount: dataset.cases.length,
  metrics,
  results,
  notes: "Hand-authored smoke labels only. This is not real-world extraction quality evidence.",
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.warn(JSON.stringify(report, null, 2));

if (!passed) process.exitCode = 1;
