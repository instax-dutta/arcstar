import { describe, expect, it } from "vitest";
import type { Node } from "@arcstar/contracts";
import { extractEvidence } from "./extractEvidence.js";

const nodes: Node[] = [
  { id: "chokepoint/suez", type: "chokepoint", label: "Suez Canal", props: { aliases: ["Suez"] } },
  { id: "company/maersk", type: "company", label: "Maersk", props: {} },
];

describe("extractEvidence", () => {
  it("produces candidates and entity spans for graph terms", () => {
    const text = "Freight rates spiked after Suez transit halts. Maersk confirms rerouting.";
    const result = extractEvidence(text, nodes);
    expect(result.normalizedText).toBe(text);
    expect(result.candidates).toHaveLength(2);
    expect(result.entitySpans.map((s) => s.termId)).toEqual(["chokepoint/suez", "company/maersk"]);
  });
});
