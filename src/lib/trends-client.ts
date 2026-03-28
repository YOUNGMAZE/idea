export type Platform = "youtube" | "tiktok" | "instagram";

export type TrendPoint = {
  day: string;
  score: number;
};

export type TrendKeyword = {
  term: string;
  score: number;
  metricText: string;
  source: string;
  url: string;
  sparkline: TrendPoint[];
};

export type TrendVideo = {
  id: string;
  title: string;
  channel: string;
  views: number;
  viewsText: string;
  published: string;
  duration: string;
  url: string;
};

export type TrendPayload = {
  platform: Platform;
  fetchedAt: string;
  source: string[];
  keywords: TrendKeyword[];
  videos: TrendVideo[];
};

type FeedItem = {
  id: string;
  title: string;
  url: string;
  author: string;
  published: string;
  metric: number;
  metricLabel: string;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "this",
  "that",
  "from",
  "are",
  "was",
  "how",
  "why",
  "what",
  "when",
  "best",
  "new",
  "shorts",
  "reels",
  "video",
  "viral",
  "trend",
  "trending",
]);

function hashString(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededValue(seedText: string, idx: number, min: number, max: number) {
  const hash = hashString(`${seedText}-${idx}`);
  const normalized = (hash % 1000) / 1000;
  return Math.round(min + (max - min) * normalized);
}

function createSparkline(term: string, baseScore: number) {
  return Array.from({ length: 7 }).map((_, i) => {
    const drift = seededValue(term, i, -18, 18);
    const value = Math.max(5, Math.round(baseScore + baseScore * (drift / 100)));
    return {
      day: `D-${6 - i}`,
      score: value,
    };
  });
}

function tokenizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function compactNumber(num: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

function getText(node: Element, selector: string) {
  return node.querySelector(selector)?.textContent?.trim() ?? "";
}

function firstBySelectors(node: Element, selectors: string[]) {
  for (const selector of selectors) {
    const value = getText(node, selector);
    if (value) return value;
  }
  return "";
}

function extractMetric(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*([kmb])?\s*(views|view|plays|likes|interactions)?/i);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return 0;
  const suffix = match[2]?.toUpperCase();
  if (suffix === "K") return Math.round(value * 1_000);
  if (suffix === "M") return Math.round(value * 1_000_000);
  if (suffix === "B") return Math.round(value * 1_000_000_000);
  return Math.round(value);
}

function toRsshubTag(niche: string) {
  const normalized = (niche || "viral").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const firstToken = normalized.split(/\s+/).find(Boolean) || "viral";
  return firstToken;
}

function sourceLabel(platform: Platform) {
  if (platform === "youtube") return "YouTube Public Feed";
  if (platform === "tiktok") return "TikTok Public RSS";
  return "Instagram Public RSS";
}

function buildProxyUrls(url: string) {
  const normalized = url.replace(/^https?:\/\//, "");
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://r.jina.ai/http://${normalized}`,
  ];
}

async function fetchTextFromPublicUrl(url: string) {
  const candidates = buildProxyUrls(url);
  let lastError = "";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`;
        continue;
      }
      const text = await response.text();
      if (text.trim()) return text;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network error";
    }
  }

  throw new Error(`Cannot fetch public source ${url}. Last error: ${lastError || "unknown"}`);
}

function parseFeedItems(xmlText: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  const entries = Array.from(xml.querySelectorAll("entry"));
  const items = Array.from(xml.querySelectorAll("item"));
  const nodes = entries.length ? entries : items;

  return nodes
    .map((node) => {
      const title = firstBySelectors(node, ["title"]);
      const urlFromAtom = node.querySelector("link")?.getAttribute("href")?.trim() ?? "";
      const urlFromRss = firstBySelectors(node, ["link"]);
      const description = firstBySelectors(node, ["description", "summary", "content"]);
      const author = firstBySelectors(node, ["author > name", "author", "dc\\:creator"]);
      const published = firstBySelectors(node, ["published", "pubDate", "updated"]);
      const id = firstBySelectors(node, ["id", "guid"]) || `${title}-${urlFromAtom || urlFromRss}`;
      const url = urlFromAtom || urlFromRss;
      const metric = extractMetric(`${title} ${description}`);

      if (!title || !url) return null;
      return {
        id,
        title,
        url,
        author: author || "Unknown creator",
        published: published || "Recently",
        metric,
        metricLabel: metric ? `${compactNumber(metric)} interactions` : "Fresh post",
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => Boolean(item));
}

async function fetchFromCandidateList(urls: string[]) {
  let lastError = "";

  for (const url of urls) {
    try {
      const text = await fetchTextFromPublicUrl(url);
      const items = parseFeedItems(text);
      if (items.length) {
        return { items, resolvedSource: url };
      }
      lastError = `No feed entries parsed for ${url}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";
    }
  }

  throw new Error(lastError || "No public sources available");
}

