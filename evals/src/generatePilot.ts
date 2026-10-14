import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = new Date("2026-01-01T00:00:00Z").toISOString();

interface Source { id: string; publisher: string; tier: number; publishedAt: string; citesSourceIds: string[]; primaryEvidence?: string; }
interface Claim { id: string; text: string; subjectNodeId: string; assertedAt: string; supportingSourceIds: string[]; contradictingSourceIds: string[]; extractionConfidence: number; }
interface Contradicting { claimId: string; score: number; reason: string; }
interface Record { id: string; label: "true" | "false" | "ambiguous"; claim: Claim; allSources: Source[]; contradictingClaims: Contradicting[]; notes: string; }

const records: Record[] = [];

function src(id: string, tier: number, cites: string[] = [], evidence?: string): Source {
  return { id, publisher: `publisher-${id}`, tier, publishedAt: base, citesSourceIds: cites, primaryEvidence: evidence };
}

function claim(id: string, supports: string[], contra: string[], conf: number): Claim {
  const text = `Transit claim ${id}`;
  return { id, text: text, subjectNodeId: "hormuz", assertedAt: base, supportingSourceIds: supports, contradictingSourceIds: contra, extractionConfidence: conf };
}

for (let i = 0; i < 12; i++) {
  const root = src(`t-root-${i}`, 1, [], "observed transit data");
  const second = src(`t-wire-${i}`, 1, [], "observed transit data");
  const cascade = src(`t-cascade-${i}`, 4, [root.id]);
  records.push({
    id: `pilot-true-${i}`,
    label: "true",
    claim: claim(`pilot-true-${i}`, [root.id, second.id, cascade.id], [], 0.9),
    allSources: [root, second, cascade],
    contradictingClaims: [],
    notes: "Two independent primary wires plus one cascade. Expected higher score.",
  });
}

for (let i = 0; i < 12; i++) {
  const root = src(`f-root-${i}`, 5, []);
  const cascadeA = src(`f-cascade-a-${i}`, 3, [root.id]);
  const cascadeB = src(`f-cascade-b-${i}`, 4, [root.id]);
  records.push({
    id: `pilot-false-${i}`,
    label: "false",
    claim: claim(`pilot-false-${i}`, [root.id, cascadeA.id, cascadeB.id], [], 0.4),
    allSources: [root, cascadeA, cascadeB],
    contradictingClaims: [{ claimId: `ref-${i}`, score: 0.8, reason: "dataset contradicts transit drop" }],
    notes: "Single anonymous root with two cascades. Expected collapse to one independent source.",
  });
}

for (let i = 0; i < 6; i++) {
  const primary = src(`a-primary-${i}`, 2, [], undefined);
  const secondary = src(`a-secondary-${i}`, 3, [], undefined);
  records.push({
    id: `pilot-ambiguous-${i}`,
    label: "ambiguous",
    claim: claim(`pilot-ambiguous-${i}`, [primary.id, secondary.id], [], 0.6),
    allSources: [primary, secondary],
    contradictingClaims: [{ claimId: `amb-ref-${i}`, score: 0.4, reason: "conflicting readings" }],
    notes: "Mixed sources and contradictory evidence. Not forced into binary classification.",
  });
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "pilot", "pilot.v1.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(records, null, 2) + "\n");
console.warn(`wrote ${records.length} records to ${out}`);
