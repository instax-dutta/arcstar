import { EdgeSchema, type Edge } from "@arcstar/contracts";
import type { EdgeRepository } from "./types.js";
import { readStoredDate, type SqlClient } from "./postgres.js";

interface EdgeRow {
  from_entity_id: string;
  to_entity_id: string;
  relation_type: string;
  weight: number;
  valid_from: Date | string;
  observed_at: Date | string;
  evidence_refs: string[] | null;
  verification_state: string | null;
}

function edgeId(edge: Edge): string {
  return `${edge.from}->${edge.to}:${edge.relation}:${edge.asOf.toISOString()}:${edge.weight}`;
}

function sortResolved(edges: Edge[]): Edge[] {
  return edges.sort(
    (a, b) =>
      (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
      (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) ||
      (a.relation < b.relation ? -1 : a.relation > b.relation ? 1 : 0),
  );
}

export class PostgresEdgeRepository implements EdgeRepository {
  constructor(private readonly sql: SqlClient) {}

  async upsert(edge: Edge): Promise<void> {
    await this.sql.query(
      `INSERT INTO dependency_edge (
         id, from_entity_id, to_entity_id, relation_type, weight,
         valid_from, observed_at, evidence_refs, verification_state
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9)
       ON CONFLICT (id) DO UPDATE SET
         observed_at = EXCLUDED.observed_at,
         evidence_refs = EXCLUDED.evidence_refs,
         verification_state = EXCLUDED.verification_state`,
      [
        edgeId(edge),
        edge.from,
        edge.to,
        edge.relation,
        edge.weight,
        edge.asOf,
        edge.observedAt ?? edge.asOf,
        edge.evidenceRefs ?? [],
        edge.verificationState ?? "unknown",
      ],
    );
  }

  async list(): Promise<Edge[]> {
    const result = await this.sql.query<EdgeRow>(
      `SELECT from_entity_id, to_entity_id, relation_type, weight, valid_from, observed_at, evidence_refs, verification_state
       FROM dependency_edge
       ORDER BY from_entity_id, to_entity_id, relation_type, valid_from DESC, weight DESC`,
    );
    return sortResolved(result.rows.map((row) => this.toEdge(row)));
  }

  async listAsOf(date: Date): Promise<Edge[]> {
    const result = await this.sql.query<EdgeRow>(
      `SELECT DISTINCT ON (from_entity_id, to_entity_id, relation_type)
         from_entity_id, to_entity_id, relation_type, weight, valid_from, observed_at, evidence_refs, verification_state
       FROM dependency_edge
       WHERE valid_from <= $1
       ORDER BY from_entity_id, to_entity_id, relation_type, valid_from DESC, weight DESC`,
      [date],
    );
    return sortResolved(result.rows.map((row) => this.toEdge(row)));
  }

  private toEdge(row: EdgeRow): Edge {
    return EdgeSchema.parse({
      from: row.from_entity_id,
      to: row.to_entity_id,
      relation: row.relation_type,
      weight: row.weight,
      asOf: readStoredDate(row.valid_from, "valid_from"),
      observedAt: readStoredDate(row.observed_at, "observed_at"),
      evidenceRefs: row.evidence_refs ?? [],
      verificationState: row.verification_state === "verified" || row.verification_state === "estimated" || row.verification_state === "disputed"
        ? row.verification_state
        : "unknown",
    });
  }
}
