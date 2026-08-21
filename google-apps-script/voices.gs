// ============================================================
// AI Voices Tracker — Google Apps Script
// Version: v2 (2026-08)
//
// Collects essays & commentary from a curated roster of AI
// voices (newsletters, blogs, and press coverage) and stores
// them in Google Sheets for the voices.html reading room.
//
// Unlike the news tracker there is NO keyword filtering:
// the roster is curated by author, so everything they publish
// is in scope.
//
// Sheets (auto-ordered after each fetch):
//   • "Summary"    — per-voice counts & last-post dates
//   • "All Posts"  — every post ever collected
//   • "2026-08" etc — auto-created monthly tabs, newest first
//
// Setup (use a NEW Google Sheet, separate from the news one):
//   1. Create a new Google Sheet
//   2. Extensions → Apps Script → paste this code
//   3. Run setupSheets() once
//   4. Run fetchVoices() to test
//   5. Run createSixHourTrigger() to automate
//   6. File → Share → Publish to web → "All Posts" as CSV,
//      paste the URL into VOICES_CSV_URL in voices.html
// ============================================================

// ── Configuration ───────────────────────────────────────────

const MASTER_SHEET = "All Posts";
const SUMMARY_SHEET = "Summary";
const MAX_ROWS = 5000;
const WORDS_PER_MINUTE = 230;
const GNEWS_MAX_AGE_DAYS = 365; // ignore stale press results
const GNEWS_MAX_ITEMS = 20;     // per fetch, newest first

// ── Desks ───────────────────────────────────────────────────

const DESK_RESEARCH = "Researchers & Builders";
const DESK_INDUSTRY = "Industry & Chips";
const DESK_POLICY   = "Policy & China";
const DESK_CULTURE  = "Culture & Society";

// ── The Roster ──────────────────────────────────────────────
// type: "rss" = the voice's own feed (Substack/Ghost/blog — the
//               pipeline doesn't care which platform).
//       "gnews" = Google News query for voices without a feed
//                 (press coverage: pieces by AND about them).

const VOICES = [
  // Researchers & Builders
  { person: "Zvi Mowshowitz",         publication: "Don't Worry About the Vase", desk: DESK_RESEARCH, type: "rss", url: "https://thezvi.substack.com/feed" },
  { person: "Jack Clark",             publication: "Import AI",                  desk: DESK_RESEARCH, type: "rss", url: "https://importai.substack.com/feed" },
  { person: "Nathan Lambert",         publication: "Interconnects",              desk: DESK_RESEARCH, type: "rss", url: "https://www.interconnects.ai/feed" },
  { person: "Ethan Mollick",          publication: "One Useful Thing",           desk: DESK_RESEARCH, type: "rss", url: "https://www.oneusefulthing.org/feed" },
  { person: "Sebastian Raschka",      publication: "Ahead of AI",                desk: DESK_RESEARCH, type: "rss", url: "https://magazine.sebastianraschka.com/feed" },
  { person: "swyx & Alessio",         publication: "Latent Space",               desk: DESK_RESEARCH, type: "rss", url: "https://www.latent.space/feed" },
  { person: "Simon Willison",         publication: "simonwillison.net",          desk: DESK_RESEARCH, type: "rss", url: "https://simonwillison.net/atom/entries/" },
  { person: "Dwarkesh Patel",         publication: "Dwarkesh Podcast",           desk: DESK_RESEARCH, type: "rss", url: "https://www.dwarkesh.com/feed" },
  { person: "Gary Marcus",            publication: "Marcus on AI",               desk: DESK_RESEARCH, type: "rss", url: "https://garymarcus.substack.com/feed" },

  // Industry & Chips
  { person: "Ben Thompson",           publication: "Stratechery",                desk: DESK_INDUSTRY, type: "rss", url: "https://stratechery.com/feed/" },
  { person: "Dylan Patel",            publication: "SemiAnalysis",               desk: DESK_INDUSTRY, type: "rss", url: "https://semianalysis.com/feed/" },
  { person: "Casey Newton",           publication: "Platformer",                 desk: DESK_INDUSTRY, type: "rss", url: "https://www.platformer.news/rss/" },
  { person: "Alberto Romero",         publication: "The Algorithmic Bridge",     desk: DESK_INDUSTRY, type: "rss", url: "https://thealgorithmicbridge.substack.com/feed" },

  // Policy & China
  { person: "Jeffrey Ding",           publication: "ChinAI",                     desk: DESK_POLICY, type: "rss", url: "https://chinai.substack.com/feed" },
  { person: "Helen Toner",            publication: "Rising Tide",                desk: DESK_POLICY, type: "rss", url: "https://helentoner.substack.com/feed" },
  { person: "Timothy B. Lee",         publication: "Understanding AI",           desk: DESK_POLICY, type: "rss", url: "https://www.understandingai.org/feed" },

  // Culture & Society
  { person: "L.M. Sacasas",           publication: "The Convivial Society",      desk: DESK_CULTURE, type: "rss", url: "https://theconvivialsociety.substack.com/feed" },
  { person: "Erik Hoel",              publication: "The Intrinsic Perspective",  desk: DESK_CULTURE, type: "rss", url: "https://www.theintrinsicperspective.com/feed" },
  { person: "Brian Merchant",         publication: "Blood in the Machine",       desk: DESK_CULTURE, type: "rss", url: "https://www.bloodinthemachine.com/feed" },
  { person: "Tressie McMillan Cottom", publication: "essaying",                  desk: DESK_CULTURE, type: "rss", url: "https://tressie.substack.com/feed" },
  { person: "Yuval Noah Harari",      publication: "In the press",               desk: DESK_CULTURE, type: "gnews", url: "https://news.google.com/rss/search?q=%22Yuval+Noah+Harari%22+AI&hl=en-US&gl=US&ceid=US:en" },
  { person: "Ted Chiang",             publication: "In the press",               desk: DESK_CULTURE, type: "gnews", url: "https://news.google.com/rss/search?q=%22Ted+Chiang%22+AI&hl=en-US&gl=US&ceid=US:en" },
];


