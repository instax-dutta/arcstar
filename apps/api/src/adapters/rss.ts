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
      const publishedAt = new Date(published);
      if (Number.isNaN(publishedAt.getTime())) {
        throw new Error(`invalid pubDate "${published}"`);
      }
      return {
        title: tagContent(item, "title"),
        link: tagContent(item, "link"),
        publishedAt,
      };
    }),
  };
}
