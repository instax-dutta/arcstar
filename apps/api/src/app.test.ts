import { describe, expect, it } from "vitest";
import { app } from "./app.js";
import { maritimeGraph } from "./data/maritime.js";

describe("evidence route", () => {
  it("extracts claim candidates and entity spans from text", async () => {
    const graph = maritimeGraph();
    const res = await app.request("/evidence/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "Strait of Hormuz transit halts. European Union confirms rerouting.",
        nodes: graph.nodes,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      candidates: Array<{ sentence: string; trigger: string }>;
      entitySpans: Array<{ termId: string }>;
    };
    expect(body.candidates.map((c) => c.trigger)).toEqual(["halt", "confirms"]);
    expect(body.entitySpans.map((s) => s.termId)).toEqual(["hormuz", "eu"]);
  });
});
