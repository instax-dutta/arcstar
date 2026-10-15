import type { Assessment, Claim, ClaimEvidence, Edge, Node, Source, SourceLineageGap } from "@arcstar/contracts";
import { resolveEdgesAsOf } from "@arcstar/graph";
import type {
  AssessmentRepository,
  ClaimEvidenceRepository,
  ClaimRepository,
  EdgeRepository,
  EntityRepository,
  Repositories,
  SourceLineageGapRepository,
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

function evidenceKey(evidence: ClaimEvidence): string {
  return [
    evidence.claimId,
    evidence.sourceId,
    evidence.stance,
    evidence.passage ?? "",
    evidence.passageStart ?? "",
    evidence.passageEnd ?? "",
    evidence.methodVersion ?? "",
  ].join("|");
}

export class InMemorySourceRepository implements SourceRepository, SourceLineageGapRepository {
  private readonly items = new Map<string, Source>();
  private readonly gaps = new Map<string, SourceLineageGap[]>();

  async upsert(source: Source): Promise<void> {
    this.items.set(source.id, source);

    for (const [fromSourceId, gaps] of this.gaps) {
      const stillOpen = gaps.filter((gap) => gap.unresolvedSourceRef !== source.id);
      if (stillOpen.length === 0) this.gaps.delete(fromSourceId);
      else this.gaps.set(fromSourceId, stillOpen);
    }

    const unresolved = source.citesSourceIds.filter((citedId) => !this.items.has(citedId));
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
  async upsert(evidence: ClaimEvidence): Promise<void> {
    const list = this.items.get(evidence.claimId) ?? [];
    const key = evidenceKey(evidence);
    const index = list.findIndex((candidate) => evidenceKey(candidate) === key);
    if (index === -1) list.push(evidence);
    else list[index] = evidence;
    this.items.set(evidence.claimId, list);
  }
  async list(claimId: string): Promise<ClaimEvidence[]> {
    return [...(this.items.get(claimId) ?? [])].sort((a, b) =>
      `${a.sourceId}:${a.stance}` < `${b.sourceId}:${b.stance}` ? -1 : 1,
    );
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
