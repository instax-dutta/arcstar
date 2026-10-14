import { describe, expect, it } from "vitest";
import { ClaimEvidenceSchema, SourceLineageSchema } from "./index.js";

describe("ClaimEvidenceSchema", () => {
  it("accepts explicit passage evidence", () => {
    const parsed = ClaimEvidenceSchema.parse({
      claimId: "c1",
      sourceId: "s1",
      stance: "supports",
      passage: "Transit fell 40%.",
      passageStart: 0,
      passageEnd: 18,
    });
    expect(parsed.stance).toBe("supports");
  });

  it("rejects a negative passage offset", () => {
    expect(() =>
      ClaimEvidenceSchema.parse({
        claimId: "c1",
        sourceId: "s1",
        stance: "supports",
        passage: "x",
        passageStart: -1,
      }),
    ).toThrow();
  });
});

describe("SourceLineageSchema", () => {
  it("requires an explicit verification state", () => {
    const parsed = SourceLineageSchema.parse({
      fromSourceId: "a",
      toSourceId: "b",
      kind: "cites",
      status: "verified",
    });
    expect(parsed.kind).toBe("cites");
  });
});
