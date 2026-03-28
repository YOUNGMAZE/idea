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

type FeedFetchResult = {
  items: FeedItem[];
  resolvedSource: string;
  errors: string[];
};

const CACHE_TTL_MS = 1000 * 60 * 30;

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
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(num);
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
  if (platform === "youtube") return "Публичный фид YouTube";
  if (platform === "tiktok") return "Публичный RSS TikTok";
  return "Публичный RSS Instagram";
}

function buildProxyUrls(url: string) {
  const normalized = url.replace(/^https?:\/\//, "");
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://cors.isomorphic-git.org/${url}`,
    `https://r.jina.ai/http://${normalized}`,
  ];
}

async function fetchTextFromPublicUrl(url: string) {
  const candidates = buildProxyUrls(url);
  let lastError = "";

  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch(candidate, { signal: controller.signal });
      window.clearTimeout(timeout);
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

  throw new Error(`Не удалось получить публичный источник ${url}. Последняя ошибка: ${lastError || "неизвестно"}`);
}

function unwrapProxyPayload(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as {
        contents?: string;
        data?: { contents?: string };
      };
      if (typeof data.contents === "string") return data.contents;
      if (typeof data.data?.contents === "string") return data.data.contents;
    } catch {
      // Keep original text if JSON parsing fails.
    }
    return trimmed;
  }

  const rssStart = trimmed.indexOf("<rss");
  const feedStart = trimmed.indexOf("<feed");
  const start = rssStart >= 0 ? rssStart : feedStart;
  if (start >= 0) {
    const xmlPart = trimmed.slice(start);
    const closeTag = xmlPart.includes("</rss>") ? "</rss>" : "</feed>";
    const endIndex = xmlPart.lastIndexOf(closeTag);
    if (endIndex >= 0) {
      return xmlPart.slice(0, endIndex + closeTag.length);
    }
    return xmlPart;
  }

  return trimmed;
}

