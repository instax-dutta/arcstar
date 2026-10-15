import { createHash } from "node:crypto";
import { AssessmentSchema, type Assessment, type AssessmentInputSnapshot, type Claim, type Source } from "@arcstar/contracts";
import { scoreClaim, type ScoreResult } from "@arcstar/credibility";

export type ContradictingClaimInput = NonNullable<AssessmentInputSnapshot["contradictingClaims"]>[number];

export function snapshotRef(snapshot: AssessmentInputSnapshot): string {
  const canonical = JSON.stringify(snapshot, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  });
  return `snapshot-${createHash("sha256").update(canonical).digest("hex")}`;
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
