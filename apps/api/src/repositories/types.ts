import type { Assessment, Claim, ClaimEvidence, ClaimEvidenceReview, Edge, Node, Source, SourceLineage, SourceLineageGap } from "@arcstar/contracts";

export interface SourceRepository {
  upsert(source: Source): Promise<void>;
  get(id: string): Promise<Source | undefined>;
  list(): Promise<Source[]>;
}

export interface SourceLineageRepository {
  listLineage(sourceId: string): Promise<SourceLineage[]>;
}

export interface SourceLineageGapRepository {
  listLineageGaps(sourceId: string): Promise<SourceLineageGap[]>;
}

export interface EntityRepository {
  upsert(entity: Node): Promise<void>;
  get(id: string): Promise<Node | undefined>;
  list(): Promise<Node[]>;
}

export interface ClaimRepository {
  upsert(claim: Claim): Promise<void>;
  get(id: string): Promise<Claim | undefined>;
  listBySubject(entityId: string): Promise<Claim[]>;
}

export interface ClaimEvidenceRepository {
  upsert(evidence: ClaimEvidence): Promise<void>;
  list(claimId: string): Promise<ClaimEvidence[]>;
  upsertMany(evidence: readonly ClaimEvidence[]): Promise<void>;
  listReviews(claimId: string): Promise<ClaimEvidenceReview[]>;
  applyReview(review: ClaimEvidenceReview): Promise<ClaimEvidenceReview[]>;
}

export interface EdgeRepository {
  upsert(edge: Edge): Promise<void>;
  list(): Promise<Edge[]>;
  listAsOf(date: Date): Promise<Edge[]>;
}

export interface AssessmentRepository {
  append(assessment: Assessment): Promise<void>;
  getLatest(claimId: string): Promise<Assessment | undefined>;
  list(claimId: string): Promise<Assessment[]>;
}

export type Repositories = {
  sources: SourceRepository & SourceLineageRepository & SourceLineageGapRepository;
  entities: EntityRepository;
  claims: ClaimRepository;
  claimEvidence: ClaimEvidenceRepository;
  edges: EdgeRepository;
  assessments: AssessmentRepository;
};
