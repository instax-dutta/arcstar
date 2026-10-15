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
    expect(feed.invalidItems).toEqual([]);
  });

  it("parses CDATA and entities while keeping valid items", () => {
    const mixed = readFileSync(resolve(process.cwd(), "src", "adapters", "__fixtures__", "mixed-rss.xml"), "utf8");
    const feed = parseFeed(mixed);
    expect(feed.items.map((item) => item.link)).toEqual(["https://example.com/cdata", "https://example.com/valid"]);
    expect(feed.items[0]?.title).toBe("CDATA &amp; entity title");
    expect(feed.invalidItems).toEqual([{ index: 1, reason: 'invalid publication date "definitely not a date"' }]);
  });

  it("parses atom feeds", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Feed</title><entry><title>Atom entry</title><link href="https://example.com/atom"/><updated>2026-10-14T09:00:00Z</updated></entry></feed>`;
    const feed = parseFeed(atom);
    expect(feed.channelTitle).toBe("Atom Feed");
    expect(feed.items[0]?.link).toBe("https://example.com/atom");
  });

  it("decodes ordinary entities", () => {
    const feed = parseFeed("<rss><channel><title>x</title><item><title>Tom &amp; Jerry</title><link>https://example.com/x</link><pubDate>Tue, 14 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>");
    expect(feed.items[0]?.title).toBe("Tom & Jerry");
  });

  it("rejects unsupported or malformed feed documents instead of returning empty success", () => {
    expect(() => parseFeed("<html><body>nope</body></html>")).toThrow(/unsupported feed format/);
    expect(() => parseFeed("<rss><channel><item><title>x</title></item></channel>")).not.toThrow();
  });
});
