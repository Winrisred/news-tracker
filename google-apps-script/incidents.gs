// ============================================================
// AI Incidents Tracker — Google Apps Script
// Version: v3.32 (2026-11)
//
// Collects AI incident records from two public registries, and
// AI lawsuits from a third, and stores them in Google Sheets for
// the incidents.html ledger:
//
//   • AIAAIC Repository — the full curated registry, fetched as
//     CSV from its public Google Sheet. License: CC BY-SA 4.0 —
//     the web page credits AIAAIC visibly. ~2,250 records with
//     taxonomy (deployer, developer, sector, jurisdiction, harms).
//   • AI Incident Database (AIID) — RSS feed of newly added
//     incident reports (real dates, article links, incident IDs).
//   • Database of AI Litigation (DAIL), GW Ethical Tech Initiative
//     — ~570 lawsuits, read from the search page on its site (it
//     has no export). Unlike the registries, a case keeps changing
//     after it is filed, so every fetch re-reads the whole list and
//     updates stored cases in place.
//
// The sources are kept as parallel streams (Source column),
// never merged/deduplicated across each other.
//
// Sheets:
//   • "All Incidents" — every record
//   • "Summary"       — counts by source, year, sector
//
// Setup (use a NEW Google Sheet, separate from news and voices):
//   1. Extensions → Apps Script → paste this code
//   2. Run setupSheets() once
//   3. Run fetchIncidents() — first run backfills ~2,800 rows
//   4. Run createTwelveHourTrigger() to automate
//   5. File → Share → Publish to web → "All Incidents" as CSV,
//      paste the URL into INCIDENTS_CSV_URL in incidents.html
// ============================================================

const SCRIPT_VERSION = "v3.32";

const MASTER_SHEET = "All Incidents";
const SUMMARY_SHEET = "Summary";
const MAX_ROWS = 8000;

const AIAAIC_CSV_URL = "https://docs.google.com/spreadsheets/d/1Bn55B4xz21-_Rgdr8BBb2lt0n_4rzLGxFADMlVW0PYI/export?format=csv&gid=888071280";
const AIAAIC_FALLBACK_LINK = "https://www.aiaaic.org/aiaaic-repository";
const AIID_RSS_URL = "https://incidentdatabase.ai/rss.xml";

const DAIL_HOST_PAGE = "https://blogs.gwu.edu/law-eti/ai-litigation-database/";
const DAIL_CASE_PAGE = "https://blogs.gwu.edu/law-eti/ai-litigation-database/case-detail-page/?pid=";
const DAIL_DATAPAGE = "https://c7amf338.caspio.com/dp/c2bb900059f36a69ab3641b59ba4";

// DAIL states no licence for reuse (AIAAIC is CC BY-SA). Case names,
// courts, dates, status and labels are facts; the one-line case
// descriptions are GW's own writing, so they stay out of the
// published sheet until GW agrees. Set this to true and the next
// fetch fills them in on every case (false blanks them again).
const DAIL_INCLUDE_DESCRIPTIONS = false;


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

  var dailSync = null;
  try {
    var dail = fetchDail_();
    if (dail) {
      dailSync = syncDail_(master, dail);
      for (var k = 0; k < dailSync.fresh.length; k++) {
        if (!existingKeys[dailSync.fresh[k].id]) {
          newItems.push(dailSync.fresh[k]);
          existingKeys[dailSync.fresh[k].id] = true;
        }
      }
      Logger.log("DAIL: " + dail.length + " cases · " + dailSync.fresh.length + " new · " +
                 dailSync.updated + " updated · " + dailSync.removed + " withdrawn");
    }
  } catch (e) {
    Logger.log("DAIL error: " + e.message);
  }

  var touched = dailSync && (dailSync.updated || dailSync.removed);
  if (newItems.length === 0 && !touched) {
    Logger.log("No new incidents.");
    return;
  }

  if (newItems.length) {
    newItems.sort(function(a, b) {
      return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);
    });
    writeIncidents_(master, newItems);
  }
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
// DAIL (Database of AI Litigation, GW Ethical Tech Initiative)
// ============================================================
// The database is a Caspio app embedded in the GW page, with no
// export or feed. Its search page is read the way the page's own
// script reads it, in three steps:
//   1. the search form (Caspio returns it inside a JS call)
//   2. an empty search, posted back; the redirect it answers with
//      carries the session id
//   3. the result pages, 50 cases each (~12 pages, ~3 MB in all)
// Cells are found by their labels, never by position. Any step
// that fails skips DAIL for this run and leaves stored cases alone.

