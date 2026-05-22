import "server-only";

export type MarketSignal = {
  source: string;
  title: string;
  snippet: string;
  url: string;
  publishedAt: string;
  category: "review" | "job_posting" | "news" | "competitor";
};

export type ScanResult = {
  scannedAt: string;
  signals: MarketSignal[];
  sourceCount: number;
};

const RSS_SOURCES = [
  {
    url: "https://news.google.com/rss/search?q=clinique+esthétique+québec&hl=fr-CA&gl=CA&ceid=CA:fr",
    label: "Google News QC",
    category: "news" as const,
  },
  {
    url: "https://news.google.com/rss/search?q=aesthetic+clinic+ontario&hl=en-CA&gl=CA&ceid=CA:en",
    label: "Google News ON",
    category: "news" as const,
  },
  {
    url: "https://news.google.com/rss/search?q=botox+laser+clinique+beauté+tendance&hl=fr-CA&gl=CA&ceid=CA:fr",
    label: "Google News Tendances",
    category: "news" as const,
  },
];

function extractText(xml: string, tag: string): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const cdataStart = "<![CDATA[";
  const cdataEnd = "]]>";

  const start = xml.indexOf(open);
  if (start === -1) return "";

  const end = xml.indexOf(close, start);
  if (end === -1) return "";

  let content = xml.slice(start + open.length, end).trim();

  if (content.startsWith(cdataStart)) {
    content = content.slice(cdataStart.length);
    const cdataClose = content.indexOf(cdataEnd);
    if (cdataClose !== -1) content = content.slice(0, cdataClose);
  }

  return content.replace(/<[^>]+>/g, "").trim();
}

function parseItems(xml: string, category: MarketSignal["category"]): MarketSignal[] {
  const items: MarketSignal[] = [];
  let cursor = 0;

  while (cursor < xml.length) {
    const itemStart = xml.indexOf("<item>", cursor);
    if (itemStart === -1) break;
    const itemEnd = xml.indexOf("</item>", itemStart);
    if (itemEnd === -1) break;

    const chunk = xml.slice(itemStart, itemEnd + 7);

    const title = extractText(chunk, "title");
    const link = extractText(chunk, "link") || extractText(chunk, "guid");
    const description = extractText(chunk, "description");
    const pubDate = extractText(chunk, "pubDate");

    if (title && link) {
      items.push({
        source: "rss",
        title,
        snippet: description.slice(0, 300),
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        category,
      });
    }

    cursor = itemEnd + 7;
  }

  return items;
}

async function fetchRssSignals(
  source: (typeof RSS_SOURCES)[number],
  maxItems = 5,
): Promise<MarketSignal[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "Oria-Market-Scout/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const xml = await res.text();
    return parseItems(xml, source.category).slice(0, maxItems);
  } catch {
    return [];
  }
}

export async function runMarketScan(workspaceId = "michael-hq"): Promise<ScanResult> {
  void workspaceId;

  const results = await Promise.allSettled(RSS_SOURCES.map((src) => fetchRssSignals(src, 5)));

  const signals: MarketSignal[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      signals.push(...result.value);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = signals.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  // Sort newest first
  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return {
    scannedAt: new Date().toISOString(),
    signals: unique,
    sourceCount: RSS_SOURCES.length,
  };
}
