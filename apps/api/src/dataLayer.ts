import { Pool } from "pg";
import { ClaimEvidenceSchema } from "@arcstar/contracts";
import type { AppConfig } from "./config.js";
import { assessClaim } from "./assessment.js";
import { demoSources, demoClaim } from "./data/demo.js";
import { maritimeNodes, maritimeEdges } from "./data/maritime.js";
import { createInMemoryRepositories } from "./repositories/inMemory.js";
import { createPostgresRepositories } from "./repositories/postgresFactories.js";
import type { SqlClient } from "./repositories/postgres.js";
import type { Repositories } from "./repositories/types.js";

export interface DataLayer {
  storage: "memory" | "postgres";
  repos: Repositories;
  close?: () => Promise<void>;
}

export interface PgClient extends SqlClient {
  end(): Promise<void>;
}

export function createPgClient(databaseUrl: string): PgClient {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async end() {
      await pool.end();
    },
  };
}

export function createInMemoryDataLayer(): DataLayer {
  const repos = createInMemoryRepositories();

  for (const node of maritimeNodes) {
    void repos.entities.upsert(node);
  }
  for (const edge of maritimeEdges) {
    void repos.edges.upsert(edge);
  }

  for (const source of demoSources) {
    void repos.sources.upsert(source);
  }
  void repos.claims.upsert(demoClaim);

  for (const source of demoSources) {
    void repos.claimEvidence.upsert(
      ClaimEvidenceSchema.parse({
        claimId: demoClaim.id,
        sourceId: source.id,
        stance: "supports",
        methodVersion: "manual-seed",
        status: "unresolved",
      }),
    );
  }

  void repos.assessments.append(
    assessClaim({
      claim: demoClaim,
      allSources: demoSources,
      assessedAt: new Date("2026-01-01T00:00:00Z"),
    }),
  );

  return { storage: "memory", repos };
}

export function createDataLayer(config: AppConfig): DataLayer {
  if (config.databaseUrl === undefined) {
    return createInMemoryDataLayer();
  }

  const sql = createPgClient(config.databaseUrl);
  return {
    storage: "postgres",
    repos: createPostgresRepositories(sql),
    close: () => sql.end(),
  };
}
