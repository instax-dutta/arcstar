import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { scoreClaim } from "@arcstar/credibility";
import { blastRadius, DEFAULT_BLAST_OPTIONS } from "@arcstar/graph";
import { ClaimSchema, EdgeSchema, NodeSchema, SourceSchema } from "@arcstar/contracts";
import { demoClaim, demoSources } from "./data/demo.js";
import { maritimeGraph } from "./data/maritime.js";
import { extractEvidence } from "./extractEvidence.js";


function coerceDate(key: string) {
  return (value: unknown) => {
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj[key] !== undefined) return { ...obj, [key]: new Date(obj[key] as string | number | Date) };
    }
    return value;
  };
}

const HttpSourceSchema = z.preprocess(coerceDate("publishedAt"), SourceSchema);
const HttpClaimSchema = z.preprocess(coerceDate("assertedAt"), ClaimSchema);
const HttpEdgeSchema = z.preprocess(coerceDate("asOf"), EdgeSchema);

export const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

app.get("/graph", (c) => c.json(maritimeGraph()));

app.get("/claim", (c) => c.json({ claim: demoClaim, sources: demoSources }));

app.post(
  "/score",
  zValidator("json", z.object({ claim: HttpClaimSchema, allSources: z.array(HttpSourceSchema) })),
  (c) => {
    const { claim, allSources } = c.req.valid("json");
    const result = scoreClaim({ claim, allSources });
    return c.json(result);
  },
);

const blastRequestSchema = z.object({
  graph: z.object({
    nodes: z.array(NodeSchema),
    edges: z.array(HttpEdgeSchema),
  }),
  disruptedNode: z.string().min(1),
  options: z
    .object({
      maxHops: z.number().int().min(1).optional(),
      decay: z.number().min(0).max(1).optional(),
      ceiling: z.number().min(0).optional(),
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
  zValidator("json", z.object({ text: z.string().min(1), nodes: z.array(NodeSchema) })),
  (c) => {
    const { text, nodes } = c.req.valid("json");
    return c.json(extractEvidence(text, nodes));
  },
);


