import { createHash } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { scoreClaim } from "@arcstar/credibility";
import { blastRadius, DEFAULT_BLAST_OPTIONS } from "@arcstar/graph";
import { ClaimEvidenceSchema, ClaimSchema, EdgeSchema, NodeSchema, SourceSchema } from "@arcstar/contracts";
import { assessClaim } from "./assessment.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createDataLayer, type DataLayer } from "./dataLayer.js";
import { demoClaim, demoSources } from "./data/demo.js";
import { extractEvidence } from "./extractEvidence.js";
import { createRateLimiter } from "./rateLimit.js";

const MAX_NODES = 2000;
const MAX_EDGES = 10000;
const MAX_SOURCES = 20000;
const MAX_TEXT_LENGTH = 20000;
const MAX_EVIDENCE_NODES = 200;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function coerceDate(key: string) {
  return (value: unknown) => {
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj[key] !== undefined) {
        const parsed = new Date(obj[key] as string | number | Date);
        if (!Number.isNaN(parsed.getTime())) return { ...obj, [key]: parsed };
      }
    }
    return value;
  };
}

const HttpSourceSchema = z.preprocess(coerceDate("publishedAt"), SourceSchema);
const HttpClaimSchema = z.preprocess(coerceDate("assertedAt"), ClaimSchema);
const HttpEdgeSchema = z.preprocess(coerceDate("asOf"), EdgeSchema);

function graphSnapshotId(nodes: readonly unknown[], edges: readonly unknown[], asOf: Date): string {
  const canonical = JSON.stringify({ asOf: asOf.toISOString(), nodes, edges }, (_key, value) =>
    value instanceof Date ? value.toISOString() : value,
  );
  return `graph-${createHash("sha256").update(canonical).digest("hex")}`;
}

function parseAsOf(raw: string | undefined): { asOf?: Date; error?: string } {
  if (raw === undefined || raw.length === 0) return {};
  const asOf = new Date(raw);
  if (Number.isNaN(asOf.getTime())) return { error: "asOf must be a valid date" };
  return { asOf };
}

