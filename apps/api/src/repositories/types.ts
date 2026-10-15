import type { Assessment, Claim, ClaimEvidence, Edge, Node, Source, SourceLineageGap } from "@arcstar/contracts";

export interface SourceRepository {
  upsert(source: Source): Promise<void>;
  get(id: string): Promise<Source | undefined>;
  list(): Promise<Source[]>;
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
  sources: SourceRepository & SourceLineageGapRepository;
  entities: EntityRepository;
  claims: ClaimRepository;
  claimEvidence: ClaimEvidenceRepository;
  edges: EdgeRepository;
  assessments: AssessmentRepository;
};
