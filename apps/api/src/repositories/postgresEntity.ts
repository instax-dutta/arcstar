import { NodeSchema, type Node } from "@arcstar/contracts";
import type { EntityRepository } from "./types.js";
import type { SqlClient } from "./postgres.js";

interface EntityRow {
  id: string;
  entity_type: string;
  label: string;
  aliases: string[];
  external_ids: Record<string, unknown>;
}

/**
 * Entity rows map to graph `Node` values. `props` is the entity's external id map;
 * richer graph edge evidence is stored separately in `dependency_edge`.
 */
export class PostgresEntityRepository implements EntityRepository {
  constructor(private readonly sql: SqlClient) {}

  async upsert(entity: Node): Promise<void> {
    const aliases =
      entity.props && typeof entity.props["aliases"] === "object" && Array.isArray(entity.props["aliases"])
        ? (entity.props["aliases"] as unknown[]).filter((value): value is string => typeof value === "string")
        : [];

    await this.sql.query(
      `INSERT INTO entity (id, entity_type, label, aliases, external_ids, created_at, updated_at)
       VALUES ($1, $2, $3, $4::text[], $5::jsonb, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         entity_type = EXCLUDED.entity_type,
         label = EXCLUDED.label,
         aliases = EXCLUDED.aliases,
         external_ids = EXCLUDED.external_ids,
         updated_at = now()`,
      [entity.id, entity.type, entity.label, aliases, JSON.stringify(entity.props ?? {})],
    );
  }

  async get(id: string): Promise<Node | undefined> {
    const result = await this.sql.query<EntityRow>(
      `SELECT id, entity_type, label, aliases, external_ids FROM entity WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return this.toNode(row);
  }

  async list(): Promise<Node[]> {
    const result = await this.sql.query<EntityRow>(
      `SELECT id, entity_type, label, aliases, external_ids FROM entity ORDER BY id`,
    );
    return result.rows.map((row) => this.toNode(row));
  }

  private toNode(row: EntityRow): Node {
    return NodeSchema.parse({
      id: row.id,
      type: row.entity_type,
      label: row.label,
      props: { ...(row.external_ids ?? {}), aliases: row.aliases ?? [] },
    });
  }
}