export function createApp(dataLayer: DataLayer, config: AppConfig, limiter?: MiddlewareHandler) {
  const app = new Hono();
  const rateLimiter =
    limiter ??
    createRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMax,
    });

  app.use("*", bodyLimit({ maxSize: MAX_BODY_BYTES }));
  app.use("*", cors({ origin: (origin) => (origin && config.corsOrigins.includes(origin) ? origin : undefined) }));

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/graph", async (c) => {
    const [nodes, edges] = await Promise.all([dataLayer.repos.entities.list(), dataLayer.repos.edges.list()]);
    return c.json({ storage: dataLayer.storage, nodes, edges });
  });

  app.get("/claim", (c) => c.json({ claim: demoClaim, sources: demoSources }));

  app.use("/score", rateLimiter);
  app.post(
    "/score",
    zValidator(
      "json",
      z.object({ claim: HttpClaimSchema, allSources: z.array(HttpSourceSchema).max(MAX_SOURCES) }),
    ),
    (c) => {
      const { claim, allSources } = c.req.valid("json");
      const result = scoreClaim({ claim, allSources });
      return c.json(result);
    },
  );

  const blastRequestSchema = z.object({
    graph: z.object({
      nodes: z.array(NodeSchema).max(MAX_NODES),
      edges: z.array(HttpEdgeSchema).max(MAX_EDGES),
    }),
    disruptedNode: z.string().min(1),
    options: z
      .object({
        maxHops: z.number().int().min(1).max(10).optional(),
        decay: z.number().min(0).max(1).optional(),
        ceiling: z.number().min(0).max(100).optional(),
      })
      .optional(),
  });

  app.use("/blast-radius", rateLimiter);
  app.post("/blast-radius", zValidator("json", blastRequestSchema), (c) => {
    const { graph, disruptedNode, options } = c.req.valid("json");
    const result = blastRadius(graph, disruptedNode, { ...DEFAULT_BLAST_OPTIONS, ...options });
    return c.json({ results: result, graphProvidedByClient: true });
  });

  app.use("/evidence/candidates", rateLimiter);
  app.post(
    "/evidence/candidates",
    zValidator("json", z.object({ text: z.string().min(1).max(MAX_TEXT_LENGTH), nodes: z.array(NodeSchema).max(MAX_EVIDENCE_NODES) })),
    (c) => {
      const { text, nodes } = c.req.valid("json");
      return c.json(extractEvidence(text, nodes));
    },
  );

  app.get("/claims/:id", async (c) => {
    const claim = await dataLayer.repos.claims.get(c.req.param("id"));
    if (!claim) return c.json({ error: "claim not found" }, 404);
    const [evidence, assessment] = await Promise.all([
      dataLayer.repos.claimEvidence.list(claim.id),
      dataLayer.repos.assessments.getLatest(claim.id),
    ]);
    return c.json({ claim, evidence, assessment });
  });

  app.use("/claims/:id/evidence", rateLimiter);
  app.post(
    "/claims/:id/evidence",
    zValidator("json", z.object({ evidence: z.array(ClaimEvidenceSchema).max(1000) })),
    async (c) => {
      const claimId = c.req.param("id");
      const { evidence } = c.req.valid("json");
      if (evidence.some((item) => item.claimId !== claimId)) {
        return c.json({ error: "evidence claimId must match the route claim id" }, 400);
      }

      for (const item of evidence) {
        const source = await dataLayer.repos.sources.get(item.sourceId);
        if (!source) return c.json({ error: `unknown source ${item.sourceId}` }, 400);
      }

      for (const item of evidence) {
        await dataLayer.repos.claimEvidence.upsert(item);
      }
      const saved = await dataLayer.repos.claimEvidence.list(claimId);
      return c.json({ claimId, evidence: saved });
    },
  );

  app.use("/claims/:id/assessments", rateLimiter);
  app.post("/claims/:id/assessments", async (c) => {
    const claim = await dataLayer.repos.claims.get(c.req.param("id"));
    if (!claim) return c.json({ error: "claim not found" }, 404);
    const allSources = await dataLayer.repos.sources.list();
    const assessment = assessClaim({ claim, allSources });
    await dataLayer.repos.assessments.append(assessment);
    return c.json({ assessment }, 201);
  });

  app.get("/sources/:id", async (c) => {
    const source = await dataLayer.repos.sources.get(c.req.param("id"));
    if (!source) return c.json({ error: "source not found" }, 404);
    const lineageGaps = await dataLayer.repos.sources.listLineageGaps(source.id);
    return c.json({ source, lineageGaps });
  });

  app.use("/scenarios/:node", rateLimiter);
  app.get("/scenarios/:node", async (c) => {
    const { asOf, error } = parseAsOf(c.req.query("asOf"));
    if (error) return c.json({ error }, 400);

    const resolvedAsOf = asOf ?? new Date();
    const rawMaxHops = c.req.query("maxHops");
    const maxHops = rawMaxHops === undefined ? DEFAULT_BLAST_OPTIONS.maxHops : Number(rawMaxHops);
    if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 10) {
      return c.json({ error: "maxHops must be an integer from 1 to 10" }, 400);
    }

    const [nodes, edges] = await Promise.all([
      dataLayer.repos.entities.list(),
      dataLayer.repos.edges.listAsOf(resolvedAsOf),
    ]);
    if (!nodes.some((node) => node.id === c.req.param("node"))) {
      return c.json({ error: "node not found" }, 404);
    }

    const snapshotId = graphSnapshotId(nodes, edges, resolvedAsOf);
    const results = blastRadius({ nodes, edges }, c.req.param("node"), {
      ...DEFAULT_BLAST_OPTIONS,
      maxHops,
    });
    return c.json({
      snapshot: {
        id: snapshotId,
        asOf: resolvedAsOf.toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        storage: dataLayer.storage,
      },
      results,
    });
  });

  return app;
}

const defaultConfig = loadConfig(process.env);
export const defaultDataLayer = createDataLayer(defaultConfig);

export const app = createApp(defaultDataLayer, defaultConfig);
