import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT) || 8787;
const CACHE_TTL_MS = 1000 * 60 * 10;
const cache = new Map();

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

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  cache.set(key, { timestamp: Date.now(), value });
}

function parseCompactNumber(text = "") {
  const cleaned = text.replace(/,/g, "").trim();
  const match = cleaned.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const suffix = match[2]?.toUpperCase();
  if (suffix === "K") return Math.round(value * 1_000);
  if (suffix === "M") return Math.round(value * 1_000_000);
  if (suffix === "B") return Math.round(value * 1_000_000_000);
  return Math.round(value);
}

function safeTitleText(node) {
  if (!node) return "";
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text).join("");
  return "";
}

function extractObjectByMarker(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const start = html.indexOf("{", markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      const raw = html.slice(start, i + 1);
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function deepCollectVideoRenderers(node, bucket = []) {
  if (!node || typeof node !== "object") return bucket;
  if (node.videoRenderer) bucket.push(node.videoRenderer);

  if (Array.isArray(node)) {
    node.forEach((item) => deepCollectVideoRenderers(item, bucket));
  } else {
    Object.values(node).forEach((value) => deepCollectVideoRenderers(value, bucket));
  }
  return bucket;
}

function tokenizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function seededValue(seedText, idx, min, max) {
  let hash = 0;
  const source = `${seedText}-${idx}`;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 1000) / 1000;
  return Math.round(min + (max - min) * normalized);
}

function createSparkline(term, baseScore) {
  return Array.from({ length: 7 }).map((_, i) => {
    const drift = seededValue(term, i, -16, 16);
    const value = Math.max(5, Math.round(baseScore + baseScore * (drift / 100)));
    return {
      day: `D-${6 - i}`,
      score: value,
    };
  });
}

async function requestHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchYouTubeTrends(niche = "") {
  const encodedNiche = encodeURIComponent(`${niche || "viral"} shorts`);
  const [trendingHtml, nicheHtml] = await Promise.all([
    requestHtml("https://www.youtube.com/feed/trending"),
    requestHtml(`https://www.youtube.com/results?search_query=${encodedNiche}`),
  ]);

  const trendingData = extractObjectByMarker(trendingHtml, "var ytInitialData =");
  const nicheData = extractObjectByMarker(nicheHtml, "var ytInitialData =");

  const renderers = [
    ...deepCollectVideoRenderers(trendingData),
    ...deepCollectVideoRenderers(nicheData),
  ];

  const dedupedMap = new Map();
  for (const renderer of renderers) {
    const id = renderer.videoId;
    if (!id || dedupedMap.has(id)) continue;

    const title = safeTitleText(renderer.title);
    const viewsText =
      safeTitleText(renderer.viewCountText) || safeTitleText(renderer.shortViewCountText);
    const views = parseCompactNumber(viewsText);
    const channel = safeTitleText(renderer.ownerText);

    dedupedMap.set(id, {
      id,
      title,
      channel,
      views,
      viewsText: viewsText || "N/A",
      published: safeTitleText(renderer.publishedTimeText) || "Recently",
      duration: safeTitleText(renderer.lengthText) || "Short",
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }

  const videos = Array.from(dedupedMap.values())
    .sort((a, b) => b.views - a.views)
    .slice(0, 16);

  const keywordStats = new Map();
  videos.forEach((video) => {
    const words = tokenizeTitle(video.title);
    words.forEach((word) => {
      const current = keywordStats.get(word) || { mentions: 0, reach: 0 };
      current.mentions += 1;
      current.reach += video.views;
      keywordStats.set(word, current);
    });
  });

  const keywords = Array.from(keywordStats.entries())
    .map(([term, stat]) => {
      const score = Math.round(stat.reach / 1000 + stat.mentions * 900);
      return {
        term,
        score,
        metricText: `${stat.mentions} videos, ~${Math.round(stat.reach / 1000)}K views`,
        source: "YouTube Trending + Search",
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`,
        sparkline: createSparkline(term, score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return {
    platform: "youtube",
    fetchedAt: new Date().toISOString(),
    source: [
      "https://www.youtube.com/feed/trending",
      `https://www.youtube.com/results?search_query=${encodedNiche}`,
    ],
    keywords,
    videos,
  };
}

async function fetchTikTokTrends(niche = "") {
  const html = await requestHtml(
    "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en"
  );

  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const pattern = /(\d+)\s*#\s*([^\s#]+)(?:[\s\S]{0,80}?)(\d+(?:\.\d+)?[KMB])Posts/gu;

  const tags = [];
  let match = pattern.exec(bodyText);
  while (match) {
    const rank = Number(match[1]);
    const tag = match[2].replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
    const postsText = match[3];
    const posts = parseCompactNumber(postsText);
    if (tag) {
      const nicheBoost = niche && tag.includes(niche.toLowerCase()) ? 1.35 : 1;
      tags.push({
        term: tag,
        score: Math.round(posts * nicheBoost),
        metricText: `${postsText} posts`,
        source: "TikTok Creative Center",
        url: `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`,
        sparkline: createSparkline(tag, Math.max(20, Math.round(posts / 100))),
        rank,
      });
    }
    match = pattern.exec(bodyText);
  }

  const deduped = Array.from(
    new Map(tags.map((item) => [item.term, item])).values()
  ).sort((a, b) => b.score - a.score);

  const keywords = deduped.slice(0, 12);
  const videos = keywords.slice(0, 10).map((item, index) => ({
    id: `${item.term}-${index}`,
    title: `#${item.term} challenge ideas`,
    channel: "TikTok Community",
    views: item.score,
    viewsText: item.metricText,
    published: "Live trend",
    duration: "15-45s",
    url: item.url,
  }));

  return {
    platform: "tiktok",
    fetchedAt: new Date().toISOString(),
    source: [
      "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
    ],
    keywords,
    videos,
  };
}

function createInstagramTagSet(niche = "") {
  const base = [
    "reels",
    "viral",
    "explorepage",
    "trending",
    "instareels",
    "contentcreator",
  ];
  const words = niche
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4);
  return Array.from(new Set([...words, ...base]));
}

async function fetchInstagramTrends(niche = "") {
  const tags = createInstagramTagSet(niche);

  const settled = await Promise.allSettled(
    tags.map(async (tag) => {
      const html = await requestHtml(
        `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`
      );

      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const titleText = titleMatch?.[1] ?? "";
      const countMatch = titleText.match(/([\d.,]+\s*[KMB]?)\s+(?:reels|posts)/i);
      const countText = countMatch?.[1] ?? "0";
      const count = parseCompactNumber(countText);

      return {
        term: tag,
        score: count,
        metricText: `${countText} reels`,
        source: "Instagram Hashtag Pages",
        url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
        sparkline: createSparkline(tag, Math.max(12, Math.round(count / 1_000_000))),
        rawTitle: titleText,
      };
    })
  );

  const keywords = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const videos = keywords.slice(0, 10).map((item, index) => ({
    id: `${item.term}-${index}`,
    title: `Reels trend: #${item.term}`,
    channel: "Instagram Creators",
    views: item.score,
    viewsText: item.metricText,
    published: "Updated live",
    duration: "10-60s",
    url: item.url,
  }));

  return {
    platform: "instagram",
    fetchedAt: new Date().toISOString(),
    source: keywords.map((item) => item.url),
    keywords,
    videos,
  };
}

async function getPlatformTrends(platform, niche) {
  const key = `${platform}:${niche}`;
  const cached = getCached(key);
  if (cached) return cached;

  let data;
  if (platform === "youtube") data = await fetchYouTubeTrends(niche);
  else if (platform === "tiktok") data = await fetchTikTokTrends(niche);
  else if (platform === "instagram") data = await fetchInstagramTrends(niche);
  else throw new Error("Unsupported platform");

  setCached(key, data);
  return data;
}

function pickByPlatform(platform) {
  if (platform === "youtube") {
    return {
      formats: ["Talking head", "Listicle", "Case study", "Tutorial", "React format"],
      durations: ["35-55 sec", "60-120 sec", "4-8 min"],
      frequencies: ["4 shorts/week + 1 long", "1 video/day", "5 uploads/week"],
    };
  }
  if (platform === "tiktok") {
    return {
      formats: ["Hook + payoff", "Duet", "Green screen explainer", "POV sketch", "Series part"],
      durations: ["12-18 sec", "20-35 sec", "45-60 sec"],
      frequencies: ["2 posts/day", "1 post/day", "5 posts/week"],
    };
  }
  return {
    formats: ["Aesthetic montage", "Micro tutorial", "Storytime", "Before/After", "Voiceover guide"],
    durations: ["15-30 sec", "30-45 sec", "45-75 sec"],
    frequencies: ["1-2 reels/day", "6 reels/week", "4 reels/week + 2 stories/day"],
  };
}

function generateIdeasFromTrends(platform, niche, trends, count) {
  const config = pickByPlatform(platform);
  const sourceTerms = trends.keywords.map((item) => item.term);
  const terms = sourceTerms.length ? sourceTerms : [niche || "content", "viral", "creator"];

  const ideas = Array.from({ length: count }).map((_, index) => {
    const term = terms[index % terms.length];
    const format = config.formats[index % config.formats.length];
    const duration = config.durations[index % config.durations.length];
    const frequency = config.frequencies[index % config.frequencies.length];
    const angleSet = [
      "myth busting",
      "beginner mistakes",
      "quick framework",
      "reaction + explanation",
      "step-by-step demo",
    ];
    const angle = angleSet[index % angleSet.length];

    return {
      id: `${platform}-${term}-${index}`,
      platform,
      title: `${term}: ${angle} for ${niche || "your niche"}`,
      hook: `Start with: "Most creators miss this about ${term}..."`,
      theme: niche || "General growth",
      format,
      duration,
      frequency,
      keywords: [term, niche || "growth", "content strategy"].filter(Boolean),
      difficulty: ["Easy", "Medium", "Hard"][index % 3],
      cta: "Ask viewers to comment their result and save the post.",
    };
  });

  return ideas;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/trends", async (req, res) => {
  try {
    const platform = String(req.query.platform || "all").toLowerCase();
    const niche = String(req.query.niche || "").trim();

    if (platform === "all") {
      const [youtube, tiktok, instagram] = await Promise.all([
        getPlatformTrends("youtube", niche),
        getPlatformTrends("tiktok", niche),
        getPlatformTrends("instagram", niche),
      ]);

      return res.json({
        fetchedAt: new Date().toISOString(),
        niche,
        platforms: { youtube, tiktok, instagram },
      });
    }

    const trends = await getPlatformTrends(platform, niche);
    return res.json({ fetchedAt: new Date().toISOString(), niche, platform, trends });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch trends",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/generate-ideas", async (req, res) => {
  try {
    const platform = String(req.body.platform || "youtube").toLowerCase();
    const niche = String(req.body.niche || "").trim();
    const count = Math.min(Math.max(Number(req.body.count) || 8, 3), 24);

    if (!["youtube", "tiktok", "instagram"].includes(platform)) {
      return res.status(400).json({ message: "Unsupported platform" });
    }

    const trends = await getPlatformTrends(platform, niche);
    const ideas = generateIdeasFromTrends(platform, niche, trends, count);
    return res.json({
      generatedAt: new Date().toISOString(),
      platform,
      niche,
      ideas,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate ideas",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Trend server running on http://localhost:${PORT}`);
});
