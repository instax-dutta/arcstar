export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date;
}

function tagContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return (match?.[1] ?? "").trim();
}

export function parseRss(xml: string): FeedItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => {
    const published = tagContent(item, "pubDate");
    return {
      title: tagContent(item, "title"),
      link: tagContent(item, "link"),
      publishedAt: new Date(published),
    };
  });
}
