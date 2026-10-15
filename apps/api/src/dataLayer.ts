import { Pool } from "pg";
import { ClaimEvidenceSchema } from "@arcstar/contracts";
import type { AppConfig } from "./config.js";
import { assessClaim } from "./assessment.js";
import { demoSources, demoClaim } from "./data/demo.js";
import { maritimeNodes, maritimeEdges } from "./data/maritime.js";
import { createInMemoryRepositories } from "./repositories/inMemory.js";
import { createPostgresRepositories } from "./repositories/postgresFactories.js";
import type { QueryResult, SqlClient, TransactionalSqlClient } from "./repositories/postgres.js";
import type { Repositories } from "./repositories/types.js";

export interface DataLayer {
  storage: "memory" | "postgres";
  repos: Repositories;
  close?: () => Promise<void>;
  ready?: () => Promise<void>;
}

export interface PgClient extends SqlClient {
  end(): Promise<void>;
}

export function createPgClient(databaseUrl: string): PgClient {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async transaction<T>(work: (tx: TransactionalSqlClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({
          async query<U>(sql: string, params?: unknown[]): Promise<QueryResult<U>> {
            const inner = await client.query(sql, params);
            return { rows: inner.rows as U[] };
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async end() {
      await pool.end();
    },
  };
}

async function seedInMemory(repos: Repositories): Promise<void> {
  for (const node of maritimeNodes) {
    await repos.entities.upsert(node);
  }
  for (const edge of maritimeEdges) {
    await repos.edges.upsert(edge);
  }
  for (const source of demoSources) {
    await repos.sources.upsert(source);
  }
  await repos.claims.upsert(demoClaim);

  await repos.claimEvidence.upsertMany(
    demoSources.map((source) =>
      ClaimEvidenceSchema.parse({
        claimId: demoClaim.id,
        sourceId: source.id,
        stance: "supports",
        methodVersion: "manual-seed",
        status: "unresolved",
      }),
    ),
  );

  await repos.assessments.append(
    assessClaim({
      claim: demoClaim,
      allSources: demoSources,
      assessedAt: new Date("2026-01-01T00:00:00Z"),
    }),
  );
}

export function createInMemoryDataLayer(): DataLayer {
  const repos = createInMemoryRepositories();
  return {
    storage: "memory",
    repos,
    ready: async () => {
      await seedInMemory(repos);
    },
  };
}

export function createDataLayer(config: AppConfig): DataLayer {
  if (config.databaseUrl === undefined) {
    return createInMemoryDataLayer();
  }

  const sql = createPgClient(config.databaseUrl);
  return {
    storage: "postgres",
    repos: createPostgresRepositories(sql),
    ready: async () => {
      await sql.query("SELECT 1");
    },
    close: () => sql.end(),
  };
}
