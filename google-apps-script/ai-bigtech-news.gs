// ============================================================
// AI & BigTech News Tracker — Google Apps Script
//
// Sheets:
//   • "All News"        — every article ever collected
//   • "2026-04" etc     — auto-created monthly tabs
//   • "Summary"         — dashboard with counts & stats
//
// Setup:
//   1. Create a new Google Sheet
//   2. Extensions → Apps Script → paste this code
//   3. Run setupSheets() once
//   4. Run createHourlyTrigger() to automate
// ============================================================

// ── Configuration ───────────────────────────────────────────

const MASTER_SHEET = "All News";
const SUMMARY_SHEET = "Summary";
const MAX_ROWS = 10000;

// ── RSS Feeds ───────────────────────────────────────────────

const RSS_FEEDS = [
  // Major newspapers
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", source: "NYT" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", source: "NYT" },
  { url: "https://www.ft.com/technology?format=rss", source: "FT" },
  { url: "https://www.ft.com/artificial-intelligence?format=rss", source: "FT" },

  // Tech publications
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://www.theverge.com/rss/index.xml", source: "The Verge" },
  { url: "https://feeds.arstechnica.com/arstechnica/technology-lab", source: "Ars Technica" },
  { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },

  // Wire services
  { url: "https://feeds.reuters.com/reuters/technologyNews", source: "Reuters" },

  // AI specific
  { url: "https://www.technologyreview.com/feed/", source: "MIT Tech Review" },
];

// ── Companies & Keywords ────────────────────────────────────

const KEYWORD_MAP = {
  // AI Labs
  "OpenAI": ["openai", "chatgpt", "gpt-4", "gpt-5", "dall-e", "sora"],
  "Anthropic": ["anthropic", "claude"],
  "Google DeepMind": ["deepmind", "gemini ai"],
  "Mistral": ["mistral"],
  "xAI": ["xai", "grok"],
  "Cohere": ["cohere"],
  "Stability AI": ["stability ai", "stable diffusion"],

  // Big Tech
  "Google": ["google", "alphabet", "waymo", "youtube ai"],
  "Microsoft": ["microsoft", "copilot", "azure ai", "bing ai"],
  "Apple": ["apple intelligence", "apple ai", "apple chip"],
  "Meta": ["meta ai", "llama model", "meta platform"],
  "Amazon": ["amazon ai", "aws ai", "alexa ai", "amazon web services"],
  "Samsung": ["samsung ai", "samsung chip"],
  "IBM": ["ibm", "watsonx"],

  // Chips & Hardware
  "NVIDIA": ["nvidia", "nvda", "geforce", "cuda", "h100", "b200", "blackwell", "jensen huang"],
  "AMD": ["amd", "advanced micro devices", "ryzen ai", "instinct"],
  "Intel": ["intel", "gaudi", "pat gelsinger"],
  "TSMC": ["tsmc", "taiwan semiconductor"],
  "ASML": ["asml", "euv lithography"],
  "Qualcomm": ["qualcomm", "snapdragon"],
  "Broadcom": ["broadcom"],
  "Arm": ["arm holdings", "arm chips", "arm ipo"],
  "SK Hynix": ["sk hynix", "hbm memory"],
  "Micron": ["micron"],

  // Cloud & Data Centers
  "AWS": ["aws", "amazon web services"],
  "Azure": ["azure", "microsoft cloud"],
  "Google Cloud": ["google cloud", "gcp"],
  "Oracle": ["oracle cloud", "oracle ai"],
  "Equinix": ["equinix"],
  "Digital Realty": ["digital realty"],

  // Internet Infrastructure
  "Cloudflare": ["cloudflare"],
  "Akamai": ["akamai"],
  "Fastly": ["fastly"],
  "Zscaler": ["zscaler"],

  // EV & Tech
  "Tesla": ["tesla", "elon musk"],
  "BYD": ["byd"],

  // Defense & Government Tech
  "Anduril": ["anduril", "palmer luckey"],
  "Palantir": ["palantir"],
  "Shield AI": ["shield ai"],

  // Enterprise & Software
  "Salesforce": ["salesforce", "einstein ai"],
  "SAP": ["sap ai"],
  "Databricks": ["databricks"],
  "Snowflake": ["snowflake"],
  "ServiceNow": ["servicenow"],
  "Adobe": ["adobe ai", "firefly"],

  // Chinese Tech
  "ByteDance": ["bytedance", "tiktok"],
  "Huawei": ["huawei"],
  "Baidu": ["baidu", "ernie bot"],
  "Alibaba": ["alibaba", "qwen"],
  "Tencent": ["tencent"],

  // Other
  "SpaceX": ["spacex", "starlink"],
  "Uber": ["uber ai"],
  "Spotify": ["spotify ai"],
  "Netflix": ["netflix ai"],
  "Scale AI": ["scale ai", "alexandr wang"],
  "Perplexity": ["perplexity"],
  "Runway": ["runway ai", "runway ml"],
  "Midjourney": ["midjourney"],
};