// ============================================================
// MAIN: Fetch and store posts
// ============================================================

function fetchVoices() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = getOrCreateSheet_(ss, MASTER_SHEET, getHeaders_());

  var existingUrls = getExistingUrls_(master);
  var newPosts = [];

  for (var i = 0; i < VOICES.length; i++) {
    var voice = VOICES[i];
    try {
      var posts = parseVoiceFeed_(voice);
      for (var j = 0; j < posts.length; j++) {
        var post = posts[j];
        if (!existingUrls[post.link]) {
          newPosts.push(post);
          existingUrls[post.link] = true;
        }
      }
    } catch (e) {
      Logger.log("Error fetching " + voice.person + ": " + e.message);
    }
  }

  if (newPosts.length === 0) {
    Logger.log("No new posts found.");
    return;
  }

  // Sort by date (newest first)
  newPosts.sort(function(a, b) { return b.date - a.date; });

  writePosts_(master, newPosts);
  writeToMonthlySheets_(ss, newPosts);
  updateSummary_(ss, master);
  trimSheet_(master, MAX_ROWS);
  autoFormatSheets_(ss);

  Logger.log("Added " + newPosts.length + " new posts.");
}


// ============================================================
// FEED PARSING
// ============================================================

function parseVoiceFeed_(voice) {
  var posts = [];

  var response = UrlFetchApp.fetch(voice.url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0 NewsTracker/1.0" }
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(voice.person + " returned HTTP " + response.getResponseCode());
    return posts;
  }

  var xml = XmlService.parse(response.getContentText());
  var root = xml.getRootElement();

  if (root.getName() === "rss") {
    posts = parseRssItems_(root, voice);
  } else if (root.getName() === "feed") {
    posts = parseAtomEntries_(root, voice);
  }

  if (voice.type === "gnews") {
    posts = filterGnewsPosts_(posts);
  }

  return posts;
}

