import { describe, expect, it } from "vitest";
import { app } from "./app.js";
import { demoClaim, demoEdges, demoNodes, demoSources } from "./data/demo.js";

describe("api", () => {
  it("health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("graph", async () => {
    const res = await app.request("/graph");
    const body = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(body.nodes).toHaveLength(demoNodes.length);
    expect(body.edges).toHaveLength(demoEdges.length);
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
        graph: { nodes: demoNodes, edges: demoEdges },
        disruptedNode: "hormuz",
      }),
    });
    expect(res.status).toBe(200);
  });
});
