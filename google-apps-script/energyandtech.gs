// ============================================================
// Tech & Energy News Tracker v2 — Google Apps Script
// Structure:
//   • "All News"        — master sheet, every article ever
//   • "2026-March" etc  — one tab per month, auto-created
//   • "Summary"         — live dashboard with counts & stats
// ============================================================

// ── Configuration ────────────────────────────────────────────

const MASTER_SHEET = "All News";
const SUMMARY_SHEET = "Summary";
const MAX_ROWS = 5000; // max rows in master sheet before trimming oldest

const TECH_KEYWORDS = [
  "artificial intelligence",
  "AI",
  "machine learning",
  "semiconductor",
  "chip",
  "data center",
  "data centre",
  "cloud",
  "cybersecurity",
  "tech",
  "software",
  "startup",
  "OpenAI",
  "Google",
  "Apple",
  "Microsoft",
  "Meta",
  "NVIDIA",
  "robotics",
  "quantum",
  "5G",
  "electric vehicle",
  "EV",
  "autonomous",
  "algorithm",
  "LLM",
  "generative",
  "smartphone",
  "IPO",
  "deepfake",
  "Arm Holdings",
  "SpaceX",
  "Tesla",
  "Anthropic",
  "Gemini",
];

const ENERGY_KEYWORDS = [
  "energy",
  "oil",
  "gas",
  "renewables",
  "solar",
  "wind",
  "nuclear",
  "battery",
  "storage",
  "grid",
  "electricity",
  "power",
  "fossil fuel",
  "LNG",
  "OPEC",
  "Brent",
  "crude",
  "pipeline",
  "refinery",
  "carbon",
  "emissions",
  "climate",
  "clean energy",
  "hydrogen",
  "geothermal",
  "Hormuz",
  "Kharg",
  "energy transition",
  "utility",
  "kilowatt",
  "megawatt",
  "gigawatt",
  "coal",
  "petroleum",
];

const RSS_FEEDS = [
  {
    source: "Reuters",
    url: "https://feeds.reuters.com/reuters/technologyNews",
  },
  { source: "Reuters", url: "https://feeds.reuters.com/reuters/businessNews" },
  {
    source: "NYT",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  },
  {
    source: "NYT",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml",
  },
  {
    source: "NYT",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
  },
  { source: "Financial Times", url: "https://www.ft.com/rss/home" },
  {
    source: "Bloomberg",
    url: "https://feeds.bloomberg.com/technology/news.rss",
  },
  { source: "Bloomberg", url: "https://feeds.bloomberg.com/energy/news.rss" },
];

// Colours
const C_HEADER = "#1A3A5C";
const C_SUBHEADER = "#2E6DA4";
const C_TECH_BG = "#E8F4FD";
const C_ENERGY_BG = "#E8F8F0";
const C_TECH_TEXT = "#1A6BB5";
const C_ENERGY_TEXT = "#1A7A45";
const C_WHITE = "#FFFFFF";
const C_LIGHT_GRAY = "#F5F5F5";

// ── Date helpers ─────────────────────────────────────────────

function getMonthSheetName(dateStr) {
  // dateStr is "yyyy-MM-dd" — returns e.g. "2026-March"
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.toLocaleString("en-US", { month: "long" });
  return year + "-" + month;
}

function getCurrentMonthSheetName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString("en-US", { month: "long" });
  return year + "-" + month;
}

// ── Text helpers ─────────────────────────────────────────────

function classify(title, summary) {
  const text = (title + " " + summary).toLowerCase();
  const isTech = TECH_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  const isEnergy = ENERGY_KEYWORDS.some((kw) =>
    text.includes(kw.toLowerCase()),
  );
  if (isTech && isEnergy) {
    const t = TECH_KEYWORDS.filter((kw) =>
      text.includes(kw.toLowerCase()),
    ).length;
    const e = ENERGY_KEYWORDS.filter((kw) =>
      text.includes(kw.toLowerCase()),
    ).length;
    return t >= e ? "Technology" : "Energy";
  }
  if (isTech) return "Technology";
  if (isEnergy) return "Energy";
  return null;
}

