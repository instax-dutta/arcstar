import { describe, expect, it } from "vitest";
import { extractClaimCandidates, extractEntitySpans, normalizeText, sentenceSpans } from "./index.js";

describe("normalizeText", () => {
  it("normalizes unicode and whitespace without changing words", () => {
    expect(normalizeText("  Cafe\u0301\t\tManagement\n\n\n\n  ")).toBe("Café Management");
  });
});

describe("sentenceSpans", () => {
  it("splits sentences and keeps a trailing unterminated sentence", () => {
    const spans = sentenceSpans("Port delays rose. Suez transit halts. Watch next week");
    expect(spans).toHaveLength(3);
    const first = "Port delays rose. Suez transit halts. Watch next week".slice(spans[0]!.start, spans[0]!.end);
    expect(first).toBe("Port delays rose.");
  });

  it("returns nothing for whitespace input", () => {
    expect(sentenceSpans("   \n ")).toHaveLength(0);
  });
});

describe("extractClaimCandidates", () => {
  it("returns candidates with offset-stable sentences and triggers", () => {
    const text = "Silence is golden. Suez transit halts. The port expects recovery.";
    const candidates = extractClaimCandidates(text);
    expect(candidates).toHaveLength(2);
    expect(text.slice(candidates[0]!.start, candidates[0]!.end)).toBe("Suez transit halts.");
    expect(candidates.map((c) => c.trigger)).toEqual(["halt", "expects"]);
    expect(candidates[0]!.id).toBe(`candidate-${candidates[0]!.start}-${candidates[0]!.end}`);
  });
});

describe("extractEntitySpans", () => {
  it("matches labels and aliases case-insensitively on word boundaries", () => {
    const text = "Suez transit affects Suez and the wider corridor; not suezian.";
    const spans = extractEntitySpans(text, [
      { id: "chokepoint/suez", label: "Suez", aliases: ["The Canal"] },
      { id: "chokepoint/duplicate", label: "Suez" },
      { id: "chokepoint/empty", label: "" },
    ]);
    expect(spans).toHaveLength(4);
    expect(spans.map((s) => s.termId).slice(0, 2)).toEqual(["chokepoint/suez", "chokepoint/duplicate"]);
    expect(text.slice(spans[0]!.start, spans[0]!.end)).toBe("Suez");
  });
});
