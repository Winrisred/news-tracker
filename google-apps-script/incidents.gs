// ============================================================
// AI Incidents Tracker — Google Apps Script
// Version: v3.31 (2026-10)
//
// Collects AI incident records from two public registries and
// stores them in Google Sheets for the incidents.html ledger:
//
//   • AIAAIC Repository — the full curated registry, fetched as
//     CSV from its public Google Sheet. License: CC BY-SA 4.0 —
//     the web page credits AIAAIC visibly. ~2,250 records with
//     taxonomy (deployer, developer, sector, jurisdiction, harms).
//   • AI Incident Database (AIID) — RSS feed of newly added
//     incident reports (real dates, article links, incident IDs).
//
// The two sources are kept as parallel streams (Source column),
// never merged/deduplicated across each other.
//
// Sheets:
//   • "All Incidents" — every record
//   • "Summary"       — counts by source, year, sector
//
// Setup (use a NEW Google Sheet, separate from news and voices):
//   1. Extensions → Apps Script → paste this code
//   2. Run setupSheets() once
//   3. Run fetchIncidents() — first run backfills ~2,250 rows
//   4. Run createTwelveHourTrigger() to automate
//   5. File → Share → Publish to web → "All Incidents" as CSV,
//      paste the URL into INCIDENTS_CSV_URL in incidents.html
// ============================================================

const SCRIPT_VERSION = "v3.31";

const MASTER_SHEET = "All Incidents";
const SUMMARY_SHEET = "Summary";
const MAX_ROWS = 8000;

const AIAAIC_CSV_URL = "https://docs.google.com/spreadsheets/d/1Bn55B4xz21-_Rgdr8BBb2lt0n_4rzLGxFADMlVW0PYI/export?format=csv&gid=888071280";
const AIAAIC_FALLBACK_LINK = "https://www.aiaaic.org/aiaaic-repository";
const AIID_RSS_URL = "https://incidentdatabase.ai/rss.xml";


// ============================================================
// MAIN: Fetch and store incidents
// ============================================================

function fetchIncidents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = getOrCreateSheet_(ss, MASTER_SHEET, getHeaders_());

  var existingKeys = getExistingKeys_(master);
  var newItems = [];

  try {
    var aiaaic = fetchAiaaic_();
    var relinked = repairAiaaicLinks_(master, aiaaic);
    if (relinked) Logger.log("Relinked " + relinked + " AIAAIC rows to their incident pages.");
    for (var i = 0; i < aiaaic.length; i++) {
      if (!existingKeys[aiaaic[i].id]) {
        newItems.push(aiaaic[i]);
        existingKeys[aiaaic[i].id] = true;
      }
    }
  } catch (e) {
    Logger.log("AIAAIC error: " + e.message);
  }

  try {
    var aiid = fetchAiid_(existingKeys);
    for (var j = 0; j < aiid.length; j++) {
      if (!existingKeys[aiid[j].id]) {
        newItems.push(aiid[j]);
        existingKeys[aiid[j].id] = true;
      }
    }
  } catch (e) {
    Logger.log("AIID error: " + e.message);
  }

  if (newItems.length === 0) {
    Logger.log("No new incidents.");
    return;
  }

  newItems.sort(function(a, b) {
    return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);
  });
  writeIncidents_(master, newItems);
  updateSummary_(ss, master);
  trimSheet_(master, MAX_ROWS);
  autoFormatSheets_(ss);

  Logger.log("Added " + newItems.length + " incidents.");
}


// ============================================================
// AIAAIC (CSV export of their public sheet)
// ============================================================
// AIAAIC inserts columns now and then: "Harm status" arrived in
// Oct 2026 and pushed Summary/links from column 17 to 18, so new
// rows were stored with the repository home page as their link.
// Columns are therefore found by their header text, never by
// position. The header spans two rows: "Impacted area" and
// "External harm" are merged cells whose sub-columns are named
// on the row below.

const AIAAIC_HEADERS = {
  id: /^aiaaic id/,
  headline: /headline/,
  occurred: /^occurred/,
  deployer: /^deployer/,
  developer: /^developer/,
  system: /^system/,
  technology: /^technology/,
  jurisdiction: /jurisdiction/,
  sector: /sector/,
  harmIndividual: /individual/,
  harmSocietal: /societal/,
  harmEnvironmental: /environmental/,
  link: /summary|links/
};