const TOPIC_MAP = {
  // AI Topics
  "AI Regulation": ["ai regulation", "ai act", "regulate ai", "ai law", "ai legislation", "ai governance", "ai policy"],
  "AI Safety": ["ai safety", "ai alignment", "ai risk", "existential risk", "ai threat", "superintelligence"],
  "AI Ethics": ["ai ethics", "ai bias", "algorithmic bias", "fairness ai", "responsible ai"],
  "Deepfakes": ["deepfake", "synthetic media", "face swap", "voice clone"],
  "AGI": ["agi", "artificial general intelligence", "human-level ai"],
  "LLM": ["large language model", "llm", "foundation model", "transformer model"],
  "Generative AI": ["generative ai", "genai", "text-to-image", "text-to-video", "ai-generated"],
  "Open Source AI": ["open source ai", "open-source model", "open weights", "hugging face"],
  "AI Healthcare": ["ai healthcare", "ai medical", "ai drug", "ai diagnosis", "biotech ai"],
  "AI Military": ["ai military", "ai defense", "ai weapon", "autonomous weapon", "ai warfare"],
  "AI Climate": ["ai climate", "ai energy", "ai sustainability", "green ai"],
  "AI Education": ["ai education", "ai tutor", "ai learning", "edtech ai"],

  // Industry Topics
  "Semiconductors": ["semiconductor", "chip war", "chip shortage", "foundry", "fab", "wafer", "nanometer", "process node"],
  "Data Centers": ["data center", "data centre", "hyperscale", "colocation", "server farm", "cooling system"],
  "Cloud Computing": ["cloud computing", "cloud infrastructure", "multi-cloud", "hybrid cloud"],
  "Cybersecurity": ["cybersecurity", "cyber attack", "ransomware", "data breach", "hacking", "zero-day"],
  "Robotics": ["robotics", "robot", "humanoid", "automation"],
  "Quantum Computing": ["quantum computing", "quantum computer", "qubit"],
  "5G/6G": ["5g", "6g", "telecom", "wireless network"],

  // Policy & Society
  "Government Policy": ["executive order", "white house ai", "congress ai", "senate ai", "eu commission", "china ai policy"],
  "Export Controls": ["export control", "chip ban", "sanctions semiconductor", "trade war tech"],
  "Antitrust": ["antitrust", "monopoly", "competition law", "breakup tech", "market dominance"],
  "Privacy": ["data privacy", "gdpr", "surveillance", "facial recognition", "tracking"],
  "Jobs & Labor": ["job displacement", "automation jobs", "ai replace", "workforce ai", "layoff tech", "hiring ai"],
  "Misinformation": ["misinformation", "disinformation", "fake news", "election ai", "propaganda ai"],
};

// ── Source Colors (for web page) ────────────────────────────

const SOURCE_COLORS = {
  "FT": "#FFF1E5",
  "NYT": "#F7F7F7",
  "TechCrunch": "#0A8F08",
  "The Verge": "#E84C3D",
  "Ars Technica": "#FF6600",
  "VentureBeat": "#2C68C9",
  "Reuters": "#FF8000",
  "MIT Tech Review": "#011B3C",
};