function parseFeedItems(xmlText: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  if (xml.querySelector("parsererror")) return [];
  const entries = Array.from(xml.querySelectorAll("entry"));
  const items = Array.from(xml.querySelectorAll("item"));
  const nodes = entries.length ? entries : items;

  return nodes
    .map((node) => {
      const title = firstBySelectors(node, ["title"]);
      const linkElement = node.querySelector("link");
      const urlFromAtom = linkElement?.getAttribute("href")?.trim() ?? "";
      const urlFromAtomAlt =
        Array.from(node.querySelectorAll("link"))
          .find((link) => link.getAttribute("rel") === "alternate")
          ?.getAttribute("href")
          ?.trim() ?? "";
      const urlFromRss = firstBySelectors(node, ["link"]);
      const enclosure = node.querySelector("enclosure")?.getAttribute("url")?.trim() ?? "";
      const description = firstBySelectors(node, ["description", "summary", "content"]);
      const author = firstBySelectors(node, ["author > name", "author", "dc\\:creator"]);
      const published = firstBySelectors(node, ["published", "pubDate", "updated"]);
      const id = firstBySelectors(node, ["id", "guid"]) || `${title}-${urlFromAtom || urlFromRss}`;
      const url = urlFromAtom || urlFromAtomAlt || urlFromRss || enclosure;
      const metric = extractMetric(`${title} ${description}`);

      if (!title || !url) return null;
      return {
        id,
        title,
        url,
        author: author || "Неизвестный автор",
        published: published || "Недавно",
        metric,
        metricLabel: metric ? `${compactNumber(metric)} взаимодействий` : "Свежая публикация",
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => Boolean(item));
}

function parseJsonFeedItems(jsonText: string): FeedItem[] {
  try {
    const data = JSON.parse(jsonText) as {
      status?: string;
      message?: string;
      contents?: string;
      items?: Array<{
        title?: string;
        link?: string;
        guid?: string;
        id?: string;
        pubDate?: string;
        published?: string;
        author?: string;
        creator?: string;
        description?: string;
        content?: string;
      }>;
      feed?: {
        entries?: Array<{
          title?: string;
          link?: string;
          id?: string;
          published?: string;
          author?: string;
          content?: string;
        }>;
      };
    };

    if (typeof data.contents === "string") {
      return parseFeedFromAnyText(data.contents);
    }

    if (data.status && data.status !== "ok" && !data.items?.length && !data.feed?.entries?.length) {
      return [];
    }

    const items = [
      ...(data.items || []),
      ...((data.feed?.entries || []).map((entry) => ({
        title: entry.title,
        link: entry.link,
        id: entry.id,
        published: entry.published,
        author: entry.author,
        content: entry.content,
      })) as Array<{
        title?: string;
        link?: string;
        guid?: string;
        id?: string;
        pubDate?: string;
        published?: string;
        author?: string;
        creator?: string;
        description?: string;
        content?: string;
      }>),
    ];

    return items
      .map((item) => {
        const title = item.title?.trim() || "";
        const url = item.link?.trim() || "";
        if (!title || !url) return null;
        const description = item.description || item.content || "";
        const metric = extractMetric(`${title} ${description}`);
        return {
          id: item.guid?.trim() || item.id?.trim() || `${title}-${url}`,
          title,
          url,
          author: item.author?.trim() || item.creator?.trim() || "Неизвестный автор",
          published: item.pubDate?.trim() || item.published?.trim() || "Недавно",
          metric,
          metricLabel: metric ? `${compactNumber(metric)} взаимодействий` : "Свежая публикация",
        } satisfies FeedItem;
      })
      .filter((item): item is FeedItem => Boolean(item));
  } catch {
    return [];
  }
}

function parseFeedFromAnyText(rawText: string): FeedItem[] {
  const normalized = unwrapProxyPayload(rawText);
  if (!normalized) return [];
  if (normalized.startsWith("{")) {
    return parseJsonFeedItems(normalized);
  }
  return parseFeedItems(normalized);
}

async function fetchFromCandidateList(urls: string[]): Promise<FeedFetchResult> {
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const text = await fetchTextFromPublicUrl(url);
      const items = parseFeedFromAnyText(text);
      if (items.length) {
        return { items, resolvedSource: url, errors };
      }
      errors.push(`Не удалось распарсить записи фида для ${url}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Неизвестная ошибка для ${url}`);
    }
  }

  throw new Error(errors[errors.length - 1] || "Нет доступных публичных источников");
}

function buildGoogleNewsRss(platform: Platform, niche: string) {
  const queryBase = (niche || "viral").trim();
  const platformQuery =
    platform === "youtube"
      ? "site:youtube.com/shorts OR site:youtube.com/watch"
      : platform === "tiktok"
        ? "site:tiktok.com"
        : "site:instagram.com/reel OR site:instagram.com/explore/tags";

  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${queryBase} ${platformQuery}`)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildResilienceItems(platform: Platform, niche: string): FeedItem[] {
  const baseNiche = (niche || "вирусный контент").trim();
  const platformTerms =
    platform === "youtube"
      ? ["shorts", "challenge", "reaction", "tutorial", "before after", "myth busting"]
      : platform === "tiktok"
        ? ["trend sound", "transformation", "daily habit", "duet", "behind the scenes", "storytime"]
        : ["reel edit", "hook", "carousel to reel", "voiceover", "micro lesson", "b roll"];

  return platformTerms.map((term, index) => {
    const title = `${baseNiche} ${term} идея ${index + 1}`;
    const metric = seededValue(`${platform}-${baseNiche}`, index, 18_000, 320_000);
    const route =
      platform === "youtube"
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${baseNiche} ${term}`)}`
        : platform === "tiktok"
          ? `https://www.tiktok.com/tag/${encodeURIComponent(baseNiche.split(" ")[0] || "viral")}`
          : `https://www.instagram.com/explore/tags/${encodeURIComponent(baseNiche.split(" ")[0] || "viral")}/`;

    return {
      id: `${platform}-${index}-${hashString(title)}`,
      title,
      url: route,
      author: "Публичная тренд-подборка",
      published: new Date(Date.now() - index * 1000 * 60 * 60 * 8).toISOString(),
      metric,
      metricLabel: `${compactNumber(metric)} оценка взаимодействий`,
    };
  });
}