function extractTags(title, summary) {
  const combined = (title + " " + summary).toLowerCase();
  const hits = [];
  const seen = new Set();
  for (const kw of [...TECH_KEYWORDS, ...ENERGY_KEYWORDS]) {
    if (combined.includes(kw.toLowerCase()) && !seen.has(kw.toLowerCase())) {
      hits.push(kw);
      seen.add(kw.toLowerCase());
    }
    if (hits.length >= 4) break;
  }
  return hits.join(", ");
}

function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d))
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {}
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd",
  );
}

// ── RSS fetching ─────────────────────────────────────────────

function fetchFeed(feedCfg) {
  try {
    const response = UrlFetchApp.fetch(feedCfg.url, {
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) return [];
    const xml = response.getContentText();
    const doc = XmlService.parse(xml);
    const root = doc.getRootElement();
    const ns = root.getNamespace();

    let items = root.getChild("channel", ns)
      ? root.getChild("channel", ns).getChildren("item", ns)
      : root.getChildren("entry", ns);
    if (!items || items.length === 0) {
      const ch = root.getChild("channel");
      if (ch) items = ch.getChildren("item");
    }

    return (items || [])
      .map((item) => {
        const getText = (tag) => {
          const el = item.getChild(tag) || item.getChild(tag, ns);
          return el ? stripHtml(el.getText() || el.getValue()) : "";
        };
        const getLink = () => {
          const el = item.getChild("link") || item.getChild("link", ns);
          if (!el) return "";
          return el.getText() || el.getAttribute("href")?.getValue() || "";
        };
        return {
          source: feedCfg.source,
          title: getText("title"),
          summary: (
            getText("description") ||
            getText("summary") ||
            getText("content")
          ).slice(0, 400),
          link: getText("link") || getLink(),
          pubDate: parseDate(
            getText("pubDate") || getText("published") || getText("updated"),
          ),
        };
      })
      .filter((a) => a.title && a.link);
  } catch (e) {
    Logger.log("Error fetching " + feedCfg.url + ": " + e.message);
    return [];
  }
}

// ── Seen URLs ────────────────────────────────────────────────

function getSeenUrls() {
  const raw = PropertiesService.getScriptProperties().getProperty("seenUrls");
  return raw ? new Set(JSON.parse(raw)) : new Set();
}

function saveSeenUrls(seenSet) {
  const arr = [...seenSet].slice(-5000);
  PropertiesService.getScriptProperties().setProperty(
    "seenUrls",
    JSON.stringify(arr),
  );
}

// ── Sheet helpers ────────────────────────────────────────────

const HEADERS = [
  "Date",
  "Category",
  "Source",
  "Headline",
  "Summary",
  "Link",
  "Tags",
];
const COL_WIDTHS = [100, 110, 130, 380, 480, 280, 200];

function writeHeaders(sheet) {
  const r = sheet.getRange(1, 1, 1, HEADERS.length);
  r.setValues([HEADERS]);
  r.setBackground(C_HEADER);
  r.setFontColor(C_WHITE);
  r.setFontWeight("bold");
  r.setFontSize(11);
  sheet.setFrozenRows(1);
  COL_WIDTHS.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

function ensureSheet(name, position) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(
      name,
      position !== undefined ? position : ss.getSheets().length,
    );
    writeHeaders(sheet);
  }
  return sheet;
}

function styleDataRow(sheet, rowNum, category) {
  const range = sheet.getRange(rowNum, 1, 1, 7);
  range.setBackground(category === "Technology" ? C_TECH_BG : C_ENERGY_BG);
  range.setFontSize(10);
  range.setVerticalAlignment("top");
  range.setWrap(true);
  const catCell = sheet.getRange(rowNum, 2);
  catCell.setFontColor(category === "Technology" ? C_TECH_TEXT : C_ENERGY_TEXT);
  catCell.setFontWeight("bold");
  sheet.getRange(rowNum, 6).setFontColor("#1155CC");
}

function insertRowsIntoSheet(sheet, rows) {
  if (rows.length === 0) return;
  sheet.insertRowsBefore(2, rows.length);
  sheet.getRange(2, 1, rows.length, 7).setValues(rows.map((r) => r.data));
  rows.forEach((row, i) => styleDataRow(sheet, 2 + i, row.category));
}

// ── Summary sheet ────────────────────────────────────────────

function rebuildSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(MASTER_SHEET);
  if (!masterSheet) return;

  // Get or create summary sheet — always last tab
  let summary = ss.getSheetByName(SUMMARY_SHEET);
  if (!summary) summary = ss.insertSheet(SUMMARY_SHEET, ss.getSheets().length);
  summary.clearContents();
  summary.clearFormats();

  const lastRow = masterSheet.getLastRow();
  if (lastRow < 2) return;

  // Read all data from master
  const data = masterSheet.getRange(2, 1, lastRow - 1, 7).getValues();

  // ── Build aggregations ───────────────────────────────────
  const byMonth = {};
  const bySource = {};
  const byCategory = { Technology: 0, Energy: 0 };
  const tagCount = {};

  data.forEach((row) => {
    const [date, category, source, , , , tags] = row;
    if (!date) return;

    // Month bucket  e.g. "2026-March"
    const monthKey = getMonthSheetName(date.toString ? date.toString() : date);
    byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
    if (category) byCategory[category] = (byCategory[category] || 0) + 1;

    // Tags
    (tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((tag) => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
  });

  const totalArticles = data.filter((r) => r[0]).length;

  // ── Write summary ─────────────────────────────────────────
  let row = 1;

  const setHeader = (text, color) => {
    const c = summary.getRange(row, 1, 1, 4);
    c.merge();
    c.setValue(text);
    c.setBackground(color || C_HEADER);
    c.setFontColor(C_WHITE);
    c.setFontWeight("bold");
    c.setFontSize(12);
    c.setVerticalAlignment("middle");
    summary.setRowHeight(row, 32);
    row++;
  };

  const setSubHeader = (cols) => {
    const r = summary.getRange(row, 1, 1, cols.length);
    r.setValues([cols]);
    r.setBackground(C_SUBHEADER);
    r.setFontColor(C_WHITE);
    r.setFontWeight("bold");
    row++;
  };

  const setDataRow = (cols, bg) => {
    summary.getRange(row, 1, 1, cols.length).setValues([cols]);
    if (bg) summary.getRange(row, 1, 1, cols.length).setBackground(bg);
    row++;
  };

  // Title
  summary
    .getRange(row, 1, 1, 4)
    .merge()
    .setValue("📰 Tech & Energy News — Summary Dashboard")
    .setBackground(C_HEADER)
    .setFontColor(C_WHITE)
    .setFontWeight("bold")
    .setFontSize(14)
    .setHorizontalAlignment("center");
  summary.setRowHeight(row, 40);
  row++;

  summary
    .getRange(row, 1, 1, 4)
    .merge()
    .setValue(
      "Last updated: " +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          "dd MMM yyyy, HH:mm",
        ),
    )
    .setBackground("#EEF4FB")
    .setFontColor("#555555")
    .setFontStyle("italic")
    .setHorizontalAlignment("center");
  row += 2;

  // ── Total ────────────────────────────────────────────────
  setHeader("OVERVIEW", C_HEADER);
  setSubHeader(["Metric", "Count"]);
  setDataRow(["Total articles", totalArticles], C_LIGHT_GRAY);
  setDataRow(["Technology articles", byCategory["Technology"] || 0]);
  setDataRow(["Energy articles", byCategory["Energy"] || 0], C_LIGHT_GRAY);
  row++;

  // ── By month ─────────────────────────────────────────────
  setHeader("ARTICLES BY MONTH", C_SUBHEADER);
  setSubHeader(["Month", "Articles"]);
  Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([month, count], i) =>
      setDataRow([month, count], i % 2 === 0 ? C_LIGHT_GRAY : null),
    );
  row++;

  // ── By source ────────────────────────────────────────────
  setHeader("ARTICLES BY SOURCE", C_SUBHEADER);
  setSubHeader(["Source", "Articles"]);
  Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count], i) =>
      setDataRow([source, count], i % 2 === 0 ? C_LIGHT_GRAY : null),
    );
  row++;

  // ── By category ──────────────────────────────────────────
  setHeader("ARTICLES BY CATEGORY", C_SUBHEADER);
  setSubHeader(["Category", "Articles", "% of total"]);
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count], i) => {
      const pct =
        totalArticles > 0
          ? Math.round((count / totalArticles) * 100) + "%"
          : "0%";
      summary.getRange(row, 1, 1, 3).setValues([[cat, count, pct]]);
      if (i % 2 === 0)
        summary.getRange(row, 1, 1, 3).setBackground(C_LIGHT_GRAY);
      row++;
    });
  row++;

  // ── Top tags ─────────────────────────────────────────────
  setHeader("TOP KEYWORDS / TAGS", C_SUBHEADER);
  setSubHeader(["Keyword", "Mentions"]);
  Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([tag, count], i) =>
      setDataRow([tag, count], i % 2 === 0 ? C_LIGHT_GRAY : null),
    );

  // Column widths
  summary.setColumnWidth(1, 200);
  summary.setColumnWidth(2, 100);
  summary.setColumnWidth(3, 100);
  summary.setColumnWidth(4, 100);

  Logger.log("Summary sheet rebuilt.");
}

