import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { scoreClaim } from "@arcstar/credibility";
import { blastRadius, DEFAULT_BLAST_OPTIONS } from "@arcstar/graph";
import { ClaimSchema, EdgeSchema, NodeSchema, SourceSchema } from "@arcstar/contracts";
import { demoClaim, demoSources } from "./data/demo.js";
import { maritimeGraph } from "./data/maritime.js";
import { extractEvidence } from "./extractEvidence.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);

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

export const app = new Hono();

app.use("*", bodyLimit({ maxSize: MAX_BODY_BYTES }));
app.use("*", cors({ origin: (origin) => (origin && config.corsOrigins.includes(origin) ? origin : undefined) }));

app.get("/health", (c) => c.json({ ok: true }));

app.get("/graph", (c) => c.json(maritimeGraph()));

app.get("/claim", (c) => c.json({ claim: demoClaim, sources: demoSources }));

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

app.post("/blast-radius", zValidator("json", blastRequestSchema), (c) => {
  const { graph, disruptedNode, options } = c.req.valid("json");
  const result = blastRadius(graph, disruptedNode, { ...DEFAULT_BLAST_OPTIONS, ...options });
  return c.json({ results: result });
});

app.post(
  "/evidence/candidates",
  zValidator("json", z.object({ text: z.string().min(1).max(MAX_TEXT_LENGTH), nodes: z.array(NodeSchema).max(MAX_EVIDENCE_NODES) })),
  (c) => {
    const { text, nodes } = c.req.valid("json");
    return c.json(extractEvidence(text, nodes));
  },
);


