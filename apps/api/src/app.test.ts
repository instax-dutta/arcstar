import { describe, expect, it } from "vitest";
import { app } from "./app.js";
import { maritimeGraph } from "./data/maritime.js";
import type { Node } from "@arcstar/contracts";

function node(id: string): Node {
  return { id, type: "chokepoint", label: id, props: {} };
}

describe("cors and request limits", () => {
  const maxBodyBytes = 8 * 1024 * 1024;

  it("allows the configured development origin and blocks others", async () => {
    const allowed = await app.request("/health", { headers: { origin: "http://localhost:5173" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const blocked = await app.request("/health", { headers: { origin: "http://evil.example" } });
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects oversized bodies before parsing them", async () => {
    const res = await app.request("/health", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(maxBodyBytes + 1) },
    });
    expect(res.status).toBe(413);
  });

  it("rejects invalid dates instead of storing an Invalid Date", async () => {
    const res = await app.request("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        claim: {
          id: "c1",
          text: "test",
          subjectNodeId: "n1",
          assertedAt: "not-a-date",
          supportingSourceIds: [],
          contradictingSourceIds: [],
          extractionConfidence: 0.5,
        },
        allSources: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects oversized evidence text", async () => {
    const res = await app.request("/evidence/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "a".repeat(100001), nodes: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects oversized graphs before traversal", async () => {
    const res = await app.request("/blast-radius", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph: { nodes: Array.from({ length: 2001 }, (_, i) => node(`n${i}`)), edges: [] },
        disruptedNode: "n0",
      }),
    });
    expect(res.status).toBe(400);
  });
});

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
