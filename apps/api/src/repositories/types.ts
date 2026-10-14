import type { Assessment, Claim, Edge, Node, Source } from "@arcstar/contracts";

export interface SourceRepository {
  upsert(source: Source): Promise<void>;
  get(id: string): Promise<Source | undefined>;
  list(): Promise<Source[]>;
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
  sources: SourceRepository;
  entities: EntityRepository;
  claims: ClaimRepository;
  edges: EdgeRepository;
  assessments: AssessmentRepository;
};
