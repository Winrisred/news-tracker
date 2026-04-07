# AI & BigTech News Tracker

Automated news aggregator that collects AI and BigTech headlines from top sources, stores them in Google Sheets, and displays them on an elegant web dashboard.

## Setup

### 1. Google Sheet + Apps Script

1. Create a new Google Sheet
2. Go to **Extensions > Apps Script**
3. Delete default code, paste the contents of `google-apps-script/ai-bigtech-news.gs`
4. Save (Ctrl+S)
5. Run **setupSheets** (from the function dropdown > Run)
6. Grant permissions when prompted
7. Run **fetchNews** to test — check the "All News" sheet for articles
8. Run **createHourlyTrigger** to automate (fetches every hour)

### 2. Publish the Sheet for the web page

1. In Google Sheets: **File > Share > Publish to web**
2. Select sheet: **All News**
3. Format: **CSV**
4. Click **Publish** and copy the URL
5. In `web/index.html`, replace `YOUR_GOOGLE_SHEET_CSV_URL_HERE` with that URL

### 3. Host the web page (GitHub Pages)

1. Create a new GitHub repo (e.g. `ai-bigtech-news`)
2. Push the `web/` folder contents to it
3. Settings > Pages > Source: main branch
4. Your dashboard will be live at `https://yourusername.github.io/ai-bigtech-news/`

## Structure

```
news-tracker/
├── google-apps-script/
│   ├── ai-bigtech-news.gs       <- New script (AI & BigTech focused)
│   └── energyandtech.gs         <- Old version (backup)
├── web/
│   └── index.html                <- Dashboard web page
└── README.md
```

## Google Sheet structure

- **All News** — Every article (Date, Headline, Link, Source, Image URL, Companies, Topics, Tags)
- **2026-04**, etc. — Auto-created monthly tabs
- **Summary** — Dashboard with top companies, topics, sources, monthly trends

## Features

- **Scoring system** for keyword matching — reduces false positives (headline match = 3 points, description = 1 point, threshold = 3)
- **70+ companies tracked** — AI labs, Big Tech, chips, cloud, infrastructure, defense, Chinese tech
- **15+ topics** — AI regulation, safety, ethics, semiconductors, data centers, policy, labor
- **RSS sources** — NYT, FT, TechCrunch, The Verge, Ars Technica, VentureBeat, Reuters, MIT Tech Review
- **Web dashboard** — Filter by period (today to 30 days) and keyword/company
- **Smart thumbnails** — Real images when available, curated stock photos with source-colored tints as fallback

## Backup

The `.gs` files are local backups. If you delete the Google Sheet, the script is lost — restore from these files.