// Every case, or null if the list couldn't be read in full
function fetchDail_() {
  var appKey = DAIL_DATAPAGE.split("/").pop();
  var cookies = {};

  function remember(resp) {
    var sc = header_(resp, "Set-Cookie");
    if (!sc) return;
    (Array.isArray(sc) ? sc : [sc]).forEach(function(c) {
      var pair = String(c).split(";")[0];
      var eq = pair.indexOf("=");
      if (eq > 0) cookies[pair.substring(0, eq).trim()] = pair.substring(eq + 1).trim();
    });
  }
  function request(url, payload, follow) {
    var headers = { "User-Agent": "Mozilla/5.0 NewsTracker/1.0", "Referer": DAIL_HOST_PAGE };
    var jar = Object.keys(cookies).map(function(k) { return k + "=" + cookies[k]; }).join("; ");
    if (jar) headers.Cookie = jar;
    var opts = { muteHttpExceptions: true, followRedirects: follow !== false, headers: headers };
    if (payload) { opts.method = "post"; opts.payload = payload; }
    var resp = UrlFetchApp.fetch(url, opts);
    remember(resp);
    return resp;
  }

  // 1. The search form
  var query = "AppKey=" + appKey + "&js=true&cbEmbDeployWith=new_async_embedjs" +
    "&cbDatapageAnchorId=newstracker&pathname=" + DAIL_HOST_PAGE +
    "&cbScreenWidth=1400&cbEmbQueryStr=&cbParamList=";
  var resp = request(DAIL_DATAPAGE + "?cbqe=" + encodeURIComponent(Utilities.base64Encode(query)) +
    "&cbEmbedTimeStamp=" + Date.now());
  if (resp.getResponseCode() !== 200) {
    Logger.log("DAIL form returned HTTP " + resp.getResponseCode());
    return null;
  }
  var fields = dailFormFields_(dailEmbeddedHtml_(resp.getContentText()));
  if (!fields.searchID || !fields.cbUniqueFormId) {
    Logger.log("DAIL search form not recognised — has the page changed?");
    return null;
  }

  // 2. An empty search (every case)
  resp = request(DAIL_DATAPAGE, fields, false);
  var session = (String(header_(resp, "Location") || "").match(/appSession=([A-Za-z0-9]+)/) || [])[1];
  if (!session) {
    Logger.log("DAIL search returned no session (HTTP " + resp.getResponseCode() + ")");
    return null;
  }

  // 3. The result pages
  var byPid = {}, items = [], total = null;
  for (var page = 1; page <= 40; page++) {
    resp = request(DAIL_DATAPAGE + "?rnd=" + Date.now(), {
      ClientQueryString: "", appSession: session, siblingDataPageAppSessions: "{}",
      AjaxAction: "GetData", GridMode: "False", cbUniqueFormId: fields.cbUniqueFormId,
      js: "true", cbCurrentPageSize: "50", CPIPage: String(page),
      CPIOrderBy: "Case_Table_Caption", CPISortType: "asc", PageID: "2",
      AjaxActionHostName: "https://blogs.gwu.edu", cbAjaxReferrer: DAIL_HOST_PAGE
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log("DAIL page " + page + " returned HTTP " + resp.getResponseCode());
      return null;
    }
    var html = String(JSON.parse(resp.getContentText()).responseText || "");
    var count = html.match(/Records\s*\d+\s*-\s*\d+\s*of\s*(\d+)/i);
    if (count) total = parseInt(count[1], 10);
    var rows = dailRows_(html);
    for (var i = 0; i < rows.length; i++) {
      if (byPid[rows[i].pid]) continue;
      byPid[rows[i].pid] = true;
      var item = dailItem_(rows[i]);
      if (item) items.push(item);
    }
    if (!rows.length || total === null || Object.keys(byPid).length >= total) break;
  }
  if (total === null || Object.keys(byPid).length < total) {
    Logger.log("DAIL: read " + Object.keys(byPid).length + " of " + total + " cases — skipped this run");
    return null;
  }
  return items;
}

// A response header, whatever its capitalisation
function header_(resp, name) {
  var all = resp.getAllHeaders();
  for (var k in all) if (k.toLowerCase() === name.toLowerCase()) return all[k];
  return null;
}

// Caspio answers with JS that calls parseAndLoadDatapage(anchor, key,
// '<html as a JS string>'); this returns that HTML
function dailEmbeddedHtml_(js) {
  var m = js.match(/parseAndLoadDatapage\('[^']*',\s*'[0-9a-f]+',\s*'((?:[^'\\]|\\[\s\S])*)'/);
  if (!m) return "";
  return m[1].replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, function(all, e) {
    if (e.length > 1) return String.fromCharCode(parseInt(e.substring(1), 16));
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" }[e] || e;
  });
}

// The search form's fields, as the browser would post them
function dailFormFields_(html) {
  var fields = {};
  var form = (html.match(/<form[^>]*id="caspioform"[\s\S]*?<\/form>/i) || [html])[0];
  (form.match(/<input\b[^>]*>/gi) || []).forEach(function(tag) {
    var name = (tag.match(/\bname="([^"]*)"/i) || [])[1];
    var type = ((tag.match(/\btype="([^"]*)"/i) || [])[1] || "text").toLowerCase();
    if (!name || ["hidden", "text", "submit"].indexOf(type) < 0) return;
    if (type === "submit" && name !== "searchID") return;
    var value = (tag.match(/\bvalue="([^"]*)"/i) || [])[1] || "";
    fields[name] = value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  });
  (form.match(/<select\b[^>]*>/gi) || []).forEach(function(tag) {
    var name = (tag.match(/\bname="([^"]*)"/i) || [])[1];
    if (name && !(name in fields)) fields[name] = "";
  });
  return fields;
}

// One object per result row: { pid, caption, issues, … } keyed by
// the lower-cased cell label ("Algorithm :" → "algorithm")
function dailRows_(html) {
  var out = [];
  (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).forEach(function(tr) {
    var pid = (tr.match(/[?&;]pid=(\d+)/) || [])[1];
    if (!pid) return;
    var rec = { pid: pid };
    (tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || []).forEach(function(td) {
      var label = (td.match(/class="cbResultSetLabel"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
      if (!label) return;
      label = cleanText_(label).replace(/\s*:\s*$/, "").toLowerCase();
      var iso = td.match(/<time[^>]*datetime="(\d{4})-(\d{2})-(\d{2})/);
      rec[label] = iso
        ? new Date(+iso[1], +iso[2] - 1, +iso[3])
        : cleanText_(td.replace(/<span[^>]*class="cbResultSetLabel"[^>]*>[\s\S]*?<\/span>/, ""));
    });
    out.push(rec);
  });
  return out;
}

// A sheet row for one case. Date = filed; ID = DAIL's case number,
// which runs in the order cases are added.
function dailItem_(rec) {
  var caption = rec.caption || "";
  if (!caption) return null;
  function day(v) {
    if (v instanceof Date) return v;
    var us = String(v || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DAIL writes m/d/yyyy
    return us ? new Date(+us[3], +us[1] - 1, +us[2]) : "";
  }
  var status = String(rec.status || "").trim();
  status = status ? status.charAt(0).toUpperCase() + status.substring(1).toLowerCase() : "";
  return {
    date: day(rec["filing date"]),
    source: "DAIL",
    id: "DAIL-" + rec.pid,
    headline: caption,
    link: DAIL_CASE_PAGE + rec.pid,
    citeLink: "",
    outlet: "",
    deployer: "", developer: "",
    system: rec.algorithm || "",
    technology: rec["application areas"] || "",
    jurisdiction: rec.jurisdiction || "",
    sector: "",
    harms: rec.issues || "",
    snippet: DAIL_INCLUDE_DESCRIPTIONS ? (rec["brief description"] || "") : "",
    status: status,
    activity: day(rec["new activity"])
  };
}

// Cases change after they are filed (status, latest activity, new
// issues), so stored cases are rewritten in place when anything
// differs. Cases DAIL no longer lists (merged or withdrawn) are
// removed. Returns the cases not stored yet.
function syncDail_(sheet, items) {
  var result = { fresh: [], updated: 0, removed: 0 };
  var width = getHeaders_().length;
  var lastRow = sheet.getLastRow();
  var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var rowOf = {};
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][1]).trim() === "DAIL") rowOf[String(data[i][2]).trim()] = i;
  }

  var listed = {};
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    listed[it.id] = true;
    var r = rowOf[it.id];
    if (r === undefined) { result.fresh.push(it); continue; }
    var values = rowValues_(it);
    if (sameRow_(data[r], values)) continue;
    sheet.getRange(r + 2, 1, 1, width).setValues([values]);
    result.updated++;
  }

  // The list was read in full (fetchDail_ checks), but a sudden
  // collapse in its size is more likely a broken page than mass
  // withdrawals — keep everything then.
  var gone = [];
  for (var id in rowOf) if (!listed[id]) gone.push(rowOf[id]);
  if (gone.length && items.length >= 0.8 * Object.keys(rowOf).length) {
    gone.sort(function(a, b) { return b - a; });
    for (var g = 0; g < gone.length; g++) sheet.deleteRow(gone[g] + 2);
    result.removed = gone.length;
  }
  return result;
}

function sameRow_(a, b) {
  function key(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.getFullYear() + "-" + v.getMonth() + "-" + v.getDate();
    return String(v == null ? "" : v).trim();
  }
  for (var i = 0; i < b.length; i++) if (key(a[i]) !== key(b[i])) return false;
  return true;
}


// ============================================================
// SHEET WRITING (bulk — the AIAAIC backfill is ~2,250 rows)
// ============================================================

// Status and Activity (v3.32) are DAIL's: a case's Active/Inactive
// status and the date of its latest court activity
function getHeaders_() {
  return ["Date", "Source", "ID", "Headline", "Link", "CiteLink", "Outlet",
          "Deployer", "Developer", "System", "Technology", "Jurisdiction",
          "Sector", "Harms", "Snippet", "Status", "Activity"];
}

function rowValues_(it) {
  return [it.date, it.source, it.id, it.headline, it.link, it.citeLink,
          it.outlet, it.deployer, it.developer, it.system, it.technology,
          it.jurisdiction, it.sector, it.harms, it.snippet,
          it.status || "", it.activity || ""];
}

function writeIncidents_(sheet, items) {
  var values = items.map(rowValues_);
  sheet.insertRowsAfter(1, values.length);
  sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (sheet) {
    // Sheets made before v3.32 have 15 columns: add the new headers
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    var have = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var c = 0; c < headers.length; c++) {
      if (!String(have[c] || "").trim()) sheet.getRange(1, c + 1).setValue(headers[c]);
    }
  } else {
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
    sheet.setColumnWidth(16, 70);  // Status
    sheet.setColumnWidth(17, 90);  // Activity
    sheet.getRange("A2:Q").setFontFamily("Arial").setFontSize(9).setFontColor("#444444");
    sheet.getRange("A2:A").setNumberFormat("dd/MM/yyyy");
    sheet.getRange("Q2:Q").setNumberFormat("dd/MM/yyyy");
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
    // The page reads dates as day/month/year, whatever the sheet's locale
    var activityCol = getHeaders_().indexOf("Activity") + 1;
    if (lastCol >= activityCol) s.getRange(2, activityCol, lastRow - 1, 1).setNumberFormat("dd/MM/yyyy");
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

  sheet.getRange(row, 1).setValue("Total records:").setFontWeight("bold");
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
    "1. Run 'fetchIncidents' — the first run backfills ~2,250 AIAAIC records and ~570 DAIL cases\n" +
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

// Fetch every source and log counts without writing — debugging aid
function testSources() {
  var a = [], b = [], c = [];
  try { a = fetchAiaaic_(); } catch (e) { Logger.log("AIAAIC: " + e.message); }
  try { b = fetchAiid_(); } catch (e) { Logger.log("AIID: " + e.message); }
  try { c = fetchDail_() || []; } catch (e) { Logger.log("DAIL: " + e.message); }
  Logger.log("AIAAIC: " + a.length + " | AIID: " + b.length + " | DAIL: " + c.length);
  if (a.length) Logger.log("AIAAIC first: " + a[0].id + " — " + a[0].headline);
  if (b.length) Logger.log("AIID first: " + b[0].id + " — " + b[0].headline);
  if (c.length) Logger.log("DAIL first: " + c[0].id + " — " + c[0].headline);
  SpreadsheetApp.getUi().alert(
    "Source test (script " + SCRIPT_VERSION + ")\n\n" +
    "AIAAIC records: " + a.length + "\n" +
    "AIID reports: " + b.length + "\n" +
    "DAIL cases: " + c.length + "\n\n" +
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
