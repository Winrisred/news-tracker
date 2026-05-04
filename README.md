# AI & BigTech News Tracker

Automated news aggregator that collects AI and BigTech headlines, stores them in Google Sheets, and displays them on a web dashboard.

## Setup

### 1. Google Sheet + Apps Script

1. Create a new Google Sheet
2. **Extensions > Apps Script**, paste the contents of `google-apps-script/ai-bigtech-news.gs`, save (Ctrl+S)
3. Run **setupSheets** (function dropdown > Run), grant permissions
4. Run **fetchNews** to test — check the "All News" sheet
5. Run **createHourlyTrigger** to automate (fetches every hour)

### 2. Publish the Sheet as CSV

1. **File > Share > Publish to web** — sheet: **All News**, format: **CSV**, click **Publish**, copy URL
2. In `index.html`, replace `YOUR_GOOGLE_SHEET_CSV_URL_HERE` with that URL

### 3. Host on GitHub Pages

Push to a GitHub repo, then **Settings > Pages > Source: main branch**. Live at `https://yourusername.github.io/news-tracker/`.

## Structure

```
news-tracker/
├── google-apps-script/
│   └── ai-bigtech-news.gs    <- Apps Script (paste into Google Sheets)
├── images/                    <- Favicons and PWA icons
├── index.html                 <- Dashboard
├── manifest.json              <- PWA manifest
└── sw.js                      <- Service worker (offline support)
```

## Sheet structure

Columns: Date, Headline, Link, Source, Author, Image URL, Companies, Topics, Tags, APA Citation.

Tabs (auto-ordered after each fetch): **Summary** → **All News** → monthly tabs newest first (e.g. `2026-04`, `2026-03`...).

## Sources

- **RSS**: NYT, FT, TechCrunch, The Verge, Ars Technica, VentureBeat, Reuters, MIT Tech Review
- **HTML scraping**: AISI (UK AI Safety Institute blog — no RSS feed available)

## Features

- **Keyword scoring** — headline match = 3 pts, description match = 1 pt, threshold = 3 (reduces false positives)
- **70+ companies, 25+ topics** tracked across AI labs, Big Tech, chips, cloud, defense, policy, etc.
- **APA 7th-edition citations** auto-generated for every article
- **Web dashboard** — filter by time period (default: all) or keyword
- **Smart thumbnails** — real images when available; curated stock photos with source-tinted overlays as fallback (nature photos for AISI)
- **PWA** — installable on mobile/desktop, works offline via service worker

## Apps Script menu (`News Tracker`)

- Fetch news now / Setup sheets
- Create or remove hourly trigger
- Update summary / Reformat all sheets / Reorder sheet tabs / Backfill authors
- Test AISI scrape (debug)

## Backup

The `.gs` file is the local source of truth. If the Google Sheet is deleted, restore the script from this file.