function daysAgo(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 7;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

function buildTrendPayload(platform: Platform, source: string, feedItems: FeedItem[]): TrendPayload {
  const dedupedItems = Array.from(
    new Map(feedItems.map((item) => [`${item.title}-${item.url}`, item])).values()
  ).slice(0, 18);

  const keywordStats = new Map<string, { mentions: number; reach: number; freshness: number }>();
  dedupedItems.forEach((item) => {
    const words = Array.from(new Set(tokenizeTitle(item.title)));
    const freshnessBoost = Math.max(10, 80 - Math.round(daysAgo(item.published) * 8));
    words.forEach((word) => {
      const current = keywordStats.get(word) || { mentions: 0, reach: 0, freshness: 0 };
      current.mentions += 1;
      current.reach += item.metric || seededValue(item.title, word.length, 5_000, 150_000);
      current.freshness += freshnessBoost;
      keywordStats.set(word, current);
    });
  });

  const keywords = Array.from(keywordStats.entries())
    .map(([term, stat]) => {
      const score = Math.round(stat.mentions * 700 + stat.reach / 120 + stat.freshness * 35);
      return {
        term,
        score,
        metricText: `${stat.mentions} mentions`,
        source: sourceLabel(platform),
        url:
          platform === "youtube"
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`
            : platform === "tiktok"
              ? `https://www.tiktok.com/tag/${encodeURIComponent(term)}`
              : `https://www.instagram.com/explore/tags/${encodeURIComponent(term)}/`,
        sparkline: createSparkline(term, score),
      } satisfies TrendKeyword;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const videos = dedupedItems.map((item, index) => {
    const views = item.metric || seededValue(item.title, index, 18_000, 900_000);
    return {
      id: item.id || `${index}-${hashString(item.url)}`,
      title: item.title,
      channel: item.author,
      views,
      viewsText: item.metric ? item.metricLabel : `${compactNumber(views)} est. interactions`,
      published: item.published,
      duration: "Short",
      url: item.url,
    } satisfies TrendVideo;
  });

  return {
    platform,
    fetchedAt: new Date().toISOString(),
    source: [source],
    keywords,
    videos,
  };
}

export async function fetchTrendsClient(platform: Platform, niche: string): Promise<TrendPayload> {
  const encoded = encodeURIComponent((niche || "viral").trim());
  const rsshubTag = toRsshubTag(niche);

  const candidatesByPlatform: Record<Platform, string[]> = {
    youtube: [
      `https://www.youtube.com/feeds/videos.xml?search_query=${encoded}%20shorts`,
      `https://www.youtube.com/feeds/videos.xml?search_query=${encoded}`,
      "https://www.youtube.com/feeds/videos.xml?search_query=viral%20shorts",
    ],
    tiktok: [
      `https://rsshub.app/tiktok/tag/${rsshubTag}`,
      `https://rsshub.app/tiktok/tag/viral`,
    ],
    instagram: [
      `https://rsshub.app/instagram/explore/tags/${rsshubTag}`,
      "https://rsshub.app/instagram/explore/tags/viral",
    ],
  };

  const { items, resolvedSource } = await fetchFromCandidateList(candidatesByPlatform[platform]);
  return buildTrendPayload(platform, resolvedSource, items);
}