function cacheKey(platform: Platform, niche: string) {
  return `trendstudio:cache:${platform}:${niche.toLowerCase().trim()}`;
}

export function getCachedTrends(platform: Platform, niche: string): TrendPayload | null {
  try {
    const raw = localStorage.getItem(cacheKey(platform, niche));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt: number; data: TrendPayload };
    if (!parsed?.data || typeof parsed.expiresAt !== "number") return null;
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(cacheKey(platform, niche));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedTrends(platform: Platform, niche: string, data: TrendPayload) {
  try {
    localStorage.setItem(
      cacheKey(platform, niche),
      JSON.stringify({
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
      })
    );
  } catch {
    // Ignore storage quota errors and private mode restrictions.
  }
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
        metricText: `${stat.mentions} упоминаний`,
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
      viewsText: item.metric ? item.metricLabel : `${compactNumber(views)} оценка взаимодействий`,
      published: item.published,
      duration: "Короткий формат",
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
  const youtubeFeedShorts = `https://www.youtube.com/feeds/videos.xml?search_query=${encoded}%20shorts`;
  const youtubeFeedDefault = `https://www.youtube.com/feeds/videos.xml?search_query=${encoded}`;
  const googleNewsFeed = buildGoogleNewsRss(platform, niche);

  const candidatesByPlatform: Record<Platform, string[]> = {
    youtube: [
      youtubeFeedShorts,
      youtubeFeedDefault,
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(youtubeFeedShorts)}`,
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(youtubeFeedDefault)}`,
      googleNewsFeed,
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleNewsFeed)}`,
      "https://www.youtube.com/feeds/videos.xml?search_query=viral%20shorts",
      "https://www.youtube.com/feeds/videos.xml?search_query=viral",
    ],
    tiktok: [
      `https://rsshub.app/tiktok/tag/${rsshubTag}`,
      `https://rsshub.app/tiktok/tag/viral`,
      `https://rsshub.rssforever.com/tiktok/tag/${rsshubTag}`,
      `https://rsshub.rssforever.com/tiktok/tag/viral`,
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(`https://rsshub.app/tiktok/tag/${rsshubTag}`)}`,
      "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Frsshub.app%2Ftiktok%2Ftag%2Fviral",
      googleNewsFeed,
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleNewsFeed)}`,
    ],
    instagram: [
      `https://rsshub.app/instagram/explore/tags/${rsshubTag}`,
      "https://rsshub.app/instagram/explore/tags/viral",
      `https://rsshub.rssforever.com/instagram/explore/tags/${rsshubTag}`,
      "https://rsshub.rssforever.com/instagram/explore/tags/viral",
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(`https://rsshub.app/instagram/explore/tags/${rsshubTag}`)}`,
      "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Frsshub.app%2Finstagram%2Fexplore%2Ftags%2Fviral",
      googleNewsFeed,
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleNewsFeed)}`,
    ],
  };

  try {
    const { items, resolvedSource } = await fetchFromCandidateList(candidatesByPlatform[platform]);
    const payload = buildTrendPayload(platform, resolvedSource, items);
    setCachedTrends(platform, niche, payload);
    return payload;
  } catch (error) {
    const cached = getCachedTrends(platform, niche);
    if (cached) {
      return {
        ...cached,
        fetchedAt: new Date().toISOString(),
        source: [...cached.source, "Кэш fallback"],
      };
    }

    const resilienceItems = buildResilienceItems(platform, niche);
    const fallbackPayload = buildTrendPayload(platform, "Резервный fallback-набор", resilienceItems);
    setCachedTrends(platform, niche, fallbackPayload);

    return {
      ...fallbackPayload,
      source: [
        ...fallbackPayload.source,
        error instanceof Error ? `Ошибка загрузки: ${error.message}` : "Ошибка загрузки: неизвестно",
      ],
    };
  }
}