// ============================================================
// MAIN: Fetch and store news
// ============================================================

function fetchNews() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = getOrCreateSheet_(ss, MASTER_SHEET, getHeaders_());

  // Get existing URLs to avoid duplicates
  var existingUrls = getExistingUrls_(master);
  var newArticles = [];

  for (var i = 0; i < RSS_FEEDS.length; i++) {
    var feed = RSS_FEEDS[i];
    try {
      var articles = parseFeed_(feed.url, feed.source);
      for (var j = 0; j < articles.length; j++) {
        var article = articles[j];
        if (!existingUrls[article.link]) {
          // Tag with keywords
          article.companies = matchKeywords_(article, KEYWORD_MAP);
          article.topics = matchKeywords_(article, TOPIC_MAP);
          article.tags = article.companies.concat(article.topics).join(", ");

          // Only keep if relevant to AI/BigTech
          if (article.companies.length > 0 || article.topics.length > 0) {
            newArticles.push(article);
            existingUrls[article.link] = true;
          }
        }
      }
    } catch (e) {
      Logger.log("Error fetching " + feed.source + ": " + e.message);
    }
  }

  if (newArticles.length === 0) {
    Logger.log("No new articles found.");
    return;
  }

  // Sort by date (newest first)
  newArticles.sort(function(a, b) { return b.date - a.date; });

  // Write to Master sheet
  writeArticles_(master, newArticles);

  // Write to monthly sheet
  writeToMonthlySheets_(ss, newArticles);

  // Update summary
  updateSummary_(ss, master);

  // Trim if too many rows
  trimSheet_(master, MAX_ROWS);

  // Auto-sort and format all sheets
  autoFormatSheets_(ss);

  Logger.log("Added " + newArticles.length + " new articles.");
}


// ============================================================
// RSS PARSING
// ============================================================

function parseFeed_(url, source) {
  var articles = [];

  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { "User-Agent": "Mozilla/5.0 NewsTracker/1.0" }
    });

    if (response.getResponseCode() !== 200) {
      Logger.log(source + " returned HTTP " + response.getResponseCode());
      return articles;
    }

    var xml = XmlService.parse(response.getContentText());
    var root = xml.getRootElement();

    // Handle both RSS and Atom formats
    if (root.getName() === "rss") {
      articles = parseRss_(root, source);
    } else if (root.getName() === "feed") {
      articles = parseAtom_(root, source);
    }
  } catch (e) {
    Logger.log("Parse error for " + source + ": " + e.message);
  }

  return articles;
}

function parseRss_(root, source) {
  var articles = [];
  var channel = root.getChild("channel");
  if (!channel) return articles;

  var items = channel.getChildren("item");
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    // Author: try dc:creator first, then author
    var dcNs = XmlService.getNamespace("dc", "http://purl.org/dc/elements/1.1/");
    var author = "";
    try { author = getChildText_(item, "creator", dcNs); } catch(e) {}
    if (!author) author = getChildText_(item, "author");

    var article = {
      date: parseDate_(getChildText_(item, "pubDate")),
      headline: cleanText_(getChildText_(item, "title")),
      link: getChildText_(item, "link"),
      source: source,
      imageUrl: extractImage_(item),
      description: cleanText_(getChildText_(item, "description")),
      author: cleanText_(author)
    };
    if (article.headline && article.link) {
      articles.push(article);
    }
  }
  return articles;
}

function parseAtom_(root, source) {
  var articles = [];
  var ns = root.getNamespace();
  var entries = root.getChildren("entry", ns);

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var linkEl = null;
    var links = entry.getChildren("link", ns);
    for (var j = 0; j < links.length; j++) {
      var rel = links[j].getAttribute("rel");
      if (!rel || rel.getValue() === "alternate") {
        linkEl = links[j];
        break;
      }
    }

    // Author: try author/name (Atom standard)
    var author = "";
    var authorEl = entry.getChild("author", ns);
    if (authorEl) {
      var nameEl = authorEl.getChild("name", ns);
      author = nameEl ? nameEl.getText() : authorEl.getText();
    }

    var article = {
      date: parseDate_(getChildText_(entry, "published", ns) || getChildText_(entry, "updated", ns)),
      headline: cleanText_(getChildText_(entry, "title", ns)),
      link: linkEl ? linkEl.getAttribute("href").getValue() : "",
      source: source,
      imageUrl: extractImageAtom_(entry, ns),
      description: cleanText_(getChildText_(entry, "summary", ns) || getChildText_(entry, "content", ns)),
      author: cleanText_(author)
    };
    if (article.headline && article.link) {
      articles.push(article);
    }
  }
  return articles;
}


