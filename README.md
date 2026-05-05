# AI & BigTech News Tracker

Automated news aggregator that collects AI and BigTech headlines from RSS feeds and the AISI blog, stores them in Google Sheets, and displays them on a privacy-friendly web dashboard installable as a PWA.

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

## Structure

```
news-tracker/
├── google-apps-script/
│   └── ai-bigtech-news.gs    <- Apps Script (paste into Google Sheets)
├── images/
│   ├── aisi/                 <- 120 local nature/forest/sea/plants fallbacks (AISI)
│   ├── general/              <- 180 local abstract/sky/landscape fallbacks (RSS)
│   └── favicon-*.png         <- Favicons and PWA icons
├── index.html                <- Dashboard
├── manifest.json             <- PWA manifest
├── sw.js                     <- Service worker (offline support)
└── README.md
```

## Sheet structure

Columns: Date, Headline, Link, Source, Author, Image URL, Companies, Topics, Tags, APA Citation.

Tabs (auto-ordered after each fetch): **Summary** → **All News** → monthly tabs newest-first (e.g. `2026-04`, `2026-03`...).

## Sources

- **RSS**: NYT, FT, TechCrunch, The Verge, Ars Technica, VentureBeat, Reuters, MIT Tech Review
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

The `.gs` file in this repo is the local source of truth. If the Google Sheet is deleted, the script disappears with it — restore it from this file.
