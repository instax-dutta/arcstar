import { createHash } from "node:crypto";
import {
  AssessmentSchema,
  type Assessment,
  type AssessmentInputSnapshot,
  type Claim,
  type ClaimEvidence,
  type Source,
} from "@arcstar/contracts";
import { scoreClaim, type ScoreResult } from "@arcstar/credibility";

export type ContradictingClaimInput = NonNullable<AssessmentInputSnapshot["contradictingClaims"]>[number];

export function snapshotRef(snapshot: AssessmentInputSnapshot): string {
  const canonical = JSON.stringify(snapshot, (_key, value) => (value instanceof Date ? value.toISOString() : value));
  return `snapshot-${createHash("sha256").update(canonical).digest("hex")}`;
}

export function assessmentId(assessment: Assessment): string {
  const canonical = JSON.stringify(
    [assessment.inputSnapshotRef, assessment.score.methodVersion, assessment.assessedAt.toISOString()],
  );
  return `assessment-${createHash("sha256").update(canonical).digest("hex").slice(0, 40)}`;
}

export function assessClaim(input: {
  claim: Claim;
  allSources: readonly Source[];
  contradictingClaims?: readonly ContradictingClaimInput[];
  assessedAt?: Date;
}): Assessment {
  const snapshot: AssessmentInputSnapshot = {
    claim: input.claim,
    allSources: [...input.allSources],
    contradictingClaims: [...(input.contradictingClaims ?? [])],
  };
  const result: ScoreResult = scoreClaim({
    claim: input.claim,
    allSources: snapshot.allSources,
    contradictingClaims: snapshot.contradictingClaims,
  });
  return AssessmentSchema.parse({
    claimId: input.claim.id,
    score: result.score,
    explanation: result.explanation,
    assessedAt: input.assessedAt ?? new Date(),
    inputSnapshotRef: snapshotRef(snapshot),
    inputSnapshot: snapshot,
  });
}

/**
 * Resolve reviewed contradictory evidence into scoring inputs. A contradictory
 * evidence row is scored as its own source-backed counter-claim so the main claim
 * receives the same deterministic treatment.
 */
export function contradictingClaimsFromEvidence(
  claim: Claim,
  allSources: readonly Source[],
  evidence: readonly ClaimEvidence[],
): ContradictingClaimInput[] {
  const sourcesById = new Map(allSources.map((source) => [source.id, source]));
  const seenReasons = new Set<string>();
  const result: ContradictingClaimInput[] = [];

  for (const item of evidence) {
    if (item.claimId !== claim.id || item.stance !== "contradicts") continue;
    const source = sourcesById.get(item.sourceId);
    if (!source) {
      throw new Error(`contradictory evidence references unknown source ${item.sourceId}`);
    }

    const reason = item.passage ?? `contradictory evidence from ${item.sourceId}`;
    if (seenReasons.has(reason)) continue;
    seenReasons.add(reason);

    const counterClaim: Claim = {
      id: `contradiction:${claim.id}:${item.sourceId}:${result.length}`,
      text: `Contradictory evidence from ${source.publisher}`,
      subjectNodeId: claim.subjectNodeId,
      assertedAt: claim.assertedAt,
      supportingSourceIds: [source.id],
      contradictingSourceIds: [],
      extractionConfidence: 1,
    };
    const counterScore = scoreClaim({ claim: counterClaim, allSources }).score.value;
    result.push({ claimId: counterClaim.id, score: counterScore, reason });
  }

  return result;
}