// ── Main fetch ───────────────────────────────────────────────

function fetchNews() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seen = getSeenUrls();
  const newRows = [];

  for (const feedCfg of RSS_FEEDS) {
    const articles = fetchFeed(feedCfg);
    Logger.log(feedCfg.source + ": " + articles.length + " entries");

    for (const art of articles) {
      if (!art.link || seen.has(art.link)) continue;
      const category = classify(art.title, art.summary);
      if (!category) continue;
      const tags = extractTags(art.title, art.summary);
      newRows.push({
        data: [
          art.pubDate,
          category,
          art.source,
          art.title,
          art.summary,
          art.link,
          tags,
        ],
        category,
        pubDate: art.pubDate,
      });
      seen.add(art.link);
    }
  }

  if (newRows.length === 0) {
    Logger.log("No new articles.");
    saveSeenUrls(seen);
    rebuildSummary();
    return;
  }

  // Sort newest first
  newRows.sort((a, b) => b.pubDate.localeCompare(a.pubDate));

  // 1. Write to master "All News" sheet
  const master = ensureSheet(MASTER_SHEET, 0);
  insertRowsIntoSheet(master, newRows);

  // Trim master if too long
  const total = master.getLastRow();
  if (total > MAX_ROWS + 1)
    master.deleteRows(MAX_ROWS + 2, total - MAX_ROWS - 1);

  // 2. Write to the correct monthly sheet(s)
  // Group rows by month
  const byMonth = {};
  newRows.forEach((row) => {
    const monthName = getMonthSheetName(row.pubDate);
    if (!byMonth[monthName]) byMonth[monthName] = [];
    byMonth[monthName].push(row);
  });

  // For each month, ensure the sheet exists and insert rows
  const sheets = ss.getSheets();
  const sheetNames = sheets.map((s) => s.getName());

  Object.entries(byMonth).forEach(([monthName, rows]) => {
    // Position monthly sheets after master (index 1+), alphabetically
    const monthPosition = 1 + Object.keys(byMonth).sort().indexOf(monthName);
    const monthSheet = ensureSheet(monthName, monthPosition);
    insertRowsIntoSheet(monthSheet, rows);
  });

  // 3. Rebuild summary
  rebuildSummary();

  saveSeenUrls(seen);
  Logger.log("Added " + newRows.length + " new articles.");
}

// ── Trigger setup ────────────────────────────────────────────

function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "fetchNews")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("fetchNews").timeBased().everyHours(1).create();

  SpreadsheetApp.getUi().alert(
    "✓ Hourly schedule set up!\n\n" +
      "The script will now run every hour automatically — even when your Mac is off.\n\n" +
      "Click OK, then use News Tracker → Fetch news now to get your first batch.",
  );
}

// ── Menu ─────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("News Tracker")
    .addItem("Fetch news now", "fetchNews")
    .addItem("Rebuild summary sheet", "rebuildSummary")
    .addSeparator()
    .addItem("Set up hourly schedule", "setupHourlyTrigger")
    .addItem("Clear seen URLs (reset)", "clearSeenUrls")
    .addToUi();
}

function clearSeenUrls() {
  PropertiesService.getScriptProperties().deleteProperty("seenUrls");
  SpreadsheetApp.getUi().alert(
    "Done! Seen URLs cleared. Next fetch will re-import all available articles.",
  );
}