// ============================================================
// IMAGE EXTRACTION
// ============================================================

function extractImage_(item) {
  // Try media:content
  var mediaNs = XmlService.getNamespace("media", "http://search.yahoo.com/mrss/");
  var mediaContent = item.getChild("content", mediaNs);
  if (mediaContent) {
    var url = mediaContent.getAttribute("url");
    if (url) return url.getValue();
  }

  // Try media:thumbnail
  var thumb = item.getChild("thumbnail", mediaNs);
  if (thumb) {
    var url = thumb.getAttribute("url");
    if (url) return url.getValue();
  }

  // Try enclosure
  var enclosure = item.getChild("enclosure");
  if (enclosure) {
    var type = enclosure.getAttribute("type");
    if (type && type.getValue().indexOf("image") >= 0) {
      var url = enclosure.getAttribute("url");
      if (url) return url.getValue();
    }
  }

  // Try to extract from description HTML
  var desc = getChildText_(item, "description");
  if (desc) {
    var match = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];
  }

  return "";
}

function extractImageAtom_(entry, ns) {
  // Try media:content
  var mediaNs = XmlService.getNamespace("media", "http://search.yahoo.com/mrss/");
  try {
    var mediaContent = entry.getChild("content", mediaNs);
    if (mediaContent) {
      var url = mediaContent.getAttribute("url");
      if (url) return url.getValue();
    }
    var thumb = entry.getChild("thumbnail", mediaNs);
    if (thumb) {
      var url = thumb.getAttribute("url");
      if (url) return url.getValue();
    }
  } catch (e) {}

  // Try content for embedded images
  var content = getChildText_(entry, "content", ns);
  if (content) {
    var match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];
  }

  return "";
}


// ============================================================
// KEYWORD MATCHING (Scoring System)
// ============================================================
// Headline match = 3 points, Description match = 1 point per occurrence
// Threshold = 3 (headline match alone qualifies, or 3+ description mentions)

var MATCH_THRESHOLD = 3;
var HEADLINE_WEIGHT = 3;
var DESCRIPTION_WEIGHT = 1;

function matchKeywords_(article, keywordMap) {
  var headline = (article.headline || "").toLowerCase();
  var description = (article.description || "").toLowerCase();
  var matched = [];

  for (var tag in keywordMap) {
    var keywords = keywordMap[tag];
    var score = 0;

    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i].toLowerCase();

      // Headline match (strong signal)
      if (headline.indexOf(kw) >= 0) {
        score += HEADLINE_WEIGHT;
      }

      // Description matches (count occurrences)
      var descIdx = 0;
      var descText = description;
      while (descIdx < descText.length) {
        var found = descText.indexOf(kw, descIdx);
        if (found < 0) break;
        score += DESCRIPTION_WEIGHT;
        descIdx = found + kw.length;
      }
    }

    if (score >= MATCH_THRESHOLD) {
      matched.push(tag);
    }
  }

  return matched;
}


// ============================================================
// SHEET WRITING
// ============================================================

function getHeaders_() {
  return ["Date", "Headline", "Link", "Source", "Author", "Image URL", "Companies", "Topics", "Tags", "APA Citation"];
}

function buildApaCitation_(article) {
  // APA 7th edition: Author. (Year, Month Day). Title. Source. URL
  // If no author: Source. (Year, Month Day). Title. Source. URL
  var dateStr = Utilities.formatDate(article.date, Session.getScriptTimeZone(), "yyyy, MMMM d");
  var who = article.author || article.source;
  var citation = who + ". (" + dateStr + "). " + article.headline + ". " + article.source + ". " + article.link;
  return citation;
}

