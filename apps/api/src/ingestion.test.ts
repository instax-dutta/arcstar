import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestFeedItems } from "./ingestion.js";
import { parseFeed } from "./adapters/rss.js";
import { createInMemoryRepositories } from "./repositories/inMemory.js";

describe("feed ingestion", () => {
  const xml = readFileSync(resolve(process.cwd(), "src", "adapters", "__fixtures__", "sample-rss.xml"), "utf8");
  const feed = parseFeed(xml);

  it("stores normalized sources idempotently", async () => {
    const repos = createInMemoryRepositories();
    const first = await ingestFeedItems(repos, { channelTitle: feed.channelTitle, tier: 2, items: feed.items });
    const second = await ingestFeedItems(repos, { channelTitle: feed.channelTitle, tier: 2, items: feed.items });
    expect(first.stored).toBe(2);
    expect(second.stored).toBe(0);
    expect((await repos.sources.list()).length).toBe(2);
    const ids = first.sourceIds;
    const repeat = await repos.sources.get(ids[0] ?? "");
    expect(repeat?.publisher).toBe("Sample Feed");
  });

  it("is idempotent per link across channel titles", async () => {
    const repos = createInMemoryRepositories();
    await ingestFeedItems(repos, { channelTitle: "Feed A", tier: 2, items: feed.items.slice(0, 1) });
    await ingestFeedItems(repos, { channelTitle: "Feed B", tier: 2, items: feed.items.slice(0, 1) });
    expect((await repos.sources.list()).length).toBe(1);
  });
});