function parseRssItems_(root, voice) {
  var posts = [];
  var channel = root.getChild("channel");
  if (!channel) return posts;

  var contentNs = XmlService.getNamespace("content", "http://purl.org/rss/1.0/modules/content/");
  var items = channel.getChildren("item");

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var title = cleanText_(getChildText_(item, "title"));
    var link = getChildText_(item, "link").trim();
    var description = getChildText_(item, "description");
    var fullContent = "";
    try { fullContent = getChildText_(item, "encoded", contentNs); } catch (e) {}

    var publication = voice.publication;

    // Google News items: publication is in <source>, and the title
    // carries a " - Outlet" suffix — strip it.
    if (voice.type === "gnews") {
      var sourceText = cleanText_(getChildText_(item, "source"));
      if (sourceText) {
        publication = sourceText;
        var suffix = " - " + sourceText;
        if (title.length > suffix.length && title.slice(-suffix.length) === suffix) {
          title = title.slice(0, -suffix.length).trim();
        }
      }
    }

    var post = buildPost_(voice, {
      date: parseDate_(getChildText_(item, "pubDate")),
      title: title,
      link: link,
      publication: publication,
      description: description,
      fullContent: fullContent
    });
    if (post) posts.push(post);
  }
  return posts;
}

function parseAtomEntries_(root, voice) {
  var posts = [];
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

    var post = buildPost_(voice, {
      date: parseDate_(getChildText_(entry, "published", ns) || getChildText_(entry, "updated", ns)),
      title: cleanText_(getChildText_(entry, "title", ns)),
      link: linkEl ? linkEl.getAttribute("href").getValue() : "",
      publication: voice.publication,
      description: getChildText_(entry, "summary", ns),
      fullContent: getChildText_(entry, "content", ns)
    });
    if (post) posts.push(post);
  }
  return posts;
}

// Assemble one sheet row's worth of post data (or null if unusable)
function buildPost_(voice, raw) {
  if (!raw.title || !raw.link) return null;

  // Standfirst: the description (Substack subtitle) if it exists,
  // otherwise the opening of the full text.
  var standfirst = cleanText_(raw.description);
  if (!standfirst && raw.fullContent) {
    standfirst = cleanText_(raw.fullContent);
  }
  // A standfirst that just repeats the title is noise
  if (standfirst && raw.title && standfirst.toLowerCase().indexOf(raw.title.toLowerCase()) === 0) {
    standfirst = "";
  }
  standfirst = truncate_(standfirst, 280);

  // Reading time from full content when the feed carries it
  var minutes = "";
  if (raw.fullContent) {
    var words = cleanText_(raw.fullContent).split(" ").length;
    if (words > 200) {
      minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
    }
  }

  return {
    date: raw.date,
    title: raw.title,
    link: raw.link,
    person: voice.person,
    publication: raw.publication,
    desk: voice.desk,
    kind: voice.type === "gnews" ? "press" : "essay",
    standfirst: standfirst,
    minutes: minutes
  };
}

