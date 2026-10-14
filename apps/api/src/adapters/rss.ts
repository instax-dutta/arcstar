export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date;
}

export interface ParsedFeed {
  channelTitle: string;
  items: FeedItem[];
}

function tagContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return (match?.[1] ?? "").trim();
}

export function parseFeed(xml: string): ParsedFeed {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return {
    channelTitle: tagContent(xml, "title"),
    items: items.map((item) => {
      const published = tagContent(item, "pubDate");
      return {
        title: tagContent(item, "title"),
        link: tagContent(item, "link"),
        publishedAt: new Date(published),
      };
    }),
  };
}

export function parseRss(xml: string): FeedItem[] {
  return parseFeed(xml).items;
}
