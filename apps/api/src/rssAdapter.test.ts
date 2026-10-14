import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRss } from "./adapters/rss.js";

describe("rss adapter", () => {
  it("parses recorded feed fixtures without network access", () => {
    const xml = readFileSync(resolve(process.cwd(), "src", "adapters", "__fixtures__", "sample-rss.xml"), "utf8");
    const items = parseRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("Transit disruption report");
    expect(items[0]?.publishedAt.toISOString()).toBe("2026-10-14T09:00:00.000Z");
  });
});