function writeArticles_(sheet, articles) {
  for (var i = 0; i < articles.length; i++) {
    var a = articles[i];
    sheet.insertRowAfter(1);
    sheet.getRange(2, 1, 1, 10).setValues([[
      a.date,
      a.headline,
      a.link,
      a.source,
      a.author || "",
      a.imageUrl,
      a.companies.join(", "),
      a.topics.join(", "),
      a.tags,
      buildApaCitation_(a)
    ]]);
  }
}

function writeToMonthlySheets_(ss, articles) {
  var monthGroups = {};

  for (var i = 0; i < articles.length; i++) {
    var a = articles[i];
    var monthKey = Utilities.formatDate(a.date, Session.getScriptTimeZone(), "yyyy-MM");
    if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
    monthGroups[monthKey].push(a);
  }

  for (var monthKey in monthGroups) {
    var monthSheet = getOrCreateSheet_(ss, monthKey, getHeaders_());
    writeArticles_(monthSheet, monthGroups[monthKey]);
  }
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setFontFamily("Arial")
      .setFontSize(10)
      .setBackground("#f3f3f3")
      .setFontColor("#333333");
    sheet.setFrozenRows(1);

    // Column widths
    sheet.setColumnWidth(1, 100);  // Date
    sheet.setColumnWidth(2, 450);  // Headline
    sheet.setColumnWidth(3, 200);  // Link
    sheet.setColumnWidth(4, 100);  // Source
    sheet.setColumnWidth(5, 150);  // Author
    sheet.setColumnWidth(6, 150);  // Image URL
    sheet.setColumnWidth(7, 180);  // Companies
    sheet.setColumnWidth(8, 180);  // Topics
    sheet.setColumnWidth(9, 250);  // Tags
    sheet.setColumnWidth(10, 400); // APA Citation

    // Set default font for all data
    sheet.getRange("A2:J").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
    sheet.getRange("A2:A").setNumberFormat("dd/MM/yyyy");
  }
  return sheet;
}

function autoFormatSheets_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var name = s.getName();
    if (name === SUMMARY_SHEET) continue;
    var lastRow = s.getLastRow();
    var lastCol = s.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;

    // Sort by date descending (newest on top)
    s.getRange(2, 1, lastRow - 1, lastCol).sort({column: 1, ascending: false});

    // Ensure clean formatting on header
    s.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold")
      .setFontFamily("Arial")
      .setFontSize(10)
      .setBackground("#f3f3f3")
      .setFontColor("#333333");

    // Ensure data rows have clean formatting
    s.getRange(2, 1, lastRow - 1, lastCol)
      .setFontFamily("Arial")
      .setFontSize(9)
      .setFontColor("#333333")
      .setFontWeight("normal")
      .setBackground("#ffffff");

    // Date format
    s.getRange(2, 1, lastRow - 1, 1).setNumberFormat("dd/MM/yyyy");
  }
}

function getExistingUrls_(sheet) {
  var urls = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return urls;

  var linkCol = 3; // Column C = Link
  var data = sheet.getRange(2, linkCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) urls[data[i][0]] = true;
  }
  return urls;
}

function trimSheet_(sheet, maxRows) {
  var lastRow = sheet.getLastRow();
  if (lastRow > maxRows + 1) {
    sheet.deleteRows(maxRows + 2, lastRow - maxRows - 1);
  }
}


// ============================================================
// SUMMARY DASHBOARD
// ============================================================

