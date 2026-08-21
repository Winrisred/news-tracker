# AI & BigTech News Tracker

**Current version: v2** (2026-08)

Automated news aggregator that collects AI and BigTech headlines from RSS feeds and the AISI blog, stores them in Google Sheets, and displays them on a privacy-friendly web dashboard installable as a PWA.

Two pages, one identity:

- **Headlines** (`index.html`) — the wire desk: hourly headlines from major outlets, filtered by company/topic keywords.
- **Voices** (`voices.html`) — the reading room: essays & commentary from a curated roster of ~22 AI voices (newsletters, blogs, and press coverage), organized in four desks: Researchers & Builders, Industry & Chips, Policy & China, Culture & Society. No keyword filtering — the roster is curated by author.

## Setup

### 1. Google Sheet + Apps Script

1. Create a new Google Sheet
2. **Extensions > Apps Script**, paste the contents of `google-apps-script/ai-bigtech-news.gs`, save (Ctrl+S)
3. Run **setupSheets** (function dropdown > Run), grant permissions
4. Run **fetchNews** to test — check the "All News" sheet
5. Run **createHourlyTrigger** to automate (fetches every hour)

### 2. Publish the Sheet as CSV

1. **File > Share > Publish to web** — sheet: **All News**, format: **CSV**, click **Publish**, copy URL
2. In `index.html`, replace the `SHEET_CSV_URL` value with your URL

### 3. Host on GitHub Pages

Push to a GitHub repo, then **Settings > Pages > Source: main branch**. Live at `https://yourusername.github.io/news-tracker/`.

### 4. Voices page (separate Sheet + script)

1. Create a **second, separate** Google Sheet (keeps essays fully apart from news)
2. **Extensions > Apps Script**, paste `google-apps-script/voices.gs`, save
3. Run **setupSheets**, then **fetchVoices** to test — check the "All Posts" sheet
4. Run **createSixHourTrigger** to automate (essays are weekly-ish; 6 h is plenty)
5. **File > Share > Publish to web** — sheet: **All Posts**, format: **CSV** — and paste the URL into `VOICES_CSV_URL` in `voices.html`

Until the CSV URL is set, `voices.html` shows demo content (marked as such).

Tabs are auto-ordered after each fetch, matching the news sheet: **Summary** → **All Posts** → monthly tabs newest-first (e.g. `2026-08`), all sorted newest-on-top and auto-reformatted. The `Voices Tracker` menu also has **Rebuild monthly tabs** (one-time backfill of monthly tabs from existing rows — run it once after upgrading an older sheet) and **Reformat all sheets**.

The roster lives in the `VOICES` array at the top of `voices.gs` — add a voice by adding one line (any RSS/Atom feed works: Substack, Ghost, WordPress, plain blogs). For voices without a feed, use a Google News query URL with `type: "gnews"` (collects press coverage by and about them). If you add someone, optionally give them an accent color in `VOICE_ACCENTS` in `voices.html` (unknown voices get an auto-generated color).

## Structure

```
news-tracker/
├── google-apps-script/
│   ├── ai-bigtech-news.gs    <- Headlines Apps Script (paste into Google Sheets)
│   └── voices.gs             <- Voices Apps Script (paste into a SECOND Sheet)
├── images/
│   ├── aisi/                 <- 120 local nature/forest/sea/plants fallbacks (AISI)
│   ├── general/              <- 180 local abstract/sky/landscape fallbacks (RSS)
│   └── favicon-*.png         <- Favicons and PWA icons
├── index.html                <- Headlines dashboard
├── voices.html               <- Voices reading room
├── manifest.json             <- PWA manifest
├── sw.js                     <- Service worker (offline support)
└── README.md
```

## Sheet structure

Columns: Date, Headline, Link, Source, Author, Image URL, Companies, Topics, Tags, APA Citation.

Tabs (auto-ordered after each fetch): **Summary** → **All News** → monthly tabs newest-first (e.g. `2026-04`, `2026-03`...).

## Sources

- **RSS**: NYT, FT, TechCrunch, The Verge, Ars Technica, VentureBeat, The Guardian, Wired, MIT Tech Review
- **HTML scraping**: AISI (UK AI Safety Institute blog — no RSS feed available)

## Features

- **Keyword scoring** — headline match = 3 pts, description match = 1 pt, threshold = 3 (reduces false positives)
- **70+ companies, 25+ topics** tracked across AI labs, Big Tech, chips, cloud, defense, policy, government AI bodies, Chinese tech, etc.
- **APA 7th-edition citations** auto-generated for every article
- **Web dashboard** — filter by time period (default: all) and by keyword/company/topic; saved-tag filters (Key, Research) sync via Google Apps Script
- **Smart thumbnails** — real images when available; otherwise curated **local** fallback images (no external CDN, no IP leak):
  - **120 nature/forest/sea/plants/landscape photos** for AISI posts
  - **180 abstract/sky/rocks/cliffs/river/lake/beach/stars/sunset/galaxy photos** for RSS posts without images
  - Hash-based deterministic selection with same-render dedup so images hardly ever repeat
- **PWA** — installable on mobile/desktop, works offline via service worker (network-first for same-origin, browser-handled for cross-origin)
- **Privacy & security**:
  - Self-hosted DM Sans font (no Google Fonts → no IP leak)
  - All thumbnail fallbacks served from same origin
  - Content Security Policy locking down where scripts/connects/images can come from
  - GoatCounter analytics (privacy-friendly, no cookies, no GDPR banner needed)

## Apps Script menu (`News Tracker`)

- Fetch news now / Setup sheets
- Create or remove hourly trigger
- Update summary / Reformat all sheets / Reorder sheet tabs / Backfill authors
- Test AISI scrape (debug)

## Deployment

### Web dashboard
Edits to `index.html`, `sw.js`, `manifest.json`, or `images/` deploy to GitHub Pages automatically when pushed to `main` (~30–60 s). When changing `sw.js`, bump `CACHE_NAME` to force the service worker to refresh on visitors' browsers.

### Apps Script
Changes to `google-apps-script/ai-bigtech-news.gs` are **not** deployed via GitHub — paste the updated file into the Apps Script editor and Ctrl+S.

## Backup

The `.gs` files in this repo are the local source of truth. If a Google Sheet is deleted, its script disappears with it — restore it from these files.

## Version history

- **v2** (2026-08) — Keyword overhaul: Meta actually matches now (llama, zuckerberg, facebook…), 18 new companies (DeepSeek, Cursor, CoreWeave, SSI, Thinking Machines…), 4 new topics (AI Agents, AI Coding, AI Copyright, AI Economy), people keywords for the major labs, stale keywords fixed (Gelsinger→Lip-Bu Tan, Wang→Meta), `aisi` false-positive fix, dead Reuters feed replaced with The Guardian + Wired. New **Voices** page (`voices.html` + `voices.gs`): a reading room of ~22 curated AI voices in four desks, with monthly tabs and per-voice summary.
- **v1** (2025) — Original headlines tracker: RSS + AISI scraping, keyword scoring, Google Sheets pipeline, PWA dashboard with saved-tag sync.
