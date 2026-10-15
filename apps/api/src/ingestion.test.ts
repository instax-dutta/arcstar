import { describe, expect, it } from "vitest";
import { ingestFeedItems, normalizeCanonicalUrl, sourceIdForUrl } from "./ingestion.js";
import { createInMemoryRepositories } from "./repositories/inMemory.js";

const item = (link: string, guid?: string) => ({
  title: "Transit disruption report",
  link,
  publishedAt: new Date("2026-10-14T09:00:00Z"),
  guid,
});

describe("feed ingestion identity", () => {
  it("drops tracking parameters and sorts semantic parameters", () => {
    expect(normalizeCanonicalUrl("HTTP://Example.com:80/a?utm_source=x&b=2&a=1#top")).toBe(
      "http://example.com/a?a=1&b=2",
    );
    expect(normalizeCanonicalUrl("https://example.com/a?b=2&a=1")).toBe("https://example.com/a?a=1&b=2");
  });

  it("prefers a provider guid when one is present", () => {
    expect(sourceIdForUrl("https://example.com/a", "guid-1")).toBe(sourceIdForUrl("https://other.example/b", "guid-1"));
  });

  it("stores normalized sources idempotently and does not duplicate tracking variants", async () => {
    const repos = createInMemoryRepositories();
    const first = await ingestFeedItems(repos, {
      channelTitle: "Sample Feed",
      tier: 2,
      items: [item("https://example.com/a?utm_source=x"), item("https://example.com/a")],
    });
    expect(first.stored).toBe(1);
    expect(first.duplicates).toBe(1);

    const second = await ingestFeedItems(repos, { channelTitle: "Other Feed", tier: 3, items: [item("https://example.com/a")] });
    expect(second.stored).toBe(0);

    const sources = await repos.sources.list();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.publisher).toBe("Sample Feed");
  });

  it("skips invalid URLs without stopping valid ingestion", async () => {
    const repos = createInMemoryRepositories();
    const result = await ingestFeedItems(repos, {
      channelTitle: "Sample Feed",
      tier: 2,
      items: [item("not-a-url"), item("https://example.com/good")],
    });
    expect(result.stored).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.invalid[0]?.reason).toContain("invalid URL");
  });
});
