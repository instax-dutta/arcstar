import type { Assessment, Claim, Edge, Node, Source } from "@arcstar/contracts";
import { resolveEdgesAsOf } from "@arcstar/graph";
import type {
  AssessmentRepository,
  ClaimRepository,
  EdgeRepository,
  EntityRepository,
  SourceRepository,
} from "./types.js";

function compareEdges(a: Edge, b: Edge): number {
  return (
    (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
    (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) ||
    (a.relation < b.relation ? -1 : a.relation > b.relation ? 1 : 0) ||
    a.asOf.getTime() - b.asOf.getTime() ||
    a.weight - b.weight
  );
}

export class InMemorySourceRepository implements SourceRepository {
  private readonly items = new Map<string, Source>();
  async upsert(source: Source): Promise<void> {
    this.items.set(source.id, source);
  }
  async get(id: string): Promise<Source | undefined> {
    return this.items.get(id);
  }
  async list(): Promise<Source[]> {
    return [...this.items.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
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
    return [...this.items.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
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
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

export class InMemoryEdgeRepository implements EdgeRepository {
  private readonly items = new Map<string, Edge>();
  private key(edge: Edge): string {
    return `${edge.from}|${edge.to}|${edge.relation}|${edge.asOf.toISOString()}`;
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

export function createInMemoryRepositories() {
  return {
    sources: new InMemorySourceRepository(),
    entities: new InMemoryEntityRepository(),
    claims: new InMemoryClaimRepository(),
    edges: new InMemoryEdgeRepository(),
    assessments: new InMemoryAssessmentRepository(),
  };
}
