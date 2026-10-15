import { createHash } from "node:crypto";
import { SourceSchema, type SourceTier } from "@arcstar/contracts";
import type { FeedItem } from "./adapters/rss.js";
import type { Repositories } from "./repositories/types.js";

export interface IngestInput {
  channelTitle: string;
  tier: SourceTier;
  items: FeedItem[];
}

export interface IngestResult {
  stored: number;
  duplicates: number;
  skipped: number;
  sourceIds: string[];
  invalid: Array<{ link?: string; reason: string }>;
}

const TRACKING_PARAM = /^(utm_.*|gclid|fbclid|mc_cid|mc_eid|igshid|ref|ref_src)$/i;

/**
 * Canonicalize a URL for identity while retaining semantic query parameters.
 * Tracking parameters are dropped, host/protocol are normalized, and remaining
 * parameters are sorted so ordering cannot create a duplicate source.
 */
export function normalizeCanonicalUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`invalid URL "${rawUrl}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported URL protocol "${url.protocol}"`);
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "80" || url.port === "443") url.port = "";
  url.hash = "";

  const semantic = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [key, value] of semantic) url.searchParams.append(key, value);

  return url.toString();
}

/**
 * Document identity precedence: provider GUID when present, otherwise canonical URL.
 * The raw observed link is not used as an identity so tracking variants do not
 * create duplicate sources.
 */
export function sourceIdForUrl(url: string, guid?: string): string {
  const identity = guid && guid.trim().length > 0 ? `guid:${guid.trim()}` : `url:${normalizeCanonicalUrl(url)}`;
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 40);
  return `rss-${digest}`;
}

export function feedItemToSource(item: FeedItem, input: IngestInput) {
  return SourceSchema.parse({
    id: sourceIdForUrl(item.link, item.guid),
    publisher: input.channelTitle,
    tier: input.tier,
    publishedAt: item.publishedAt,
    citesSourceIds: [],
  });
}

export async function ingestFeedItems(repos: Repositories, input: IngestInput): Promise<IngestResult> {
  let stored = 0;
  let duplicates = 0;
  let skipped = 0;
  const sourceIds: string[] = [];
  const invalid: IngestResult["invalid"] = [];
  const seen = new Set<string>();

  for (const item of input.items) {
    let id: string;
    try {
      id = sourceIdForUrl(item.link, item.guid);
    } catch (error) {
      skipped += 1;
      invalid.push({ link: item.link, reason: error instanceof Error ? error.message : "unknown error" });
      continue;
    }

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

  return { stored, duplicates, skipped, sourceIds, invalid };
}
