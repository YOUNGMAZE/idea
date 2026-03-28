import type { Platform, TrendPayload } from "./trends-client";

export type Idea = {
  id: string;
  platform: Platform;
  title: string;
  hook: string;
  theme: string;
  format: string;
  duration: string;
  frequency: string;
  keywords: string[];
  difficulty: string;
  cta: string;
};

const FORMAT_BY_PLATFORM: Record<Platform, string[]> = {
  youtube: ["Talking head + B-roll", "Screen text breakdown", "Before/After Shorts", "Myth vs Fact"],
  tiktok: ["Fast cut trend remix", "POV storytelling", "Challenge response", "Day-in-the-life"],
  instagram: ["Aesthetic tutorial reel", "Behind-the-scenes reel", "List-style reel", "Transformation reel"],
};

const DURATION_BY_PLATFORM: Record<Platform, string[]> = {
  youtube: ["25-40 sec", "35-50 sec", "45-60 sec"],
  tiktok: ["15-25 sec", "20-35 sec", "30-45 sec"],
  instagram: ["20-35 sec", "30-45 sec", "40-60 sec"],
};

const FREQUENCY_BY_PLATFORM: Record<Platform, string[]> = {
  youtube: ["4 videos/week", "1 daily short, 5 days/week"],
  tiktok: ["1-2 posts/day", "2 posts/day + 1 reply video"],
  instagram: ["5 reels/week", "1 reel/day, 5 days/week"],
};

const DIFFICULTY = ["Low", "Low", "Medium", "Medium", "High"];

function seededValue(seedText: string, idx: number, max: number) {
  let hash = 0;
  const source = `${seedText}-${idx}`;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % max);
}

function pick<T>(arr: T[], seed: string, idx: number) {
  return arr[seededValue(seed, idx, arr.length)];
}

export function generateIdeasFromTrends(
  trends: TrendPayload,
  niche: string,
  count = 10
): Idea[] {
  const platform = trends.platform;
  const keywords = trends.keywords.slice(0, 10).map((k) => k.term);
  const core = keywords.length ? keywords : niche.split(/\s+/).filter(Boolean);
  const safeCore = core.length ? core : ["trend", "viral", "creator"];
  const normalizedNiche = niche.trim() || "viral";

  return Array.from({ length: count }).map((_, idx) => {
    const k1 = safeCore[idx % safeCore.length] || "trend";
    const k2 = safeCore[(idx + 2) % safeCore.length] || "creator";
    const k3 = safeCore[(idx + 4) % safeCore.length] || normalizedNiche;
    const title = `${k1.toUpperCase()} in ${normalizedNiche}: ${k2} strategy that boosts reach`;

    return {
      id: `${platform}-${idx}-${k1}-${k2}`,
      platform,
      title,
      hook: `Open with a bold claim about ${k1}, then prove it in 3 quick cuts using ${k2} + ${k3}.`,
      theme: `${normalizedNiche} growth`,
      format: pick(FORMAT_BY_PLATFORM[platform], title, idx),
      duration: pick(DURATION_BY_PLATFORM[platform], title, idx + 1),
      frequency: pick(FREQUENCY_BY_PLATFORM[platform], title, idx + 2),
      keywords: [k1, k2, k3],
      difficulty: pick(DIFFICULTY, title, idx + 3),
      cta: `End with: "Comment '${k1}' and I will send part 2 with the full ${k2} template."`,
    } satisfies Idea;
  });
}