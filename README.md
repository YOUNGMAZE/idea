# TrendStudio AI

Trend analysis and content idea generation for:

- TikTok
- YouTube / YouTube Shorts
- Instagram Reels

This build is optimized for GitHub Pages and works without a custom backend. The app fetches public feeds/pages through free proxy mirrors and parses them in the browser.

## Features

- Real trend signals from public sources only (no official paid APIs)
- Platform + niche filter panel
- `Generate Ideas` with:
- video format
- topic angle
- duration
- posting frequency
- Trend dashboard with charts (Recharts)
- Export ideas to CSV and JSON
- Dark/light theme with persistence
- Responsive modern UI + motion (Framer Motion)

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS v4
- Framer Motion
- Recharts

## Public Data Strategy

- YouTube: public feeds (`/feeds/videos.xml?search_query=...`)
- TikTok: public RSS mirrors for hashtag trends
- Instagram: public RSS mirrors for hashtag trends
- Fetch fallback chain:
- direct URL
- AllOrigins proxy
- Jina AI fetch mirror

No official platform APIs are used.

## Project Structure

```text
.
├─ server/
│  └─ index.mjs                 # Optional local backend (not required for GitHub Pages)
├─ src/
│  ├─ lib/
│  │  ├─ idea-generator.ts      # Local idea generation logic
│  │  └─ trends-client.ts       # Client-side trend scraping/parsing
│  ├─ App.tsx                   # Main dashboard UI
│  ├─ index.css
│  ├─ main.tsx
│  ├─ vite-env.d.ts
│  └─ utils/cn.ts
├─ .env.example
├─ README.md
├─ package.json
└─ vite.config.ts
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env
```

3. Start app:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages Deployment

1. Push repository to GitHub.
2. In GitHub repository settings, open `Pages` and set source to `GitHub Actions`.
3. Push to `main`. Workflow `.github/workflows/deploy-pages.yml` will build and deploy automatically.

If you deploy under a subpath (for example `https://username.github.io/repo-name/`), ensure your Vite `base` is configured accordingly.

## Notes

- Public sources can occasionally throttle or change markup. Fallback mirrors are included, but availability may vary.
- Trend parsing is fully client-side, so no Node server is required for GitHub Pages.
- If live feeds are unreachable, the app automatically falls back to cached data and then to a resilience dataset, so UI and idea generation stay available.