// The registry's rows, or null if it couldn't be fetched
function fetchAiaaicRows_() {
  var response = UrlFetchApp.fetch(AIAAIC_CSV_URL, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0 NewsTracker/1.0" }
  });
  if (response.getResponseCode() !== 200) {
    Logger.log("AIAAIC returned HTTP " + response.getResponseCode());
    return null;
  }
  return Utilities.parseCsv(response.getContentText());
}

// Column index per AIAAIC_HEADERS key (-1 if absent), or null if
// the header row can't be found
function aiaaicColumns_(rows) {
  for (var i = 0; i < rows.length; i++) {
    if (!/^AIAAIC ID/i.test(String(rows[i][0] || "").trim())) continue;
    var below = rows[i + 1] || [];
    var sub = String(below[0] || "").trim() ? [] : below;
    var labels = rows[i].map(function(h, c) {
      return (String(h || "") + " " + String(sub[c] || "")).trim().toLowerCase();
    });
    var cols = {};
    for (var key in AIAAIC_HEADERS) {
      cols[key] = -1;
      for (var c = 0; c < labels.length; c++) {
        if (AIAAIC_HEADERS[key].test(labels[c])) { cols[key] = c; break; }
      }
    }
    return cols;
  }
  return null;
}

function fetchAiaaic_() {
  var items = [];
  var rows = fetchAiaaicRows_();
  if (!rows) return items;
  var col = aiaaicColumns_(rows);
  if (!col || col.id < 0 || col.headline < 0) {
    Logger.log("AIAAIC header row not recognised — sheet layout changed?");
    return items;
  }
  function cell(r, key) { return col[key] >= 0 ? r[col[key]] : ""; }

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var id = String(cell(r, "id") || "").trim();
    if (!/^AIAAIC\d+/i.test(id)) continue;

    var headline = cleanText_(cell(r, "headline"));
    if (!headline) continue;

    // ~170 registry rows have no "Occurred" year — store them undated
    // (blank date cell) rather than faking a date; the page shows
    // "Undated" and sorts them last.
    var yr = parseInt(String(cell(r, "occurred") || "").trim().substring(0, 4), 10);
    var harms = [cell(r, "harmIndividual"), cell(r, "harmSocietal"), cell(r, "harmEnvironmental")]
      .map(function(x) { return String(x || "").trim().replace(/;\s*$/, ""); })
      .filter(String).join("; ");
    var link = String(cell(r, "link") || "").trim();
    if (link.indexOf("http") !== 0) link = AIAAIC_FALLBACK_LINK;

    items.push({
      date: isNaN(yr) ? "" : new Date(yr, 0, 1),
      source: "AIAAIC",
      id: id,
      headline: headline,
      link: link,
      citeLink: "",
      outlet: "",
      deployer: cleanText_(cell(r, "deployer")),
      developer: cleanText_(cell(r, "developer")),
      system: cleanText_(cell(r, "system")),
      technology: cleanText_(cell(r, "technology")),
      jurisdiction: cleanText_(cell(r, "jurisdiction")),
      sector: cleanText_(cell(r, "sector")),
      harms: cleanText_(harms),
      snippet: ""
    });
  }
  return items;
}

// Rows stored before AIAAIC published their incident page (or while
// the link column was misread) point at the repository home page.
// Each fetch swaps in the incident page once the registry has one.
function repairAiaaicLinks_(sheet, items) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  var pages = {};
  for (var i = 0; i < items.length; i++) {
    if (items[i].link !== AIAAIC_FALLBACK_LINK) pages[items[i].id] = items[i].link;
  }
  var data = sheet.getRange(2, 3, lastRow - 1, 3).getValues(); // ID, Headline, Link
  var fixed = 0;
  for (var j = 0; j < data.length; j++) {
    var page = pages[String(data[j][0]).trim()];
    if (page && String(data[j][2]).trim() === AIAAIC_FALLBACK_LINK) {
      sheet.getRange(j + 2, 5).setValue(page);
      fixed++;
    }
  }
  return fixed;
}


// ============================================================
// AIID (one row per INCIDENT, with the canonical record)
// ============================================================
// The RSS emits one item per REPORT, dated by when the report was
// added — not when the incident happened, and one incident collects
// many reports. So the RSS is used only to discover incident numbers;
// each NEW number's real record (date, title, description) is then
// fetched from the site's page-data JSON.

const AIID_MAX_LOOKUPS = 40; // canonical-record fetches per run

