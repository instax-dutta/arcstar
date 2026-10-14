import { z } from "zod";

/**
 * Wire contracts shared by the engine, the API, and the web app.
 *
 * Changing a schema here is a breaking change across all three consumers. The
 * credibility engine depends on these types being total: a `Claim` that fails
 * `ClaimSchema` must never reach the scoring path.
 *
 * Spec: PLAN.md sections 3.1, 3.5 and 5.
 */

/** Upper bound on the credibility score. See PLAN.md section 3.2. */
export const MAX_SCORE = 1.35;

/** 1 = primary/wire, 5 = anonymous social. Non-integers are invalid by design. */
export const SourceTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const NonEmptyString = z.string().trim().min(1, "must not be empty");

export const SourceSchema = z
  .object({
    id: NonEmptyString,
    publisher: NonEmptyString,
    tier: SourceTierSchema,
    publishedAt: z.date(),
    /**
     * Provenance chain. Drives cascade detection, which is the core innovation.
     * A source may not cite itself.
     */
    citesSourceIds: z.array(NonEmptyString),
    primaryEvidence: NonEmptyString.optional(),
  })
  .superRefine((source, ctx) => {
    if (source.citesSourceIds.includes(source.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["citesSourceIds"],
        message: "a source may not cite itself",
      });
    }
  });

export const ClaimSchema = z
  .object({
    id: NonEmptyString,
    text: NonEmptyString,
    /** Graph node this claim is about. */
    subjectNodeId: NonEmptyString,
    assertedAt: z.date(),
    supportingSourceIds: z.array(NonEmptyString),
    contradictingSourceIds: z.array(NonEmptyString),
    /** How sure we are that the claim was parsed correctly, 0..1. A scored gate. */
    extractionConfidence: z.number().min(0).max(1),
  })
  .superRefine((claim, ctx) => {
    const contradictions = new Set(claim.contradictingSourceIds);
    const overlap = claim.supportingSourceIds.filter((id) => contradictions.has(id));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["contradictingSourceIds"],
        message: `source(s) cannot both support and contradict the same claim: ${overlap.join(", ")}`,
      });
    }
  });

/**
 * A score is meaningless without the method version that produced it. Scores must
 * stay reproducible forever, so the version is part of the value, not metadata.
 */
export const ScoreSchema = z.object({
  value: z.number().min(0).max(MAX_SCORE),
  methodVersion: NonEmptyString,
});

export const NodeTypeSchema = z.enum([
  "country",
  "company",
  "chokepoint",
  "commodity",
  "infrastructure",
  "org",
]);

export const NodeSchema = z.object({
  id: NonEmptyString,
  type: NodeTypeSchema,
  label: NonEmptyString,
  props: z.record(z.string(), z.unknown()),
});

export const RelationTypeSchema = z.enum([
  "depends_on",
  "supplies",
  "transits_through",
  "sanctions",
  "owns",
  "located_in",
  "produces",
  "consumes",
]);

export const EdgeSchema = z
  .object({
    from: NonEmptyString,
    to: NonEmptyString,
    relation: RelationTypeSchema,
    /** Strength of the dependency, 0..1. */
    weight: z.number().min(0).max(1),
    /** Edges are as-of dated so we can ask "what depended on this, and when". */
    asOf: z.date(),
  })
  .superRefine((edge, ctx) => {
    if (edge.from === edge.to) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "self-loops are not allowed",
      });
    }
  });

/** One corroborating source that survived cascade collapsing, with its contribution. */
export const IndependentSourceSchema = z.object({
  sourceId: NonEmptyString,
  publisher: NonEmptyString,
  tier: SourceTierSchema,
  /** How many raw sources collapsed into this one independent root. */
  collapsedFrom: z.number().int().min(1),
});

export const ContradictionEntrySchema = z.object({
  claimId: NonEmptyString,
  score: z.number().min(0).max(MAX_SCORE),
  reason: NonEmptyString,
});

/**
 * PLAN.md section 3.5: every score ships with its full derivation. Not optional.
 * A score that cannot be explained is not shipped.
 */
export const ScoreExplanationSchema = z.object({
  base: z.number().min(0).max(1),
  baseWhy: NonEmptyString,
  independentSources: z.array(IndependentSourceSchema),
  /** Raw corroborating count before cascade collapsing. */
  collapsedFrom: z.number().int().min(0),
  contradiction: z.array(ContradictionEntrySchema),
  finalScore: z.number().min(0).max(MAX_SCORE),
  methodVersion: NonEmptyString,
});

/**
 * A persisted assessment: the score for one claim plus the derivation that produced it.
 * Assessments are append-only in storage; this record is the unit that is written back.
 */
export const AssessmentSchema = z.object({
  claimId: NonEmptyString,
  score: ScoreSchema,
  explanation: ScoreExplanationSchema,
  assessedAt: z.date(),
});

export type SourceTier = z.infer<typeof SourceTierSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Score = z.infer<typeof ScoreSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type NodeType = z.infer<typeof NodeTypeSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type IndependentSource = z.infer<typeof IndependentSourceSchema>;
export type ContradictionEntry = z.infer<typeof ContradictionEntrySchema>;
export type ScoreExplanation = z.infer<typeof ScoreExplanationSchema>;

export const ClaimStanceSchema = z.enum(["supports", "contradicts", "qualifies", "mentions"]);

export const ClaimEvidenceSchema = z
  .object({
    claimId: NonEmptyString,
    sourceId: NonEmptyString,
    stance: ClaimStanceSchema,
    passage: NonEmptyString.optional(),
    passageStart: z.number().int().min(0).optional(),
    passageEnd: z.number().int().min(0).optional(),
    methodVersion: NonEmptyString.optional(),
    status: z.enum(["resolved", "unresolved", "disputed"]).default("unresolved"),
  })
  .superRefine((evidence, ctx) => {
    if (evidence.passageStart !== undefined && evidence.passageEnd !== undefined && evidence.passageEnd < evidence.passageStart) {
      ctx.addIssue({ code: "custom", path: ["passageEnd"], message: "passageEnd must be >= passageStart" });
    }
  });

export const SourceLineageKindSchema = z.enum(["cites", "syndicates", "quotes", "shared_release", "inferred", "unknown"]);

export const SourceLineageSchema = z.object({
  fromSourceId: NonEmptyString,
  toSourceId: NonEmptyString,
  kind: SourceLineageKindSchema,
  status: z.enum(["observed", "verified", "disputed", "unknown"]),
  evidence: NonEmptyString.optional(),
});

export type ClaimStance = z.infer<typeof ClaimStanceSchema>;
export type ClaimEvidence = z.infer<typeof ClaimEvidenceSchema>;
export type SourceLineageKind = z.infer<typeof SourceLineageKindSchema>;
export type SourceLineage = z.infer<typeof SourceLineageSchema>;
