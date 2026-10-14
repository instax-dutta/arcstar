import { describe, expect, it } from "vitest";
import { blastRadius } from "@arcstar/graph";
import { maritimeGraph } from "./data/maritime.js";

describe("curated maritime graph", () => {
  it("propagates a Hormuz disruption to dependent routes and producers", () => {
    const results = blastRadius(maritimeGraph(), "hormuz", { maxHops: 2 }).map((r) => r.node);
    expect(results).toContain("qatar");
    expect(results).toContain("saudi");
    expect(results).toContain("uae");
    expect(results).toContain("shipping-route");
  });

  it("does not treat the disrupted node as its own result", () => {
    const results = blastRadius(maritimeGraph(), "hormuz").map((r) => r.node);
    expect(results).not.toContain("hormuz");
  });
});
