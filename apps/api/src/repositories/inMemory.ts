import type { Assessment, Claim, ClaimEvidence, ClaimEvidenceReview, Edge, Node, Source, SourceLineage, SourceLineageGap } from "@arcstar/contracts";
import { resolveEdgesAsOf } from "@arcstar/graph";
import type {
  AssessmentRepository,
  ClaimEvidenceRepository,
  ClaimRepository,
  EdgeRepository,
  EntityRepository,
  Repositories,
  SourceLineageGapRepository,
  SourceLineageRepository,
  SourceRepository,
} from "./types.js";

function compareById(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareEdges(a: Edge, b: Edge): number {
  return (
    (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
    (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) ||
    (a.relation < b.relation ? -1 : a.relation > b.relation ? 1 : 0) ||
    a.asOf.getTime() - b.asOf.getTime() ||
    a.weight - b.weight
  );
}

export class InMemorySourceRepository implements SourceRepository, SourceLineageRepository, SourceLineageGapRepository {
  private readonly items = new Map<string, Source>();
  private readonly gaps = new Map<string, SourceLineageGap[]>();

  async upsert(source: Source): Promise<void> {
    const existing = this.items.get(source.id);
    if (existing) {
      this.items.set(source.id, {
        ...source,
        publisher: existing.publisher,
        lineage: source.lineage ?? existing.lineage,
      });
    } else {
      this.items.set(source.id, { ...source });
    }

    for (const [fromSourceId, gaps] of this.gaps) {
      const stillOpen = gaps.filter((gap) => gap.unresolvedSourceRef !== source.id);
      if (stillOpen.length === 0) this.gaps.delete(fromSourceId);
      else this.gaps.set(fromSourceId, stillOpen);
    }

    const unresolved = source.citesSourceIds.filter((citedId) => !this.items.has(citedId) && citedId !== source.id);
    if (unresolved.length === 0) {
      this.gaps.delete(source.id);
      return;
    }
    this.gaps.set(
      source.id,
      [...new Set(unresolved)].map((unresolvedSourceRef) => ({
        fromSourceId: source.id,
        unresolvedSourceRef,
        status: "unknown" as const,
      })),
    );
  }

  async get(id: string): Promise<Source | undefined> {
    return this.items.get(id);
  }

  async list(): Promise<Source[]> {
    return [...this.items.values()].sort(compareById);
  }

  async listLineage(sourceId: string): Promise<SourceLineage[]> {
    const source = this.items.get(sourceId);
    if (!source) return [];
    return (source.lineage ?? []).map((entry) => ({ ...entry }));
  }

  async listLineageGaps(sourceId: string): Promise<SourceLineageGap[]> {
    return [...(this.gaps.get(sourceId) ?? [])].sort((a, b) =>
      a.unresolvedSourceRef < b.unresolvedSourceRef ? -1 : a.unresolvedSourceRef > b.unresolvedSourceRef ? 1 : 0,
    );
  }
}

export class InMemoryEntityRepository implements EntityRepository {
  private readonly items = new Map<string, Node>();
  async upsert(entity: Node): Promise<void> {
    this.items.set(entity.id, entity);
  }
  async get(id: string): Promise<Node | undefined> {
    return this.items.get(id);
  }
  async list(): Promise<Node[]> {
    return [...this.items.values()].sort(compareById);
  }
}

export class InMemoryClaimRepository implements ClaimRepository {
  private readonly items = new Map<string, Claim>();
  async upsert(claim: Claim): Promise<void> {
    this.items.set(claim.id, claim);
  }
  async get(id: string): Promise<Claim | undefined> {
    return this.items.get(id);
  }
  async listBySubject(entityId: string): Promise<Claim[]> {
    return [...this.items.values()]
      .filter((claim) => claim.subjectNodeId === entityId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}

export class InMemoryClaimEvidenceRepository implements ClaimEvidenceRepository {
  private readonly items = new Map<string, ClaimEvidence[]>();
  private readonly reviews = new Map<string, ClaimEvidenceReview[]>();
  private readonly evidenceKey = (evidence: ClaimEvidence): string =>
    [
      evidence.claimId,
      evidence.sourceId,
      evidence.stance,
      evidence.passage ?? "",
      evidence.passageStart ?? "",
      evidence.passageEnd ?? "",
      evidence.methodVersion ?? "",
    ].join("|");

  async upsert(evidence: ClaimEvidence): Promise<void> {
    await this.upsertMany([evidence]);
  }

  async upsertMany(evidence: readonly ClaimEvidence[]): Promise<void> {
    for (const item of evidence) {
      const list = this.items.get(item.claimId) ?? [];
      const key = this.evidenceKey(item);
      const index = list.findIndex((candidate) => this.evidenceKey(candidate) === key);
      if (index === -1) list.push(item);
      else list[index] = item;
      this.items.set(item.claimId, list);
    }
  }

  async list(claimId: string): Promise<ClaimEvidence[]> {
    return [...(this.items.get(claimId) ?? [])].sort((a, b) =>
      `${a.sourceId}:${a.stance}` < `${b.sourceId}:${b.stance}` ? -1 : 1,
    );
  }

  async listReviews(claimId: string): Promise<ClaimEvidenceReview[]> {
    return [...(this.reviews.get(claimId) ?? [])].sort((a, b) =>
      (a.reviewedAt ?? new Date(0)).getTime() - (b.reviewedAt ?? new Date(0)).getTime(),
    );
  }

  async applyReview(review: ClaimEvidenceReview): Promise<ClaimEvidenceReview[]> {
    const list = this.items.get(review.claimId) ?? [];
    const matches = list.filter((item) => item.sourceId === review.sourceId && item.stance === review.stance);
    if (matches.length === 0) throw new Error("cannot review evidence that does not exist");

    const reviewedAt = review.reviewedAt ?? new Date();
    const fromStatus = matches[0]?.status;
    for (const item of matches) {
      const index = list.findIndex((candidate) => this.evidenceKey(candidate) === this.evidenceKey(item));
      if (index >= 0) list[index] = { ...item, status: review.toStatus, methodVersion: review.actor };
    }
    this.items.set(review.claimId, list);

    const reviews = this.reviews.get(review.claimId) ?? [];
    reviews.push({ ...review, fromStatus, reviewedAt });
    this.reviews.set(review.claimId, reviews);
    return this.listReviews(review.claimId);
  }
}

export class InMemoryEdgeRepository implements EdgeRepository {
  private readonly items = new Map<string, Edge>();
  private key(edge: Edge): string {
    return `${edge.from}|${edge.to}|${edge.relation}|${edge.asOf.toISOString()}|${edge.weight}`;
  }
  async upsert(edge: Edge): Promise<void> {
    this.items.set(this.key(edge), edge);
  }
  async list(): Promise<Edge[]> {
    return [...this.items.values()].sort(compareEdges);
  }
  async listAsOf(date: Date): Promise<Edge[]> {
    return resolveEdgesAsOf([...this.items.values()], date);
  }
}

export class InMemoryAssessmentRepository implements AssessmentRepository {
  private readonly items = new Map<string, Assessment[]>();
  async append(assessment: Assessment): Promise<void> {
    const list = this.items.get(assessment.claimId) ?? [];
    list.push(assessment);
    this.items.set(assessment.claimId, list);
  }
  async getLatest(claimId: string): Promise<Assessment | undefined> {
    const list = this.items.get(claimId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  }
  async list(claimId: string): Promise<Assessment[]> {
    return [...(this.items.get(claimId) ?? [])];
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    sources: new InMemorySourceRepository(),
    entities: new InMemoryEntityRepository(),
    claims: new InMemoryClaimRepository(),
    claimEvidence: new InMemoryClaimEvidenceRepository(),
    edges: new InMemoryEdgeRepository(),
    assessments: new InMemoryAssessmentRepository(),
  };
}
