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
import { fetchTrendsClient, type Platform, type TrendPayload } from "./lib/trends-client";

type Theme = "dark" | "light";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function exportAsJson(ideas: Idea[]) {
  const blob = new Blob([JSON.stringify(ideas, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "content-ideas.json";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function exportAsCsv(ideas: Idea[]) {
  const headers = [
    "platform",
    "title",
    "hook",
    "theme",
    "format",
    "duration",
    "frequency",
    "difficulty",
    "keywords",
    "cta",
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
  link.download = "content-ideas.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [niche, setNiche] = useState("fitness motivation");
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" ? "dark" : "light";
  });

  const [trends, setTrends] = useState<TrendPayload | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [error, setError] = useState("");

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

  async function loadTrends() {
    setLoadingTrends(true);
    setError("");
    try {
      const data = await fetchTrendsClient(platform, niche);
      setTrends(data);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown error";
      setError(`Failed to load trends: ${message}`);
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
      const generated = generateIdeasFromTrends(sourceTrends, niche, 10);
      setIdeas(generated);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown error";
      setError(`Failed to generate ideas: ${message}`);
    } finally {
      setLoadingIdeas(false);
    }
  }

  useEffect(() => {
    void loadTrends();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500" />
            <div>
              <p className="text-lg font-semibold tracking-tight">TrendStudio AI</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">TikTok • YouTube • Instagram Reels</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Light" : "Dark"}
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
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-200">Trend Intelligence</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
            Analyze real-time social trends and generate publish-ready short-form content ideas.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-cyan-100/90 sm:text-base">
            Works on GitHub Pages. Data comes from public pages and RSS mirrors only, without official APIs.
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
            className="rounded-xl border border-slate-300 bg-transparent px-4 py-3 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-slate-700"
          >
            <option value="youtube">YouTube / Shorts</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram Reels</option>
          </select>

          <input
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            placeholder="Niche: travel, finance, fitness, gaming..."
            className="rounded-xl border border-slate-300 bg-transparent px-4 py-3 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-slate-700"
          />

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void loadTrends()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {loadingTrends ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
            Analyze Trends
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void generateIdeas()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            {loadingIdeas ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
            Generate Ideas
          </motion.button>
        </motion.section>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Keyword Momentum</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topKeywords}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.25} />
                    <XAxis dataKey="term" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatNumber(Number(value ?? 0))}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #334155" }}
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
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Trend Velocity (Top Keyword)</p>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="#6366f1" fill="#818cf833" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Top Content Signals</p>
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
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Generated Ideas</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => exportAsCsv(ideas)}
                  disabled={!ideas.length}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"
                >
                  <Download size={14} /> CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportAsJson(ideas)}
                  disabled={!ideas.length}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"
                >
                  <Download size={14} /> JSON
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
                    <span>Format: {idea.format}</span>
                    <span>Duration: {idea.duration}</span>
                    <span>Frequency: {idea.frequency}</span>
                    <span>Difficulty: {idea.difficulty}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">CTA: {idea.cta}</p>
                </motion.article>
              ))}

              {!ideas.length ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Press "Generate Ideas" to build a content plan based on fresh trends.
                </p>
              ) : null}
            </div>
          </motion.div>
        </section>

        {trends ? (
          <footer className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Last update: {new Date(trends.fetchedAt).toLocaleString()} | Public sources: {trends.source.slice(0, 2).join(", ")}
          </footer>
        ) : null}
      </main>
    </div>
  );
}