function updateSummary_(ss, master) {
  var sheet = ss.getSheetByName(SUMMARY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET);
  }
  sheet.clear();

  var lastRow = master.getLastRow();
  if (lastRow <= 1) return;

  var data = master.getRange(2, 1, lastRow - 1, 10).getValues();
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Count companies, topics, sources
  var companyCounts = {};
  var topicCounts = {};
  var sourceCounts = {};
  var monthlyCounts = {};
  var totalArticles = data.length;
  var last30 = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var date = new Date(row[0]);
    var source = row[3];
    var companies = row[6] ? row[6].toString().split(", ") : [];
    var topics = row[7] ? row[7].toString().split(", ") : [];

    // Monthly
    var monthKey = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
    monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;

    // Last 30 days
    if (date >= thirtyDaysAgo) {
      last30++;

      // Source counts (last 30 days)
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;

      // Company counts (last 30 days)
      for (var j = 0; j < companies.length; j++) {
        if (companies[j].trim()) {
          companyCounts[companies[j].trim()] = (companyCounts[companies[j].trim()] || 0) + 1;
        }
      }

      // Topic counts (last 30 days)
      for (var j = 0; j < topics.length; j++) {
        if (topics[j].trim()) {
          topicCounts[topics[j].trim()] = (topicCounts[topics[j].trim()] || 0) + 1;
        }
      }
    }
  }

  // Write summary
  sheet.getRange("A:B").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
  var row = 1;
  var headerFmt = function(r, c, text) {
    sheet.getRange(r, c).setValue(text).setFontWeight("bold").setFontSize(11)
      .setFontFamily("Arial").setBackground("#f3f3f3").setFontColor("#333333");
  };
  var subHeaderFmt = function(r, c1, c2, texts) {
    for (var i = 0; i < texts.length; i++) {
      sheet.getRange(r, c1 + i).setValue(texts[i]).setFontWeight("bold")
        .setFontFamily("Arial").setFontSize(9).setBackground("#fafafa").setFontColor("#666666");
    }
  };

  // Overview
  headerFmt(row, 1, "AI & BIGTECH NEWS TRACKER — SUMMARY");
  sheet.getRange(row, 1, 1, 4).merge();
  row += 2;

  sheet.getRange(row, 1).setValue("Total articles:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(totalArticles);
  row++;
  sheet.getRange(row, 1).setValue("Last 30 days:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(last30);
  row++;
  sheet.getRange(row, 1).setValue("Last updated:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(new Date()).setNumberFormat("yyyy-MM-dd HH:mm");
  row += 2;

  // Top Companies
  headerFmt(row, 1, "TOP COMPANIES (last 30 days)");
  sheet.getRange(row, 1, 1, 2).merge();
  row++;
  subHeaderFmt(row, 1, 2, ["Company", "Articles"]);
  row++;
  var sortedCompanies = sortByCount_(companyCounts);
  for (var i = 0; i < Math.min(sortedCompanies.length, 20); i++) {
    sheet.getRange(row, 1).setValue(sortedCompanies[i][0]);
    sheet.getRange(row, 2).setValue(sortedCompanies[i][1]);
    row++;
  }
  row++;

  // Top Topics
  headerFmt(row, 1, "TOP TOPICS (last 30 days)");
  sheet.getRange(row, 1, 1, 2).merge();
  row++;
  subHeaderFmt(row, 1, 2, ["Topic", "Articles"]);
  row++;
  var sortedTopics = sortByCount_(topicCounts);
  for (var i = 0; i < Math.min(sortedTopics.length, 20); i++) {
    sheet.getRange(row, 1).setValue(sortedTopics[i][0]);
    sheet.getRange(row, 2).setValue(sortedTopics[i][1]);
    row++;
  }
  row++;

  // Sources
  headerFmt(row, 1, "ARTICLES BY SOURCE (last 30 days)");
  sheet.getRange(row, 1, 1, 2).merge();
  row++;
  subHeaderFmt(row, 1, 2, ["Source", "Articles"]);
  row++;
  var sortedSources = sortByCount_(sourceCounts);
  for (var i = 0; i < sortedSources.length; i++) {
    sheet.getRange(row, 1).setValue(sortedSources[i][0]);
    sheet.getRange(row, 2).setValue(sortedSources[i][1]);
    row++;
  }
  row++;

  // Monthly trend
  headerFmt(row, 1, "ARTICLES BY MONTH");
  sheet.getRange(row, 1, 1, 2).merge();
  row++;
  subHeaderFmt(row, 1, 2, ["Month", "Articles"]);
  row++;
  var months = Object.keys(monthlyCounts).sort().reverse();
  for (var i = 0; i < months.length; i++) {
    sheet.getRange(row, 1).setValue(months[i]);
    sheet.getRange(row, 2).setValue(monthlyCounts[months[i]]);
    row++;
  }

  // Auto-resize
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 120);
}

function sortByCount_(obj) {
  var arr = [];
  for (var key in obj) {
    arr.push([key, obj[key]]);
  }
  arr.sort(function(a, b) { return b[1] - a[1]; });
  return arr;
}


// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getChildText_(element, childName, ns) {
  var child = ns ? element.getChild(childName, ns) : element.getChild(childName);
  return child ? child.getText() : "";
}

