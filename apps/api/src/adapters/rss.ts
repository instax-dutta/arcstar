import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date;
  guid?: string;
}

export interface ParsedFeed {
  channelTitle: string;
  items: FeedItem[];
  invalidItems: Array<{ index: number; reason: string }>;
}

type XmlValue = string | number | boolean | null | undefined | { [key: string]: XmlValue } | XmlValue[];

function textValue(value: XmlValue): string | undefined {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const node = value as Record<string, XmlValue>;
    const text = node["#text"];
    if (typeof text === "string") return text.trim();
    if (Array.isArray(text) && typeof text[0] === "string") return text[0].trim();
  }
  return undefined;
}

function linkValue(value: XmlValue): string | undefined {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const node = value as Record<string, XmlValue>;
    const href = node["@_href"];
    if (typeof href === "string") return href.trim();
  }
  return undefined;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toDate(raw: string | undefined): Date {
  if (raw === undefined || raw.length === 0) throw new Error("missing publication date");
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid publication date "${raw}"`);
  return parsed;
}

function mapItem(index: number, item: XmlValue): FeedItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("item is not an object");
  }
  const node = item as Record<string, XmlValue>;
  const title = textValue(node["title"]);
  const link = linkValue(node["link"]);
  const guid = textValue(node["guid"]);
  const published = toDate(textValue(node["pubDate"]) ?? textValue(node["published"]) ?? textValue(node["updated"]));

  if (!title) throw new Error("missing title");
  if (!link) throw new Error("missing link");

  return { title, link, publishedAt: published, guid };
}

export function parseFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: false,
    trimValues: true,
    allowBooleanAttributes: false,
  });

  let document: Record<string, XmlValue>;
  try {
    const parsed: unknown = parser.parse(xml);
    if (!parsed || typeof parsed !== "object") throw new Error("document is not an object");
    document = parsed as Record<string, XmlValue>;
  } catch (error) {
    throw new Error(`unsupported or malformed feed: ${error instanceof Error ? error.message : "unknown parse error"}`, {
      cause: error,
    });
  }

  const rss = document["rss"] as Record<string, XmlValue> | undefined;
  const atom = document["feed"] as Record<string, XmlValue> | undefined;
  if (!rss && !atom) throw new Error("unsupported feed format: expected rss or feed");

  const channelTitle = textValue(
    rss ? (rss["channel"] as Record<string, XmlValue> | undefined)?.["title"] : atom?.["title"],
  );
  const rawItems = rss
    ? toArray((rss["channel"] as Record<string, XmlValue> | undefined)?.["item"] as XmlValue)
    : toArray(atom?.["entry"] as XmlValue);

  const items: FeedItem[] = [];
  const invalidItems: ParsedFeed["invalidItems"] = [];
  rawItems.forEach((rawItem, index) => {
    try {
      items.push(mapItem(index, rawItem));
    } catch (error) {
      invalidItems.push({ index, reason: error instanceof Error ? error.message : "unknown item error" });
    }
  });

  return { channelTitle: channelTitle ?? "", items, invalidItems };
}
