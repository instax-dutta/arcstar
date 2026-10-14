import { createHash } from "node:crypto";
import { SourceSchema, type SourceTier } from "@arcstar/contracts";
import type { FeedItem } from "./adapters/rss.js";
import type { Repositories } from "./repositories/types.js";

export interface IngestInput {
  channelTitle: string;
  tier?: SourceTier;
  items: FeedItem[];
}

export interface IngestResult {
  stored: number;
  duplicates: number;
  sourceIds: string[];
}

/** Deterministic id so re-ingesting the same link is idempotent, not a duplicate row. */
export function sourceIdForUrl(url: string): string {
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return `rss-${digest}`;
}

export function feedItemToSource(item: FeedItem, input: IngestInput) {
  return SourceSchema.parse({
    id: sourceIdForUrl(item.link),
    publisher: input.channelTitle,
    tier: input.tier ?? 3,
    publishedAt: item.publishedAt,
    citesSourceIds: [],
  });
}

export async function ingestFeedItems(repos: Repositories, input: IngestInput): Promise<IngestResult> {
  let stored = 0;
  let duplicates = 0;
  const sourceIds: string[] = [];
  const seen = new Set<string>();

  for (const item of input.items) {
    if (!item.link) continue;
    const id = sourceIdForUrl(item.link);
    sourceIds.push(id);
    if (seen.has(id)) {
      duplicates += 1;
      continue;
    }
    seen.add(id);

    const existing = await repos.sources.get(id);
    if (existing) {
      duplicates += 1;
      continue;
    }

    await repos.sources.upsert(feedItemToSource(item, input));
    stored += 1;
  }

  return { stored, duplicates, sourceIds };
}
