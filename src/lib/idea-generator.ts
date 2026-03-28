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
  youtube: ["Говорящая голова + B-roll", "Разбор с текстом на экране", "Shorts до/после", "Миф vs факт"],
  tiktok: ["Быстрый тренд-ремикс", "POV-сторителлинг", "Ответ на челлендж", "Один день из жизни"],
  instagram: ["Эстетичный обучающий рилс", "Рилс из закулисья", "Рилс в формате списка", "Рилс-трансформация"],
};

const DURATION_BY_PLATFORM: Record<Platform, string[]> = {
  youtube: ["25-40 сек", "35-50 сек", "45-60 сек"],
  tiktok: ["15-25 сек", "20-35 сек", "30-45 сек"],
  instagram: ["20-35 сек", "30-45 сек", "40-60 сек"],
};

const FREQUENCY_BY_PLATFORM: Record<Platform, string[]> = {
  youtube: ["4 видео в неделю", "1 shorts в день, 5 дней в неделю"],
  tiktok: ["1-2 поста в день", "2 поста в день + 1 видео-ответ"],
  instagram: ["5 reels в неделю", "1 reels в день, 5 дней в неделю"],
};

const DIFFICULTY = ["Низкая", "Низкая", "Средняя", "Средняя", "Высокая"];

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
  const safeCore = core.length ? core : ["тренд", "вирусный", "автор"];
  const normalizedNiche = niche.trim() || "вирусный контент";

  return Array.from({ length: count }).map((_, idx) => {
    const k1 = safeCore[idx % safeCore.length] || "тренд";
    const k2 = safeCore[(idx + 2) % safeCore.length] || "автор";
    const k3 = safeCore[(idx + 4) % safeCore.length] || normalizedNiche;
    const title = `${k1.toUpperCase()} в нише "${normalizedNiche}": стратегия ${k2}, которая увеличивает охваты`;

    return {
      id: `${platform}-${idx}-${k1}-${k2}`,
      platform,
      title,
      hook: `Начните с сильного утверждения про ${k1}, затем докажите его в 3 быстрых сценах через ${k2} + ${k3}.`,
      theme: `Рост в нише ${normalizedNiche}`,
      format: pick(FORMAT_BY_PLATFORM[platform], title, idx),
      duration: pick(DURATION_BY_PLATFORM[platform], title, idx + 1),
      frequency: pick(FREQUENCY_BY_PLATFORM[platform], title, idx + 2),
      keywords: [k1, k2, k3],
      difficulty: pick(DIFFICULTY, title, idx + 3),
      cta: `Завершите фразой: "Напиши '${k1}' в комментариях, и я отправлю часть 2 с полным шаблоном ${k2}."`,
    } satisfies Idea;
  });
}