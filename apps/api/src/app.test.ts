import { describe, expect, it } from "vitest";
import { app } from "./app.js";
import { demoClaim, demoSources } from "./data/demo.js";
import { maritimeEdges, maritimeNodes } from "./data/maritime.js";

describe("api", () => {
  it("health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("graph", async () => {
    const res = await app.request("/graph");
    const body = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(body.nodes).toHaveLength(maritimeNodes.length);
    expect(body.edges).toHaveLength(maritimeEdges.length);
  });

  it("score", async () => {
    const res = await app.request("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim: demoClaim, allSources: demoSources }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { score: { value: number } };
    expect(body.score.value).toBeGreaterThan(0);
  });

  it("blast-radius", async () => {
    const res = await app.request("/blast-radius", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph: { nodes: maritimeNodes, edges: maritimeEdges },
        disruptedNode: "hormuz",
      }),
    });
    expect(res.status).toBe(200);
  });
});
