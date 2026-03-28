import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, LoaderCircle, Moon, Sparkles, Sun } from "lucide-react";
import { generateIdeasFromTrends, type Idea } from "./lib/idea-generator";
import { fetchTrendsClient, getCachedTrends, type Platform, type TrendPayload } from "./lib/trends-client";

type Theme = "dark" | "light";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function getSourceWarning(payload: TrendPayload) {
  const joined = payload.source.join(" | ").toLowerCase();
  if (joined.includes("resilience fallback") || joined.includes("резервный fallback")) {
    return "Публичные источники временно недоступны. Показаны резервные данные, чтобы дашборд продолжал работать.";
  }
  if (joined.includes("cache fallback") || joined.includes("кэш fallback")) {
    return "Публичные источники временно недоступны. Показаны данные из кэша.";
  }
  if (joined.includes("fetch error") || joined.includes("ошибка загрузки")) {
    return "Часть источников была нестабильна при загрузке. Результаты частично восстановлены через fallback-механизм.";
  }
  return "";
}

function exportAsJson(ideas: Idea[]) {
  const blob = new Blob([JSON.stringify(ideas, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "idei-kontenta.json";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function exportAsCsv(ideas: Idea[]) {
  const headers = [
    "платформа",
    "заголовок",
    "хук",
    "тема",
    "формат",
    "длительность",
    "частота",
    "сложность",
    "ключевые_слова",
    "призыв_к_действию",
  ];

  const rows = ideas.map((idea) =>
    [
      idea.platform,
      idea.title,
      idea.hook,
      idea.theme,
      idea.format,
      idea.duration,
      idea.frequency,
      idea.difficulty,
      idea.keywords.join(" | "),
      idea.cta,
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "idei-kontenta.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [niche, setNiche] = useState("");
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [trends, setTrends] = useState<TrendPayload | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const topKeywords = useMemo(() => trends?.keywords.slice(0, 8) ?? [], [trends]);
  const topVideos = useMemo(() => trends?.videos.slice(0, 8) ?? [], [trends]);

  const sparklineData = useMemo(() => {
    const first = topKeywords[0]?.sparkline;
    if (!first) return [];
    return first;
  }, [topKeywords]);

  const chartTextColor = theme === "dark" ? "#cbd5e1" : "#334155";
  const chartGridColor = theme === "dark" ? "#334155" : "#cbd5e1";
  const tooltipStyle =
    theme === "dark"
      ? { backgroundColor: "#0f172a", borderRadius: "12px", border: "1px solid #334155", color: "#e2e8f0" }
      : { backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #cbd5e1", color: "#0f172a" };

  async function loadTrends() {
    setLoadingTrends(true);
    setError("");
    setWarning("");
    try {
      const data = await fetchTrendsClient(platform, niche);
      setTrends(data);
      const sourceWarning = getSourceWarning(data);
      if (sourceWarning) setWarning(sourceWarning);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Неизвестная ошибка";
      const cached = getCachedTrends(platform, niche);
      if (cached) {
        setTrends(cached);
        setWarning(`Публичные источники недоступны. Показаны кэшированные данные от ${new Date(cached.fetchedAt).toLocaleString("ru-RU")}.`);
      } else {
        setError(`Не удалось загрузить тренды: ${message}`);
      }
    } finally {
      setLoadingTrends(false);
    }
  }

  async function generateIdeas() {
    setLoadingIdeas(true);
    setError("");
    try {
      const sourceTrends = trends?.platform === platform ? trends : await fetchTrendsClient(platform, niche);
      if (!trends || trends.platform !== platform) {
        setTrends(sourceTrends);
      }
      const sourceWarning = getSourceWarning(sourceTrends);
      if (sourceWarning) setWarning(sourceWarning);
      const generated = generateIdeasFromTrends(sourceTrends, niche, 10);
      setIdeas(generated);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Неизвестная ошибка";
      setError(`Не удалось сгенерировать идеи: ${message}`);
    } finally {
      setLoadingIdeas(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500" />
            <div>
              <p className="text-lg font-semibold tracking-tight">TrendStudio AI</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Аналитика трендов: TikTok • YouTube • Instagram Reels</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Светлая тема" : "Темная тема"}
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-violet-900 to-cyan-800 px-6 py-8 text-white dark:border-slate-700"
        >
          <div className="absolute -right-20 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-cyan-300/30 blur-3xl" />
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-200">Аналитика Трендов</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
            Находите актуальные тренды и получайте готовые идеи для коротких видео.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-cyan-100/90 sm:text-base">
            Работает на GitHub Pages. Данные берутся только из публичных страниц и RSS-источников, без официальных API.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1fr_1fr_auto_auto]"
        >
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as Platform)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-violet-400 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="youtube">YouTube / Shorts</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram Reels</option>
          </select>

          <input
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void loadTrends();
            }}
            placeholder="Ниша: фитнес, финансы, гейминг, путешествия..."
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-violet-400 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void loadTrends()}
            disabled={loadingTrends}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {loadingTrends ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Анализировать тренды
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void generateIdeas()}
            disabled={loadingIdeas || loadingTrends}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            {loadingIdeas ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Сгенерировать идеи
          </motion.button>
        </motion.section>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-300">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadTrends()}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium transition hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900/40"
            >
                Повторить
            </button>
          </div>
        ) : null}

        {warning ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
            {warning}
          </p>
        ) : null}

        <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Динамика ключевых слов</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topKeywords}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.25} stroke={chartGridColor} />
                    <XAxis dataKey="term" tick={{ fontSize: 12, fill: chartTextColor }} interval={0} angle={-20} textAnchor="end" height={52} />
                    <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12, fill: chartTextColor }} />
                    <Tooltip
                      formatter={(value) => formatNumber(Number(value ?? 0))}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="score" fill="url(#keywordGradient)" radius={[8, 8, 0, 0]} />
                    <defs>
                      <linearGradient id="keywordGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Скорость тренда (топ-ключ)</p>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} stroke={chartGridColor} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: chartTextColor }} />
                    <YAxis hide />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="score" stroke="#6366f1" fill="#818cf833" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Топ контент-сигналы</p>
              <div className="mt-4 space-y-3">
                {topVideos.map((video) => (
                  <a
                    key={video.id}
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-slate-200 p-3 transition hover:border-violet-400 dark:border-slate-700"
                  >
                    <p className="truncate text-sm font-medium">{video.title}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{video.channel}</span>
                      <span>{video.viewsText}</span>
                      <span>{video.duration}</span>
                    </div>
                  </a>
                ))}
                {!topVideos.length ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Трендовые публикации пока не загружены. Попробуйте другую нишу или нажмите "Анализировать тренды".
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Сгенерированные идеи</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => exportAsCsv(ideas)}
                  disabled={!ideas.length}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"
                >
                  <Download size={14} /> Экспорт CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportAsJson(ideas)}
                  disabled={!ideas.length}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"
                >
                  <Download size={14} /> Экспорт JSON
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[64rem] space-y-3 overflow-auto pr-1">
              {ideas.map((idea, index) => (
                <motion.article
                  key={idea.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * index }}
                  className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                >
                  <p className="text-xs uppercase tracking-wide text-violet-500">{idea.platform}</p>
                  <h3 className="mt-1 text-sm font-semibold leading-snug">{idea.title}</h3>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{idea.hook}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span>Формат: {idea.format}</span>
                    <span>Длительность: {idea.duration}</span>
                    <span>Частота: {idea.frequency}</span>
                    <span>Сложность: {idea.difficulty}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Призыв к действию: {idea.cta}</p>
                </motion.article>
              ))}

              {!ideas.length ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Нажмите "Сгенерировать идеи", чтобы построить контент-план на основе актуальных трендов.
                </p>
              ) : null}
            </div>
          </motion.div>
        </section>

        {trends ? (
          <footer className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Последнее обновление: {new Date(trends.fetchedAt).toLocaleString("ru-RU")} | Источники: {trends.source.slice(0, 2).join(", ")}
          </footer>
        ) : null}
      </main>
    </div>
  );
}
