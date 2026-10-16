import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClaimEvidenceSchema,
  ClaimSchema,
  EdgeSchema,
  NodeSchema,
  SourceSchema,
} from "@arcstar/contracts";
import { createPgClient } from "../dataLayer.js";
import { createPostgresRepositories } from "../repositories/postgresFactories.js";
import type { SqlClient } from "../repositories/postgres.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeReal = databaseUrl ? describe : describe.skip;

const tables = [
  "claim_evidence_review",
  "claim_evidence",
  "claim_source_link",
  "assessment",
  "claim",
  "source_lineage_gap",
  "source_lineage",
  "dependency_edge",
  "entity",
  "source_pool",
];

async function applyMigrations(sql: SqlClient): Promise<void> {
  const migrationsDir = resolve(process.cwd(), "..", "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await sql.query<{ version: string }>(`SELECT version FROM schema_migration`);
  const applied = new Set(appliedResult.rows.map((row) => row.version));

  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = readFileSync(resolve(migrationsDir, file), "utf8");
    await sql.query(migration);
    await sql.query(`INSERT INTO schema_migration (version) VALUES ($1)`, [file]);
  }
}

describeReal("PostgreSQL repository integration", () => {
  let sql: SqlClient & { end: () => Promise<void> };
  let repos: ReturnType<typeof createPostgresRepositories>;

  beforeAll(async () => {
    sql = createPgClient(databaseUrl!);
    await applyMigrations(sql);
    repos = createPostgresRepositories(sql);
    await sql.query(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await sql.query(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
    await sql.end();
  });

  it("persists scoring-critical source fields and lineage kind/status", async () => {
    const upstream = SourceSchema.parse({
      id: "upstream",
      publisher: "Upstream",
      tier: 1,
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      citesSourceIds: [],
      primaryEvidence: "primary evidence",
    });
    const child = SourceSchema.parse({
      id: "child",
      publisher: "Child",
      tier: 2,
      publishedAt: new Date("2026-01-02T00:00:00Z"),
      citesSourceIds: ["upstream"],
      primaryEvidence: "child evidence",
      lineage: [
        {
          fromSourceId: "child",
          toSourceId: "upstream",
          kind: "syndicates",
          status: "verified",
          evidence: "shared release",
        },
      ],
    });

    await repos.sources.upsert(upstream);
    await repos.sources.upsert(child);

    const savedChild = await repos.sources.get("child");
    expect(savedChild?.primaryEvidence).toBe("child evidence");
    expect(savedChild?.lineage).toEqual([
      { fromSourceId: "child", toSourceId: "upstream", kind: "syndicates", status: "verified", evidence: "shared release" },
    ]);
    expect(await repos.sources.listLineageGaps("child")).toEqual([]);
  });

  it("keeps valid and observed edge time separate", async () => {
    const nodeA = NodeSchema.parse({ id: "a", type: "company", label: "A", props: {} });
    const nodeB = NodeSchema.parse({ id: "b", type: "company", label: "B", props: {} });
    await repos.entities.upsert(nodeA);
    await repos.entities.upsert(nodeB);

    const edge = EdgeSchema.parse({
      from: "a",
      to: "b",
      relation: "supplies",
      weight: 0.8,
      asOf: new Date("2026-01-01T00:00:00Z"),
      observedAt: new Date("2026-02-01T00:00:00Z"),
      verificationState: "estimated",
      evidenceRefs: ["doc-1"],
    });
    await repos.edges.upsert(edge);

    const saved = (await repos.edges.listAsOf(new Date("2026-03-01T00:00:00Z")))[0];
    expect(saved?.asOf.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(saved?.observedAt?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(saved?.verificationState).toBe("estimated");
    expect(saved?.evidenceRefs).toEqual(["doc-1"]);
  });

  it("rolls back a failed transaction", async () => {
    if (!sql.transaction) throw new Error("sql transaction support is required for integration");
    await expect(
      sql.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO source_pool (id, publisher, source_tier, published_at, created_at, updated_at)
           VALUES ($1, $2, $3, now(), now(), now())`,
          ["rollback-source", "Rollback", 2],
        );
        throw new Error("force rollback");
      }),
    ).rejects.toThrow(/force rollback/);

    const result = await sql.query<{ id: string }>(`SELECT id FROM source_pool WHERE id = $1`, ["rollback-source"]);
    expect(result.rows).toEqual([]);
  });

  it("persists claim evidence and assessments with snapshots", async () => {
    await repos.sources.upsert(SourceSchema.parse({
      id: "evidence-source",
      publisher: "Evidence",
      tier: 1,
      publishedAt: new Date(0),
      citesSourceIds: [],
      primaryEvidence: "evidence",
    }));
    await repos.entities.upsert(NodeSchema.parse({ id: "hormuz", type: "chokepoint", label: "Hormuz", props: {} }));
    const claim = ClaimSchema.parse({
      id: "claim-1",
      text: "Claim 1",
      subjectNodeId: "hormuz",
      assertedAt: new Date("2026-01-01T00:00:00Z"),
      supportingSourceIds: ["evidence-source"],
      contradictingSourceIds: [],
      extractionConfidence: 0.9,
    });
    await repos.claims.upsert(claim);

    const evidence = ClaimEvidenceSchema.parse({
      claimId: "claim-1",
      sourceId: "evidence-source",
      stance: "supports",
      passage: "Passage",
      status: "resolved",
    });
    await repos.claimEvidence.upsertMany([evidence]);
    expect(await repos.claimEvidence.list("claim-1")).toEqual([evidence]);

    const allSources = await repos.sources.list();
    const assessment = (await import("../assessment.js")).assessClaim({ claim, allSources });
    await repos.assessments.append(assessment);
    const saved = await repos.assessments.getLatest("claim-1");
    expect(saved?.inputSnapshotRef).toBe(assessment.inputSnapshotRef);
    expect(saved?.inputSnapshot.allSources.map((source) => source.id)).toContain("evidence-source");
    expect(saved?.score.value).toBe(assessment.score.value);
  });

  it("rejects enum values that violate the contract", async () => {
    await expect(
      sql.query(`INSERT INTO entity (id, entity_type, label, aliases, external_ids) VALUES ($1, $2, $3, ARRAY[]::text[], '{}'::jsonb)`, [
        "bad-entity",
        "spaceship",
        "Bad",
      ]),
    ).rejects.toThrow();
  });
});
