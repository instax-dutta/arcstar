import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { scoreClaim } from "@arcstar/credibility";
import {
  blastRadius,
  DEFAULT_BLAST_OPTIONS,
  GraphBudgetError,
  GRAPH_METHOD_VERSION,
} from "@arcstar/graph";
import {
  ClaimEvidenceReviewSchema,
  ClaimEvidenceSchema,
  ClaimSchema,
  EdgeSchema,
  NodeSchema,
  SourceSchema,
  type ClaimEvidence,
} from "@arcstar/contracts";
import { assessClaim, contradictingClaimsFromEvidence } from "./assessment.js";
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
const MAX_EVIDENCE_ITEMS = 1000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_GRAPH_PAGE = 1000;

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

function coerceDates(keys: readonly string[]) {
  return (value: unknown) => {
    let current = value;
    for (const key of keys) {
      current = coerceDate(key)(current);
    }
    return current;
  };
}

const HttpSourceSchema = z.preprocess(coerceDate("publishedAt"), SourceSchema);
const HttpClaimSchema = z.preprocess(coerceDate("assertedAt"), ClaimSchema);
const HttpEdgeSchema = z.preprocess(coerceDates(["asOf", "observedAt"]), EdgeSchema);
const HttpClaimEvidenceReviewSchema = z.preprocess(coerceDate("reviewedAt"), ClaimEvidenceReviewSchema);

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => (inner instanceof Date ? inner.toISOString() : inner));
}

function sortCanonical(values: readonly unknown[]): unknown[] {
  return values.map((value) => value).sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0));
}

function graphSnapshotId(
  nodes: readonly unknown[],
  edges: readonly unknown[],
  query: { asOf?: Date; maxHops: number },
): string {
  const canonical = canonicalJson({
    methodVersion: GRAPH_METHOD_VERSION,
    asOf: query.asOf?.toISOString(),
    maxHops: query.maxHops,
    nodes: sortCanonical(nodes),
    edges: sortCanonical(edges),
  });
  return `graph-${createHash("sha256").update(canonical).digest("hex")}`;
}

function parseAsOf(raw: string | undefined): { asOf?: Date; error?: string } {
  if (raw === undefined || raw.length === 0) return {};
  const asOf = new Date(raw);
  if (Number.isNaN(asOf.getTime())) return { error: "asOf must be a valid date" };
  return { asOf };
}

function parseLimit(value: string | undefined): { limit?: number; error?: string } {
  if (value === undefined || value.length === 0) return {};
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GRAPH_PAGE) {
    return { error: `limit must be an integer from 1 to ${MAX_GRAPH_PAGE}` };
  }
  return { limit };
}

function applyEvidenceToClaim(
  claim: { id: string; text: string; subjectNodeId: string; assertedAt: Date; supportingSourceIds: string[]; contradictingSourceIds: string[]; extractionConfidence: number },
  evidence: readonly ClaimEvidence[],
): { changed: boolean; claim: typeof claim; error?: string } {
  const supporting = [...claim.supportingSourceIds];
  const contradicting = [...claim.contradictingSourceIds];

  for (const item of evidence) {
    if (item.stance === "supports") {
      if (!supporting.includes(item.sourceId)) supporting.push(item.sourceId);
    }
    if (item.stance === "contradicts") {
      if (!contradicting.includes(item.sourceId)) contradicting.push(item.sourceId);
    }
  }

  const overlap = supporting.filter((id) => contradicting.includes(id));
  if (overlap.length > 0) {
    return { changed: false, claim, error: `source(s) cannot both support and contradict the claim: ${overlap.join(", ")}` };
  }

  const changed =
    supporting.length !== claim.supportingSourceIds.length || contradicting.length !== claim.contradictingSourceIds.length;
  return { changed, claim: { ...claim, supportingSourceIds: supporting, contradictingSourceIds: contradicting } };
}