function fetchAiid_(existingKeys) {
  var items = [];
  var response = UrlFetchApp.fetch(AIID_RSS_URL, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0 NewsTracker/1.0" }
  });
  if (response.getResponseCode() !== 200) {
    Logger.log("AIID returned HTTP " + response.getResponseCode());
    return items;
  }

  var root = XmlService.parse(response.getContentText()).getRootElement();
  var channel = root.getChild("channel");
  if (!channel) return items;

  // Discover unique incident numbers; keep the newest report's article
  // link per incident (RSS is newest-first)
  var byIncident = {};
  var rssItems = channel.getChildren("item");
  for (var i = 0; i < rssItems.length; i++) {
    var item = rssItems[i];
    var link = getChildText_(item, "link").trim();
    var citeMatch = getChildText_(item, "description").match(/https:\/\/incidentdatabase\.ai\/cite\/(\d+)/);
    if (!citeMatch || !link) continue;
    var num = citeMatch[1];
    if (byIncident[num]) continue;
    var outlet = "";
    var hostMatch = link.match(/^https?:\/\/(?:www\.)?([^\/]+)/i);
    if (hostMatch) outlet = hostMatch[1];
    byIncident[num] = { link: link, outlet: outlet };
  }

  var fetched = 0;
  for (var n in byIncident) {
    if (existingKeys && existingKeys["#" + n]) continue; // already stored
    if (fetched >= AIID_MAX_LOOKUPS) break;
    var rec = fetchAiidIncident_(n);
    fetched++;
    if (!rec) continue;
    items.push({
      date: rec.date,
      source: "AIID",
      id: "#" + n,
      headline: rec.title,
      link: byIncident[n].link,
      citeLink: "https://incidentdatabase.ai/cite/" + n,
      outlet: byIncident[n].outlet,
      deployer: "", developer: "", system: "", technology: "",
      jurisdiction: "", sector: "",
      harms: "",
      snippet: rec.description
    });
  }
  return items;
}

// Canonical incident record from the Gatsby page-data JSON
function fetchAiidIncident_(num) {
  try {
    var resp = UrlFetchApp.fetch("https://incidentdatabase.ai/page-data/cite/" + num + "/page-data.json", {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { "User-Agent": "Mozilla/5.0 NewsTracker/1.0" }
    });
    if (resp.getResponseCode() !== 200) return null;
    var inc = findIncident_(JSON.parse(resp.getContentText()), 0);
    if (!inc) return null;

    var title = cleanText_(String(inc.title || ""));
    if (!title) return null;
    var desc = cleanText_(String(inc.description || ""));
    if (desc.length > 240) {
      desc = desc.substring(0, 240);
      var sp = desc.lastIndexOf(" ");
      if (sp > 150) desc = desc.substring(0, sp);
      desc += "…";
    }
    return { date: parseDate_(String(inc.date || "")), title: title, description: desc };
  } catch (e) {
    Logger.log("AIID incident " + num + ": " + e.message);
    return null;
  }
}

function findIncident_(o, depth) {
  if (depth > 6 || !o || typeof o !== "object") return null;
  if (o.incident_id && (o.date || o.title)) return o;
  for (var k in o) {
    var r = findIncident_(o[k], depth + 1);
    if (r) return r;
  }
  return null;
}


// ============================================================
// SHEET WRITING (bulk — the AIAAIC backfill is ~2,250 rows)
// ============================================================

function getHeaders_() {
  return ["Date", "Source", "ID", "Headline", "Link", "CiteLink", "Outlet",
          "Deployer", "Developer", "System", "Technology", "Jurisdiction",
          "Sector", "Harms", "Snippet"];
}

function writeIncidents_(sheet, items) {
  var values = items.map(function(it) {
    return [it.date, it.source, it.id, it.headline, it.link, it.citeLink,
            it.outlet, it.deployer, it.developer, it.system, it.technology,
            it.jurisdiction, it.sector, it.harms, it.snippet];
  });
  sheet.insertRowsAfter(1, values.length);
  sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold").setFontFamily("Arial").setFontSize(10)
      .setBackground("#f3f3f3").setFontColor("#333333");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 90);   // Date
    sheet.setColumnWidth(2, 70);   // Source
    sheet.setColumnWidth(3, 100);  // ID
    sheet.setColumnWidth(4, 420);  // Headline
    sheet.setColumnWidth(5, 180);  // Link
    sheet.setColumnWidth(6, 160);  // CiteLink
    sheet.setColumnWidth(7, 120);  // Outlet
    sheet.setColumnWidth(8, 150);  // Deployer
    sheet.setColumnWidth(9, 150);  // Developer
    sheet.setColumnWidth(10, 130); // System
    sheet.setColumnWidth(11, 130); // Technology
    sheet.setColumnWidth(12, 100); // Jurisdiction
    sheet.setColumnWidth(13, 130); // Sector
    sheet.setColumnWidth(14, 220); // Harms
    sheet.setColumnWidth(15, 320); // Snippet
    sheet.getRange("A2:O").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
    sheet.getRange("A2:A").setNumberFormat("dd/MM/yyyy");
  }
  return sheet;
}

