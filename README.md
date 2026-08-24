# AI & BigTech News Tracker

**Current version: v3.13** (2026-08)

Versioning rule: every pushed change set bumps the minor version. The badge next to "News Tracker" in the page header always shows the deployed version — if the badge matches this number, you're seeing the latest.

Automated news aggregator that collects AI and BigTech headlines from RSS feeds and the AISI blog, stores them in Google Sheets, and displays them on a privacy-friendly web dashboard installable as a PWA.

Four pages, one identity:

- **Headlines** (`index.html`) — the wire desk: hourly headlines from major outlets, filtered by company/topic keywords.
- **Voices** (`voices.html`) — the reading room: essays & commentary from a curated roster of 30 AI voices (newsletters, blogs, and press coverage) in four desks: Researchers & Builders, Industry & Chips, Policy & China, Culture & Society. The landing view is a grid of author squares (portrait or styled placeholder, desk-colored); clicking a square opens that voice's posts. No keyword filtering — the roster is curated by author.
- **Library** (`library.html`) — the bookshelf: the books labelled `AIBestBooks` in my private arxiu (PocketBase on the home NUC), exported to a static shelf with self-hosted covers. Updated on demand by running `scripts/export_ai_books.py` **in the arxiu project** (it writes `data/books.json` + `images/books/*.jpg` here; covers are fetched once from Open Library/Google Books and then live in this repo), followed by a commit & push. Books without a findable cover get a typographic spine-style placeholder.
- **Incidents** (`incidents.html`) — the accountability ledger: ~2,250 documented AI incidents from the [AIAAIC Repository](https://www.aiaaic.org/aiaaic-repository) (CC BY-SA 4.0, fetched from its public sheet) plus a live stream of new reports from the [AI Incident Database](https://incidentdatabase.ai) RSS. The two sources stay as parallel streams with distinct visuals (petrol-blue registry rows with taxonomy chips vs sienna report rows with snippets) — never merged or deduplicated across each other. Filters by source, year, sector, and full-text search.

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

The roster lives in the `VOICES` array at the top of `voices.gs` — add a voice by adding one line (any RSS/Atom feed works: Substack, Ghost, WordPress, plain blogs). For voices without a feed, use a Bing News search RSS URL (`https://www.bing.com/news/search?q=...&format=rss`) with `type: "gnews"` — it collects press coverage by and about them, and the script unwraps Bing's redirect links into direct article URLs. (Google News query URLs also work but their links bounce via a redirect + EU consent wall.)

Every voice wears its **desk's color**; within a desk, voices are told apart by a small geometric **mark** (filled/outlined circle, diamond, triangle, square, hexagon) assigned in `VOICE_SHAPES` in `voices.html` — unknown voices get one by hash.

**Author photos**: each grid square looks for `images/voices/<slug>.jpg` — the slug is the lowercase name with non-alphanumerics as hyphens (`zvi-mowshowitz.jpg`, `swyx-alessio.jpg`, `timothy-b-lee.jpg`; full list in `images/voices/README.md`). Drop a photo in and it appears with an automatic duotone treatment (grayscale over the desk-color wash) so portraits from different sources look like one consistent set; square-ish crops work best. Without a photo, the tile shows the voice's shape mark and initials on the navy gradient. Wikimedia Commons carries freely licensed portraits for most of these people — check each file's license and attribution requirements before adding it.

**Retiring a voice**: delete its line from `VOICES` in voices.gs, add the name to `RETIRED_VOICES` (both in voices.gs and voices.html), and run **Voices Tracker → Remove retired voices** once to purge its stored rows.

### 5. Arxiu (save articles & essays as PDFs to Drive)

Both pages can archive what you read as PDFs named `LastName - Year - Title.pdf` in the Drive folder **"Arxiu — AI Voices"** — ready to import into a reference archive. Everything runs through the voices Apps Script deployed as a web app:

1. In the voices sheet's Apps Script editor: **Deploy → New deployment → Web app**, Execute as: **Me**, Who has access: **Anyone**, then copy the `/exec` URL
2. Paste the URL once, on either page (it's shared): voices.html footer → **⚙️ Arxiu settings**, or index.html footer → **⚙️ Settings** → "Arxiu — web app URL"

Three ways to archive:

- **Voices page** — "Save to Arxiu" on each essay
- **News page** — "🗂 PDF" on each card
- **Bookmarklet** (for paywalled subscriptions — FT, NYT, Economist…): in the voices ⚙️ panel, drag the **→ Arxiu** button to your bookmarks bar. Click it while reading any article and it sends the full text *as your logged-in browser sees it* to the same pipeline. This is the only way to capture subscriber-only text — the server-side fetch is anonymous, so tracker-page saves of hard-paywalled articles contain just the public teaser plus metadata and link. Substack essays and most news articles capture fully either way.

**Page numbers**: Apps Script can't insert page-number fields, so the script copies a template Doc when `ARXIU_TEMPLATE_ID` is set in voices.gs. Create a Google Doc, **Insert → Page numbers** (e.g. bottom right), copy its ID from the URL (`docs.google.com/document/d/<ID>/edit`), paste it into the constant, save, and redeploy (New version). Every PDF then inherits the numbered footer — and the template's margins/page setup, if you customize them. If you add someone, optionally give them an accent color in `VOICE_ACCENTS` in `voices.html` (unknown voices get an auto-generated color).

### 6. Incidents page (third Sheet + script)

1. Create a **third** Google Sheet
2. **Extensions > Apps Script**, paste `google-apps-script/incidents.gs`, save
3. Run **setupSheets**, then **fetchIncidents** — the first run backfills ~2,250 AIAAIC records (takes a minute)
4. Run **createTwelveHourTrigger** (registries update daily-ish)
5. **File > Share > Publish to web** — sheet: **All Incidents**, format: **CSV** — paste the URL into `INCIDENTS_CSV_URL` in `incidents.html`

## Structure

```
news-tracker/
├── google-apps-script/
│   ├── ai-bigtech-news.gs    <- Headlines Apps Script (paste into Google Sheets)
│   ├── voices.gs             <- Voices Apps Script (paste into a SECOND Sheet)
│   └── incidents.gs          <- Incidents Apps Script (paste into a THIRD Sheet)
├── images/
│   ├── aisi/                 <- 120 local nature/forest/sea/plants fallbacks (AISI)
│   ├── general/              <- 180 local abstract/sky/landscape fallbacks (RSS)
│   └── favicon-*.png         <- Favicons and PWA icons
├── data/
│   └── books.json            <- Library data (written by the arxiu export script)
├── index.html                <- Headlines dashboard
├── voices.html               <- Voices reading room
├── incidents.html            <- Incidents ledger
├── library.html              <- Library bookshelf
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

- **v3.13** (2026-08) — New **Library** page: a bookshelf of the books labelled `AIBestBooks` in the private arxiu, exported on demand via `scripts/export_ai_books.py` (in the arxiu project) — static data + self-hosted covers (fetched once from Open Library/Google Books), typographic spine placeholders for the rest. Fourth nav tab everywhere.
- **v3.12** (2026-08) — The Data Tank joins Policy & China (via their Medium feed — datatank.org has none) with their logo. EU AI Industrial Policy Monitor's logo removed (it's an AI Now Institute project, so its Substack logo duplicated the AI Now mark; the tile uses the standard placeholder). Roster: 30.
- **v3.11** (2026-08) — Three publication-voices added with fetched logos: EU AI Industrial Policy Monitor and AI Now Institute (Policy & China), and State of AI Report (Industry & Chips, via Air Street Press — stateof.ai itself has no feed). Roster: 29.
- **v3.10** (2026-08) — Kaltheuner feed URL fixed: a Substack @handle is not the publication subdomain (`frederikekaltheuner1.substack.com/feed` serves an HTML page, which broke XML parsing); her real feed is `frederike.substack.com/feed`.
- **v3.9** (2026-08) — Arvind Narayanan (AI as Normal Technology, formerly AI Snake Oil) joins Researchers & Builders; Frederike Kaltheuner joins Policy & China — both with sketch portraits. Roster: 26.
- **v3.8** (2026-08) — Audrey Tang joins Policy & China (audreyt.substack.com), with sketch portrait. Roster: 24.
- **v3.7** (2026-08) — Search boxes on Headlines (headline/tags/source/author, combines with existing filters) and Voices (full-text over essays; results river replaces the grid while a query is active). All three pages now searchable.
- **v3.6** (2026-08) — Four voices added: Melanie Mitchell (AI: A Guide for Thinking Humans) and Fei-Fei Li to Researchers & Builders; Jasmine Sun (jasmi.news) and Shoshana Zuboff to Culture & Society — with sketch portraits and two new marks (star/star-o). Roster: 23.
- **v3.5** (2026-08) — AIID stream rebuilt as one row per **incident**: the RSS (one item per report, dated by ingestion) now only discovers incident numbers; each incident's real date, canonical title, and description come from the site's page-data JSON. Fixes duplicate rows and wrong dates (`rebuildAiidRows()` migrates existing rows).
- **v3.4** (2026-08) — Voice portraits live: 18 sketch illustrations in images/voices/ (originals + web-optimized 480px JPEGs, ~50KB each; the page tries `.jpg` then `.png` then the placeholder). Files renamed to the canonical slugs.
- **v3.3** (2026-08) — AIID headlines link to the incident record on incidentdatabase.ai (always reachable) instead of the cited article, which is often geo-blocked for EEA visitors (HTTP 451) or rots; the original report stays as a secondary link.
- **v3.2** (2026-08) — Incidents page live (CSV wired). Undated AIAAIC records handled honestly: blank date in the sheet, "Undated" on the page, sorted last (`repairUndatedAiaaic()` fixes rows from the first backfill).
- **v3.1** (2026-08) — New **Incidents** page (`incidents.html` + `incidents.gs`): an accountability ledger of ~2,250 AIAAIC records (CC BY-SA 4.0) plus live AIID reports, as visually distinct parallel streams; filters by source/year/sector and the site's first full-text search. Third nav tab on all pages.
- **v3.0** (2026-08) — Voices redesigned as an **author grid**: squares with portraits (auto duotone via `images/voices/<slug>.jpg`) or shape-mark placeholders; clicking a square opens that voice's posts (hash-addressable, browser back works). Roster trimmed to 19 (retired Erik Hoel, L.M. Sacasas, Tressie McMillan Cottom; `removeRetiredVoices()` purges their rows). Voice dropdown and latest-strip retired with it.
- **v2.9** (2026-08) — Instant page switching: both pages cache the downloaded CSV in localStorage and render from it immediately; the network is consulted only when the copy is over 10 minutes old, with quiet background updates (skipped mid-scroll so the page never jumps). Stale data also stands in when the network fails.
- **v2.8** (2026-08) — Bookmarklet author detection via JSON-LD structured data (fixes "Unknown" on sites like Yahoo where the byline isn't in meta tags); publication from og:site_name; success alert echoes the captured author/year. Client-side only — re-drag the bookmarklet, no redeploy.
- **v2.7** (2026-08) — Page numbers in Arxiu PDFs via an optional template Doc (`ARXIU_TEMPLATE_ID` in voices.gs): the script copies a Doc whose footer has page numbers, since Apps Script cannot insert page-number fields directly.
- **v2.6** (2026-08) — Every PDF's "Archived" line now stamps the script version that produced it (and testArxiu's alert shows it), so a stale web-app deployment is immediately visible.
- **v2.5** (2026-08) — Arxiu PDF redesign: serif typography, paragraph spacing, hero image (via bookmarklet's og:image), junk-line filtering (photo credits, "read more", media-player fallbacks), drop-cap fix, and a fix for italic styling bleeding into the body. Requires re-pasting voices.gs, a deployment "New version", and re-dragging the bookmarklet.
- **v2.4** (2026-08) — "Last N days" input selects its value on focus, so typing a number replaces "all" directly (both pages).
- **v2.3** (2026-08) — `testArxiu()` debug function + menu item: creates a test PDF from the editor, forces the Drive/Docs authorization prompt, and prints redeploy instructions. (Apps Script gotcha: a web app runs the code snapshot from its deployment — after pasting new code, update the deployment via Manage deployments → New version.)
- **v2.2** (2026-08) — Bookmarklet renamed "🗂 Save to Arxiu" (clearer in the bookmarks bar); tooltips on archive buttons name the Drive folder.
- **v2.1** (2026-08) — **Arxiu**: save any essay or news article as a PDF (`LastName - Year - Title.pdf`) to Drive, with a bookmarklet capturing full text of subscriber-only articles. Voice marks redesigned: desk colors + per-voice geometric shapes. Desk/voice filters made mutually exclusive. Press coverage switched to Bing News (direct article links). Monthly tabs + auto-formatting for the voices sheet. HTML-entity cleanup across both pages.
- **v2** (2026-08) — Keyword overhaul: Meta actually matches now (llama, zuckerberg, facebook…), 18 new companies (DeepSeek, Cursor, CoreWeave, SSI, Thinking Machines…), 4 new topics (AI Agents, AI Coding, AI Copyright, AI Economy), people keywords for the major labs, stale keywords fixed (Gelsinger→Lip-Bu Tan, Wang→Meta), `aisi` false-positive fix, dead Reuters feed replaced with The Guardian + Wired. New **Voices** page (`voices.html` + `voices.gs`): a reading room of ~22 curated AI voices in four desks, with monthly tabs and per-voice summary.
- **v1** (2025) — Original headlines tracker: RSS + AISI scraping, keyword scoring, Google Sheets pipeline, PWA dashboard with saved-tag sync.