export function createApp(dataLayer: DataLayer, config: AppConfig, limiter?: MiddlewareHandler) {
  const app = new Hono();
  const rateLimiter =
    limiter ??
    createRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMax,
      trustedProxies: config.trustedProxies,
    });

  app.use("*", bodyLimit({ maxSize: MAX_BODY_BYTES }));
  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    c.header("x-request-id", requestId);
    await next();
  });
  app.use("*", cors({ origin: (origin) => (origin && config.corsOrigins.includes(origin) ? origin : undefined) }));

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/ready", async (c) => {
    if (dataLayer.ready) {
      try {
        await dataLayer.ready();
      } catch {
        return c.json({ ready: false, reason: "dependencies unavailable" }, 503);
      }
    }
    return c.json({ ready: true, storage: dataLayer.storage });
  });

  app.get("/graph", async (c) => {
    const { limit, error } = parseLimit(c.req.query("limit"));
    if (error) return c.json({ error }, 400);

    const [nodes, edges] = await Promise.all([dataLayer.repos.entities.list(), dataLayer.repos.edges.list()]);
    const paginatedNodes = limit === undefined ? nodes : nodes.slice(0, limit);
    const paginatedEdges = limit === undefined ? edges : edges.slice(0, limit);
    return c.json({
      storage: dataLayer.storage,
      nodes: paginatedNodes,
      edges: paginatedEdges,
      nextNodeOffset: limit === undefined ? undefined : Math.min(nodes.length, limit),
      nextEdgeOffset: limit === undefined ? undefined : Math.min(edges.length, limit),
    });
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
      return c.json({ experimental: true, result });
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
        maxPathStates: z.number().int().min(1).max(1_000_000).optional(),
      })
      .optional(),
  });

  app.use("/blast-radius", rateLimiter);
  app.post("/blast-radius", zValidator("json", blastRequestSchema), (c) => {
    const { graph, disruptedNode, options } = c.req.valid("json");
    try {
      const result = blastRadius(graph, disruptedNode, { ...DEFAULT_BLAST_OPTIONS, ...options });
      return c.json({ experimental: true, graphProvidedByClient: true, results: result });
    } catch (error) {
      if (error instanceof GraphBudgetError) return c.json({ error: "graph budget exceeded" }, 413);
      throw error;
    }
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
    const [evidence, evidenceReviews, assessment] = await Promise.all([
      dataLayer.repos.claimEvidence.list(claim.id),
      dataLayer.repos.claimEvidence.listReviews(claim.id),
      dataLayer.repos.assessments.getLatest(claim.id),
    ]);
    return c.json({ claim, evidence, evidenceReviews, assessment });
  });

  app.use("/claims/:id/evidence", rateLimiter);
  app.post(
    "/claims/:id/evidence",
    zValidator("json", z.object({ evidence: z.array(ClaimEvidenceSchema).max(MAX_EVIDENCE_ITEMS) })),
    async (c) => {
      const claimId = c.req.param("id");
      const { evidence } = c.req.valid("json");
      if (evidence.some((item) => item.claimId !== claimId)) {
        return c.json({ error: "evidence claimId must match the route claim id" }, 400);
      }

      const claim = await dataLayer.repos.claims.get(claimId);
      if (!claim) return c.json({ error: "claim not found" }, 404);

      for (const item of evidence) {
        const source = await dataLayer.repos.sources.get(item.sourceId);
        if (!source) return c.json({ error: `unknown source ${item.sourceId}` }, 400);
      }

      const projection = applyEvidenceToClaim(claim, evidence);
      if (projection.error) return c.json({ error: projection.error }, 400);

      await dataLayer.repos.claimEvidence.upsertMany(evidence);
      if (projection.changed) {
        await dataLayer.repos.claims.upsert(projection.claim);
      }
      const [savedEvidence, updatedClaim] = await Promise.all([
        dataLayer.repos.claimEvidence.list(claimId),
        dataLayer.repos.claims.get(claimId),
      ]);
      return c.json({ claim: updatedClaim, evidence: savedEvidence });
    },
  );

  app.use("/claims/:id/evidence/reviews", rateLimiter);
  app.post(
    "/claims/:id/evidence/reviews",
    zValidator("json", z.object({ reviews: z.array(HttpClaimEvidenceReviewSchema).max(MAX_EVIDENCE_ITEMS) })),
    async (c) => {
      const claimId = c.req.param("id");
      const { reviews } = c.req.valid("json");
      const claim = await dataLayer.repos.claims.get(claimId);
      if (!claim) return c.json({ error: "claim not found" }, 404);
      if (reviews.some((review) => review.claimId !== claimId)) {
        return c.json({ error: "review claimId must match the route claim id" }, 400);
      }

      try {
        for (const review of reviews) await dataLayer.repos.claimEvidence.applyReview(review);
      } catch {
        return c.json({ error: "review must match existing evidence" }, 400);
      }
      const [evidence, history] = await Promise.all([
        dataLayer.repos.claimEvidence.list(claimId),
        dataLayer.repos.claimEvidence.listReviews(claimId),
      ]);
      return c.json({ claimId, evidence, reviews: history });
    },
  );

  app.use("/claims/:id/assessments", rateLimiter);
  app.post("/claims/:id/assessments", async (c) => {
    const claim = await dataLayer.repos.claims.get(c.req.param("id"));
    if (!claim) return c.json({ error: "claim not found" }, 404);
    const allSources = await dataLayer.repos.sources.list();
    const evidence = await dataLayer.repos.claimEvidence.list(claim.id);

    let contradictingClaims;
    try {
      contradictingClaims = contradictingClaimsFromEvidence(claim, allSources, evidence);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "contradictory evidence could not be scored" }, 409);
    }

    const assessment = assessClaim({ claim, allSources, contradictingClaims });
    await dataLayer.repos.assessments.append(assessment);
    return c.json({ assessment }, 201);
  });

  app.get("/sources/:id", async (c) => {
    const source = await dataLayer.repos.sources.get(c.req.param("id"));
    if (!source) return c.json({ error: "source not found" }, 404);
    const [lineage, lineageGaps] = await Promise.all([
      dataLayer.repos.sources.listLineage(source.id),
      dataLayer.repos.sources.listLineageGaps(source.id),
    ]);
    return c.json({ source, lineage, lineageGaps });
  });

  app.use("/scenarios/:node", rateLimiter);
  app.get("/scenarios/:node", async (c) => {
    const { asOf, error } = parseAsOf(c.req.query("asOf"));
    if (error) return c.json({ error }, 400);

    const rawMaxHops = c.req.query("maxHops");
    const maxHops = rawMaxHops === undefined ? DEFAULT_BLAST_OPTIONS.maxHops : Number(rawMaxHops);
    if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 10) {
      return c.json({ error: "maxHops must be an integer from 1 to 10" }, 400);
    }

    const resolvedAsOf = asOf ?? new Date();
    const [nodes, edges] = await Promise.all([
      dataLayer.repos.entities.list(),
      dataLayer.repos.edges.listAsOf(resolvedAsOf),
    ]);
    if (!nodes.some((node) => node.id === c.req.param("node"))) {
      return c.json({ error: "node not found" }, 404);
    }

    const snapshotId = graphSnapshotId(nodes, edges, { asOf, maxHops });
    try {
      const results = blastRadius({ nodes, edges }, c.req.param("node"), {
        ...DEFAULT_BLAST_OPTIONS,
        maxHops,
        asOf: resolvedAsOf,
      });
      return c.json({
        snapshot: {
          id: snapshotId,
          methodVersion: GRAPH_METHOD_VERSION,
          asOf: resolvedAsOf.toISOString(),
          asOfRequested: asOf?.toISOString(),
          nodeCount: nodes.length,
          edgeCount: edges.length,
          storage: dataLayer.storage,
        },
        edgeEvidenceStatus: edges.every((edge) => edge.verificationState === "verified")
          ? "verified"
          : edges.some((edge) => edge.verificationState === "estimated")
            ? "mixed"
            : "unverified-or-unknown",
        scenarioKind: "hypothetical-disruption",
        results,
      });
    } catch (error) {
      if (error instanceof GraphBudgetError) return c.json({ error: "graph budget exceeded" }, 413);
      throw error;
    }
  });

  return app;
}

const defaultConfig = loadConfig(process.env);
export const defaultDataLayer = createDataLayer(defaultConfig);

export const app = createApp(defaultDataLayer, defaultConfig);