// Google News queries return relevance-sorted piles going back years;
// keep only fresh items, newest first.
function filterGnewsPosts_(posts) {
  var cutoff = new Date(Date.now() - GNEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  var fresh = [];
  for (var i = 0; i < posts.length; i++) {
    if (posts[i].date >= cutoff) fresh.push(posts[i]);
  }
  fresh.sort(function(a, b) { return b.date - a.date; });
  return fresh.slice(0, GNEWS_MAX_ITEMS);
}


// ============================================================
// SHEET WRITING
// ============================================================

function getHeaders_() {
  return ["Date", "Title", "Link", "Person", "Publication", "Desk", "Kind", "Standfirst", "Minutes"];
}

function writePosts_(sheet, posts) {
  for (var i = 0; i < posts.length; i++) {
    var p = posts[i];
    sheet.insertRowAfter(1);
    sheet.getRange(2, 1, 1, 9).setValues([[
      p.date,
      p.title,
      p.link,
      p.person,
      p.publication,
      p.desk,
      p.kind,
      p.standfirst,
      p.minutes
    ]]);
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

    sheet.setColumnWidth(1, 100);  // Date
    sheet.setColumnWidth(2, 420);  // Title
    sheet.setColumnWidth(3, 200);  // Link
    sheet.setColumnWidth(4, 160);  // Person
    sheet.setColumnWidth(5, 180);  // Publication
    sheet.setColumnWidth(6, 160);  // Desk
    sheet.setColumnWidth(7, 70);   // Kind
    sheet.setColumnWidth(8, 400);  // Standfirst
    sheet.setColumnWidth(9, 70);   // Minutes

    sheet.getRange("A2:I").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
    sheet.getRange("A2:A").setNumberFormat("dd/MM/yyyy");
  }
  return sheet;
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

function writeToMonthlySheets_(ss, posts) {
  var monthGroups = {};

  for (var i = 0; i < posts.length; i++) {
    var p = posts[i];
    var monthKey = Utilities.formatDate(p.date, Session.getScriptTimeZone(), "yyyy-MM");
    if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
    monthGroups[monthKey].push(p);
  }

  for (var monthKey in monthGroups) {
    var monthSheet = getOrCreateSheet_(ss, monthKey, getHeaders_());
    writePosts_(monthSheet, monthGroups[monthKey]);
  }
}

function reorderSheets_(ss) {
  // Order: Summary → All Posts → monthly tabs (newest first) → anything else (alphabetical)
  var sheets = ss.getSheets();
  var monthRegex = /^\d{4}-\d{2}$/;

  var summary = null, master = null;
  var months = [];
  var others = [];

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name === SUMMARY_SHEET) summary = sheets[i];
    else if (name === MASTER_SHEET) master = sheets[i];
    else if (monthRegex.test(name)) months.push(sheets[i]);
    else others.push(sheets[i]);
  }

  months.sort(function(a, b) {
    return a.getName() < b.getName() ? 1 : (a.getName() > b.getName() ? -1 : 0);
  });
  others.sort(function(a, b) {
    return a.getName() < b.getName() ? -1 : (a.getName() > b.getName() ? 1 : 0);
  });

  var ordered = [];
  if (summary) ordered.push(summary);
  if (master) ordered.push(master);
  ordered = ordered.concat(months, others);

  for (var i = 0; i < ordered.length; i++) {
    ss.setActiveSheet(ordered[i]);
    ss.moveActiveSheet(i + 1);
  }
}

function autoFormatSheets_(ss) {
  reorderSheets_(ss);

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var name = s.getName();
    if (name === SUMMARY_SHEET) continue;
    var lastRow = s.getLastRow();
    var lastCol = s.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;

    // Sort by date descending (newest on top)
    s.getRange(2, 1, lastRow - 1, lastCol).sort({ column: 1, ascending: false });

    // Clean header formatting
    s.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold")
      .setFontFamily("Arial")
      .setFontSize(10)
      .setBackground("#f3f3f3")
      .setFontColor("#333333");

    // Data rows: normal weight (inserted rows inherit the header's bold otherwise)
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

  var data = master.getRange(2, 1, lastRow - 1, 9).getValues();
  var perVoice = {}; // person -> { desk, count, latest }

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var date = new Date(row[0]);
    var person = row[3];
    if (!person) continue;
    if (!perVoice[person]) {
      perVoice[person] = { desk: row[5], count: 0, latest: date };
    }
    perVoice[person].count++;
    if (date > perVoice[person].latest) perVoice[person].latest = date;
  }

  sheet.getRange("A:D").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
  var row = 1;

  sheet.getRange(row, 1).setValue("AI VOICES TRACKER — SUMMARY")
    .setFontWeight("bold").setFontSize(11).setFontFamily("Arial")
    .setBackground("#f3f3f3").setFontColor("#333333");
  sheet.getRange(row, 1, 1, 4).merge();
  row += 2;

  sheet.getRange(row, 1).setValue("Total posts:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(data.length);
  row++;
  sheet.getRange(row, 1).setValue("Voices in roster:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(VOICES.length);
  row++;
  sheet.getRange(row, 1).setValue("Last updated:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(new Date()).setNumberFormat("yyyy-MM-dd HH:mm");
  row += 2;

  var headers = ["Voice", "Desk", "Posts", "Latest post"];
  for (var h = 0; h < headers.length; h++) {
    sheet.getRange(row, 1 + h).setValue(headers[h]).setFontWeight("bold")
      .setFontFamily("Arial").setFontSize(9).setBackground("#fafafa").setFontColor("#666666");
  }
  row++;

  // Roster order, so the summary mirrors the config
  for (var v = 0; v < VOICES.length; v++) {
    var name = VOICES[v].person;
    var stats = perVoice[name];
    sheet.getRange(row, 1).setValue(name);
    sheet.getRange(row, 2).setValue(VOICES[v].desk);
    sheet.getRange(row, 3).setValue(stats ? stats.count : 0);
    if (stats) sheet.getRange(row, 4).setValue(stats.latest).setNumberFormat("dd/MM/yyyy");
    row++;
  }

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 170);
  sheet.setColumnWidth(3, 70);
  sheet.setColumnWidth(4, 110);
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
  text = text.replace(/<[^>]+>/g, " ");
  // Numeric entities (e.g. &#8217; → ')
  text = text.replace(/&#(\d+);/g, function(m, n) {
    try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return m; }
  });
  text = text.replace(/&#x([0-9a-fA-F]+);/g, function(m, n) {
    try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return m; }
  });
  text = text.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function truncate_(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  var cut = text.substring(0, maxLen);
  var lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) cut = cut.substring(0, lastSpace);
  return cut + "…";
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
    "1. Run 'fetchVoices' to collect posts\n" +
    "2. Run 'createSixHourTrigger' to automate"
  );
}

function createSixHourTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "fetchVoices") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Essays are weekly-ish — every 6 hours is plenty
  ScriptApp.newTrigger("fetchVoices")
    .timeBased()
    .everyHours(6)
    .create();

  SpreadsheetApp.getUi().alert("Trigger created! Voices will be fetched every 6 hours.");
}

function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  SpreadsheetApp.getUi().alert("All triggers removed.");
}

function updateSummaryManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MASTER_SHEET);
  if (master) updateSummary_(ss, master);
  SpreadsheetApp.getUi().alert("Summary updated.");
}

function reformatAllSheets() {
  autoFormatSheets_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert("All sheets reformatted and reordered.");
}

// One-time backfill: distribute everything already in "All Posts" into
// monthly tabs. Safe to re-run — each monthly tab is rebuilt from scratch.
function rebuildMonthlySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MASTER_SHEET);
  if (!master || master.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert("No posts in '" + MASTER_SHEET + "' yet.");
    return;
  }

  var data = master.getRange(2, 1, master.getLastRow() - 1, 9).getValues();
  var groups = {};
  for (var i = 0; i < data.length; i++) {
    var date = new Date(data[i][0]);
    if (isNaN(date.getTime())) continue;
    var key = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
    if (!groups[key]) groups[key] = [];
    groups[key].push(data[i]);
  }

  for (var key in groups) {
    var sheet = getOrCreateSheet_(ss, key, getHeaders_());
    // Clear old data rows so re-runs don't duplicate
    var lr = sheet.getLastRow();
    if (lr > 1) sheet.getRange(2, 1, lr - 1, 9).clearContent();
    sheet.getRange(2, 1, groups[key].length, 9).setValues(groups[key]);
  }

  autoFormatSheets_(ss);
  SpreadsheetApp.getUi().alert("Monthly tabs rebuilt: " + Object.keys(groups).sort().reverse().join(", "));
}

// Fetch a single voice and log the results — handy for debugging feeds
function testOneVoice() {
  var voice = VOICES[0];
  var posts = parseVoiceFeed_(voice);
  Logger.log(voice.person + ": " + posts.length + " posts");
  for (var i = 0; i < Math.min(posts.length, 3); i++) {
    Logger.log((i + 1) + ". " + posts[i].title + " | " + posts[i].date + " | " + posts[i].minutes + " min");
  }
  SpreadsheetApp.getUi().alert(
    "Test fetch: " + voice.person + "\n" +
    "Posts found: " + posts.length + "\n\n" +
    "Check Apps Script logs for details."
  );
}


// ============================================================
// MENU
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Voices Tracker")
    .addItem("Fetch voices now", "fetchVoices")
    .addItem("Setup sheets", "setupSheets")
    .addSeparator()
    .addItem("Create 6-hour trigger", "createSixHourTrigger")
    .addItem("Remove triggers", "removeTriggers")
    .addSeparator()
    .addItem("Update summary", "updateSummaryManual")
    .addItem("Rebuild monthly tabs", "rebuildMonthlySheets")
    .addItem("Reformat all sheets", "reformatAllSheets")
    .addItem("Test first voice (debug)", "testOneVoice")
    .addToUi();
}