function getExistingKeys_(sheet) {
  var keys = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return keys;
  // AIAAIC rows are keyed by ID (col C), AIID report rows by Link (col E)
  var data = sheet.getRange(2, 3, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) keys[data[i][0]] = true; // ID
    if (data[i][2]) keys[data[i][2]] = true; // Link
  }
  return keys;
}

function trimSheet_(sheet, maxRows) {
  var lastRow = sheet.getLastRow();
  if (lastRow > maxRows + 1) {
    sheet.deleteRows(maxRows + 2, lastRow - maxRows - 1);
  }
}

function autoFormatSheets_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    if (s.getName() === SUMMARY_SHEET) continue;
    var lastRow = s.getLastRow();
    var lastCol = s.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;

    s.getRange(2, 1, lastRow - 1, lastCol).sort({ column: 1, ascending: false });
    s.getRange(1, 1, 1, lastCol)
      .setFontWeight("bold").setFontFamily("Arial").setFontSize(10)
      .setBackground("#f3f3f3").setFontColor("#333333");
    s.getRange(2, 1, lastRow - 1, lastCol)
      .setFontFamily("Arial").setFontSize(9).setFontColor("#333333")
      .setFontWeight("normal").setBackground("#ffffff");
    s.getRange(2, 1, lastRow - 1, 1).setNumberFormat("dd/MM/yyyy");
  }
}


// ============================================================
// SUMMARY DASHBOARD
// ============================================================

function updateSummary_(ss, master) {
  var sheet = ss.getSheetByName(SUMMARY_SHEET);
  if (!sheet) sheet = ss.insertSheet(SUMMARY_SHEET);
  sheet.clear();

  var lastRow = master.getLastRow();
  if (lastRow <= 1) return;

  var data = master.getRange(2, 1, lastRow - 1, 13).getValues();
  var bySource = {}, byYear = {}, bySector = {};

  for (var i = 0; i < data.length; i++) {
    var source = String(data[i][1] || "").trim();
    if (source) bySource[source] = (bySource[source] || 0) + 1;
    var d = new Date(data[i][0]);
    if (!isNaN(d.getTime())) {
      var y = String(d.getFullYear());
      byYear[y] = (byYear[y] || 0) + 1;
    }
    String(data[i][12] || "").split(";").forEach(function(x) {
      x = x.trim();
      if (x) bySector[x] = (bySector[x] || 0) + 1;
    });
  }

  sheet.getRange("A:B").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
  var row = 1;
  sheet.getRange(row, 1).setValue("AI INCIDENTS TRACKER — SUMMARY")
    .setFontWeight("bold").setFontSize(11).setFontFamily("Arial")
    .setBackground("#f3f3f3").setFontColor("#333333");
  sheet.getRange(row, 1, 1, 2).merge();
  row += 2;

  sheet.getRange(row, 1).setValue("Total incidents:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(data.length);
  row++;
  sheet.getRange(row, 1).setValue("Last updated:").setFontWeight("bold");
  sheet.getRange(row, 2).setValue(new Date()).setNumberFormat("yyyy-MM-dd HH:mm");
  row += 2;

  row = writeCountBlock_(sheet, row, "BY SOURCE", bySource, 10);
  row = writeCountBlock_(sheet, row, "BY YEAR", byYear, 30);
  row = writeCountBlock_(sheet, row, "TOP SECTORS", bySector, 20);

  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 100);
}

function writeCountBlock_(sheet, row, title, counts, maxRows) {
  sheet.getRange(row, 1).setValue(title)
    .setFontWeight("bold").setFontSize(11).setFontFamily("Arial")
    .setBackground("#f3f3f3").setFontColor("#333333");
  sheet.getRange(row, 1, 1, 2).merge();
  row++;
  var arr = [];
  for (var k in counts) arr.push([k, counts[k]]);
  arr.sort(function(a, b) { return b[1] - a[1]; });
  for (var i = 0; i < Math.min(arr.length, maxRows); i++) {
    sheet.getRange(row, 1).setValue(arr[i][0]);
    sheet.getRange(row, 2).setValue(arr[i][1]);
    row++;
  }
  return row + 1;
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
  text = String(text).replace(/<[^>]+>/g, " ");
  text = text.replace(/&#(\d+);/g, function(m, n) {
    try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return m; }
  });
  text = text.replace(/&#x([0-9a-fA-F]+);/g, function(m, n) {
    try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return m; }
  });
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
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
    "Setup complete! (script " + SCRIPT_VERSION + ")\n\n" +
    "1. Run 'fetchIncidents' — the first run backfills ~2,250 AIAAIC records\n" +
    "2. Run 'createTwelveHourTrigger' to automate"
  );
}

function createTwelveHourTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "fetchIncidents") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Registries update daily-ish — every 12 hours is plenty
  ScriptApp.newTrigger("fetchIncidents").timeBased().everyHours(12).create();
  SpreadsheetApp.getUi().alert("Trigger created! Incidents will be fetched every 12 hours.");
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
  SpreadsheetApp.getUi().alert("All sheets reformatted.");
}

// One-time repair: the first backfill stamped AIAAIC rows that have no
// "Occurred" year with the fetch date. Re-fetches the registry, finds
// which IDs are genuinely undated, and blanks their Date cells.
function repairUndatedAiaaic() {
  var undated = {};
  var items = fetchAiaaic_();
  for (var i = 0; i < items.length; i++) {
    if (!items[i].date) undated[items[i].id] = true;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MASTER_SHEET);
  if (!master || master.getLastRow() <= 1) return;

  var lastRow = master.getLastRow();
  var ids = master.getRange(2, 3, lastRow - 1, 1).getValues();
  var fixed = 0;
  for (var j = 0; j < ids.length; j++) {
    if (undated[String(ids[j][0]).trim()]) {
      master.getRange(j + 2, 1).setValue("");
      fixed++;
    }
  }
  autoFormatSheets_(ss);
  updateSummary_(ss, master);
  SpreadsheetApp.getUi().alert("Repaired " + fixed + " undated AIAAIC rows (dates blanked; they now sort last).");
}

// One-time: earlier versions stored one AIID row per report, dated by
// when the report was added. Deletes all AIID rows and refetches them
// as one-per-incident with real incident dates and canonical titles.
function rebuildAiidRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MASTER_SHEET);
  if (!master || master.getLastRow() <= 1) return;

  var lastRow = master.getLastRow();
  var sources = master.getRange(2, 2, lastRow - 1, 1).getValues();
  var removed = 0;
  for (var i = sources.length - 1; i >= 0; i--) {
    if (String(sources[i][0]).trim() === "AIID") {
      master.deleteRow(i + 2);
      removed++;
    }
  }

  fetchIncidents();
  SpreadsheetApp.getUi().alert(
    "AIID rows rebuilt.\n\n" +
    "Old report rows removed: " + removed + "\n" +
    "Refetched as one row per incident (real dates, canonical titles)."
  );
}

// Fetch both sources and log counts without writing — debugging aid
function testSources() {
  var a = [], b = [];
  try { a = fetchAiaaic_(); } catch (e) { Logger.log("AIAAIC: " + e.message); }
  try { b = fetchAiid_(); } catch (e) { Logger.log("AIID: " + e.message); }
  Logger.log("AIAAIC: " + a.length + " | AIID: " + b.length);
  if (a.length) Logger.log("AIAAIC first: " + a[0].id + " — " + a[0].headline);
  if (b.length) Logger.log("AIID first: " + b[0].id + " — " + b[0].headline);
  SpreadsheetApp.getUi().alert(
    "Source test (script " + SCRIPT_VERSION + ")\n\n" +
    "AIAAIC records: " + a.length + "\n" +
    "AIID reports: " + b.length + "\n\n" +
    "Check Apps Script logs for samples."
  );
}


// ============================================================
// MENU
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Incidents Tracker")
    .addItem("Fetch incidents now", "fetchIncidents")
    .addItem("Setup sheets", "setupSheets")
    .addSeparator()
    .addItem("Create 12-hour trigger", "createTwelveHourTrigger")
    .addItem("Remove triggers", "removeTriggers")
    .addSeparator()
    .addItem("Update summary", "updateSummaryManual")
    .addItem("Reformat all sheets", "reformatAllSheets")
    .addItem("Repair undated rows", "repairUndatedAiaaic")
    .addItem("Rebuild AIID rows", "rebuildAiidRows")
    .addItem("Test sources (debug)", "testSources")
    .addToUi();
}