function cleanText_(text) {
  if (!text) return "";
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  text = text.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Trim and collapse whitespace
  return text.replace(/\s+/g, " ").trim();
}

function parseDate_(dateStr) {
  if (!dateStr) return new Date();
  try {
    var d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch (e) {
    return new Date();
  }
}


// ============================================================
// SETUP & TRIGGERS
// ============================================================

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet_(ss, MASTER_SHEET, getHeaders_());
  SpreadsheetApp.getUi().alert(
    "Setup complete!\n\n" +
    "1. Run 'fetchNews' to collect articles\n" +
    "2. Run 'createHourlyTrigger' to automate"
  );
}

function createHourlyTrigger() {
  // Remove existing triggers
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "fetchNews") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("fetchNews")
    .timeBased()
    .everyHours(1)
    .create();

  SpreadsheetApp.getUi().alert("Hourly trigger created! News will be fetched every hour.");
}

function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  SpreadsheetApp.getUi().alert("All triggers removed.");
}


// ============================================================
// MENU
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu("News Tracker")
    .addItem("Fetch news now", "fetchNews")
    .addItem("Setup sheets", "setupSheets")
    .addSeparator()
    .addItem("Create hourly trigger", "createHourlyTrigger")
    .addItem("Remove triggers", "removeTriggers")
    .addSeparator()
    .addItem("Update summary", "updateSummaryManual")
    .addItem("Reformat all sheets", "reformatAllSheets")
    .addItem("Backfill authors", "backfillAuthors")
    .addToUi();
}

function reformatAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var expectedHeaders = getHeaders_();

  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var name = s.getName();
    if (name === SUMMARY_SHEET) continue;
    var lastRow = s.getLastRow();
    var lastCol = s.getLastColumn();
    if (lastRow < 1 || lastCol < 1) continue;

    // Migrate: if old 8-column layout (no Author, no APA), add missing columns
    var headers = s.getRange(1, 1, 1, lastCol).getValues()[0];

    // Add Author column if missing (insert after Source = col 4)
    if (headers.indexOf("Author") < 0) {
      s.insertColumnAfter(4);
      s.getRange(1, 5).setValue("Author");
      lastCol++;
      // Re-read headers after insert
      headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
    }

    // Add APA Citation column if missing
    if (headers.indexOf("APA Citation") < 0) {
      lastCol++;
      s.getRange(1, lastCol).setValue("APA Citation");
      headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
    }

    // Clear ALL existing formatting first
    s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns())
      .setBackground("#ffffff")
      .setFontFamily("Arial")
      .setFontSize(9)
      .setFontColor("#333333")
      .setFontWeight("normal");

    // Header row
    s.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold")
      .setFontSize(10)
      .setBackground("#f3f3f3")
      .setFontColor("#333333");
    s.setFrozenRows(1);

    // Date format
    if (lastRow > 1) {
      s.getRange(2, 1, lastRow - 1, 1).setNumberFormat("dd/MM/yyyy");
    }

    // Sort by date descending (most recent on top)
    if (lastRow > 2) {
      s.getRange(2, 1, lastRow - 1, lastCol).sort({column: 1, ascending: false});
    }

    // Generate APA citations for rows missing one
    var citationCol = headers.indexOf("APA Citation") + 1;
    var authorCol = headers.indexOf("Author") + 1;
    if (lastRow > 1 && citationCol > 0) {
      var allData = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var r = 0; r < allData.length; r++) {
        if (!allData[r][citationCol - 1] || allData[r][citationCol - 1] === "") {
          var date = new Date(allData[r][0]);
          var headline = allData[r][1];
          var link = allData[r][2];
          var source = allData[r][3];
          var author = authorCol > 0 ? allData[r][authorCol - 1] : "";
          if (headline && source) {
            var who = author || source;
            var dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy, MMMM d");
            var citation = who + ". (" + dateStr + "). " + headline + ". " + source + ". " + link;
            s.getRange(r + 2, citationCol).setValue(citation);
          }
        }
      }
    }

    // Column widths
    s.setColumnWidth(1, 100);   // Date
    s.setColumnWidth(2, 450);   // Headline
    s.setColumnWidth(3, 200);   // Link
    s.setColumnWidth(4, 100);   // Source
    s.setColumnWidth(5, 150);   // Author
    if (lastCol >= 6) s.setColumnWidth(6, 150);   // Image URL
    if (lastCol >= 7) s.setColumnWidth(7, 180);   // Companies
    if (lastCol >= 8) s.setColumnWidth(8, 180);   // Topics
    if (lastCol >= 9) s.setColumnWidth(9, 250);   // Tags
    if (lastCol >= 10) s.setColumnWidth(10, 400); // APA Citation

    // Add filter for easy searching
    var existingFilter = s.getFilter();
    if (existingFilter) existingFilter.remove();
    if (lastRow > 1) {
      s.getRange(1, 1, lastRow, lastCol).createFilter();
    }
  }

  // Also update summary
  var master = ss.getSheetByName(MASTER_SHEET);
  if (master) updateSummary_(ss, master);

  SpreadsheetApp.getUi().alert("All sheets reformatted! Filters enabled — use the dropdown arrows in the header to search/filter by date, company, topic, etc.");
}

function updateSummaryManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MASTER_SHEET);
  if (master) {
    updateSummary_(ss, master);
    SpreadsheetApp.getUi().alert("Summary updated!");
  }
}

function backfillAuthors() {
  // Re-fetch RSS feeds and match by URL to fill in missing authors
  var authorByUrl = {};

  for (var i = 0; i < RSS_FEEDS.length; i++) {
    var feed = RSS_FEEDS[i];
    try {
      var articles = parseFeed_(feed.url, feed.source);
      for (var j = 0; j < articles.length; j++) {
        if (articles[j].author && articles[j].link) {
          authorByUrl[articles[j].link] = articles[j].author;
        }
      }
    } catch (e) {
      Logger.log("Backfill error for " + feed.source + ": " + e.message);
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var filled = 0;

  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var name = s.getName();
    if (name === SUMMARY_SHEET) continue;
    var lastRow = s.getLastRow();
    var lastCol = s.getLastColumn();
    if (lastRow < 2 || lastCol < 5) continue;

    var headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
    var authorCol = headers.indexOf("Author") + 1;
    var linkCol = headers.indexOf("Link") + 1;
    var citationCol = headers.indexOf("APA Citation") + 1;
    if (authorCol < 1 || linkCol < 1) continue;

    var data = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var r = 0; r < data.length; r++) {
      var currentAuthor = data[r][authorCol - 1];
      var link = data[r][linkCol - 1];
      if ((!currentAuthor || currentAuthor === "") && link && authorByUrl[link]) {
        // Fill in author
        s.getRange(r + 2, authorCol).setValue(authorByUrl[link]);
        filled++;

        // Update APA citation to include author
        if (citationCol > 0) {
          var date = new Date(data[r][0]);
          var headline = data[r][1];
          var source = data[r][3];
          var dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy, MMMM d");
          var citation = authorByUrl[link] + ". (" + dateStr + "). " + headline + ". " + source + ". " + link;
          s.getRange(r + 2, citationCol).setValue(citation);
        }
      }
    }
  }

  SpreadsheetApp.getUi().alert("Backfill complete! Filled " + filled + " author names from current RSS feeds.");
}
