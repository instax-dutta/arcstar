import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFeed } from "./rss.js";

describe("rss adapter", () => {
  const xml = readFileSync(resolve(process.cwd(), "src", "adapters", "__fixtures__", "sample-rss.xml"), "utf8");

  it("parses recorded feed fixtures without network access", () => {
    const feed = parseFeed(xml);
    expect(feed.channelTitle).toBe("Sample Feed");
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]?.title).toBe("Transit disruption report");
    expect(feed.items[0]?.publishedAt.toISOString()).toBe("2026-10-14T09:00:00.000Z");
  });

  it("rejects invalid pubDates instead of storing an invalid date", () => {
    expect(() => parseFeed("<rss><channel><item><title>x</title><pubDate>not a date</pubDate></item></channel></rss>")).toThrow(/invalid pubDate/);
  });
});
