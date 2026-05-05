# news-tracker — Security Audit

**Date:** 2026-05-04
**Scope:** `index.html`, `sw.js`, `manifest.json`, `README.md`
**Reference:** *Grokking Web Application Security* (McDonald, Manning 2024)

## Summary

| Severity | Count |
|---|---|
| 🔴 High | 3 |
| 🟡 Medium | 3 |
| 🟢 Low | 2 |
| ✅ OK | 7 |
| ➖ N/A | 4 |

**Overall grade: B−** — site has strong infrastructure (HTTPS, no auth surface, privacy-friendly analytics) but the rendering layer trusts upstream feeds without escaping, and there is no CSP to backstop that trust.

---

## Findings by subcategory

### 1. Transport & Encryption — ✅ OK
- ✅ HTTPS enforced via GitHub Pages default
- ✅ TLS 1.2+ negotiated
- ✅ HSTS preload provided by GitHub Pages
- ⏳ *To probe:* exact cert expiry, SSL Labs grade

### 2. HTTP Security Headers — 🔴 HIGH
- 🔴 **No Content-Security-Policy** anywhere in the page. Without CSP, any XSS payload runs unrestricted. CSP via `<meta http-equiv>` is the realistic option on GitHub Pages.
- 🟢 GitHub Pages provides `X-Content-Type-Options: nosniff` automatically
- ➖ `X-Frame-Options` / `frame-ancestors` controlled by GH Pages defaults

### 3. Cookie & Session Hygiene — ➖ N/A
- ✅ No cookies set by the site (zero session surface)
- ✅ localStorage use is bounded (`news-tracker-user-tags`, `news-tracker-sync-url`)

### 4. Authentication — ➖ N/A (site)
Tracked at *infrastructure* level instead:
- ⏳ *To verify manually:* GitHub 2FA, Google account 2FA, domain registrar 2FA

### 5. Authorization — ➖ N/A (site)
- ⏳ *To verify manually:* Google Sheet collaborator count (should be only the owner), Apps Script editor list

### 6. Input handling & Injection — 🔴 HIGH
The card-rendering pipeline interpolates RSS-controlled fields directly into HTML and assigns to `.innerHTML`. This is the single biggest weakness in the codebase.

- 🔴 **`index.html:1423`** — `<h2 class="card-headline">${article.headline}</h2>` — headline from feed inserted raw into HTML. A malicious or compromised feed can publish `<img src=x onerror=...>` and run arbitrary JS in every visitor's browser.
- 🔴 **`index.html:1419`** — `href="${href}"` — feed-supplied link is not protocol-validated. A `javascript:` URL would execute on click.
- 🔴 **`index.html:1397`** — `<span class="tag">${t}</span>` — tags interpolated raw.
- 🟡 **`index.html:1405`** — `src="${article.imageUrl}"` — feed-supplied image URL inserted into a double-quoted attribute. A `"` in the value would break out and inject other attributes.
- 🟡 **`index.html:1425`** — `${article.source}` — currently safe (controlled values) but uses the same unsafe pattern, will break if source is ever derived from feed metadata.
- 🟢 **`index.html:1398`** — `escapedHeadline` is computed but never used. Looks like an abandoned escaping attempt. Should be removed or wired in.

**Why this matters per the book:** Ch. 4 ("Escaping output") is explicit that escaping must happen at the point of rendering, and Ch. 6 ("Cross-site scripting") notes that *any* place untrusted strings meet HTML is a candidate for XSS. The trust boundary here is "every upstream RSS feed and the AISI HTML scraper" — Ch. 13 ("Vulnerabilities in third-party code") treats those as untrusted by default.

### 7. Third-party code & Supply chain — 🟡 MEDIUM
- 🟡 **`index.html:1766`** — GoatCounter script loaded from `//gc.zgo.at/count.js` (protocol-relative, no SRI). If `gc.zgo.at` is compromised, arbitrary JS runs on the site. CSP (see §2) is the practical mitigation since GoatCounter doesn't publish stable hashes.
- 🟡 **`index.html:16-17`** — Google Fonts CSS loaded from `fonts.googleapis.com`. SRI not feasible (CSS imports nested URLs). Self-hosting both font families would close this.
- 🟢 Service worker (`sw.js:35`) caches only successful same-origin responses — correct behavior.
- ✅ No npm dependencies (vanilla JS) — minimal supply-chain surface.
- ⏳ *To probe:* RSS source uptime per source over last 7 days.

### 8. Outbound risks — 🟡 MEDIUM
- 🟡 **`index.html:1326,1378`** — `saveSyncUrl()` accepts any URL the user pastes into settings and POSTs JSON to it with `mode: 'no-cors'`. No protocol or domain validation. Real-world risk is low (user controls input), but a one-line guard like `syncUrl.startsWith('https://script.google.com/')` would prevent accidents and fits the "least privilege" principle from Ch. 5.
- ✅ All external links use `target="_blank" rel="noopener noreferrer"` — defends against reverse tabnabbing (Ch. 6).
- ➖ No email sending, no server-side fetch — SSRF, SPF/DKIM/DMARC not applicable.

### 9. Privacy & Compliance — 🟡 MEDIUM
- 🟡 Google Fonts hot-loading leaks every visitor's IP to Google. German GDPR rulings have flagged this as a violation when used without consent. **Self-host fix is straightforward.**
- 🟡 Unsplash images leak visitor IPs to Unsplash. Lower priority.
- ✅ GoatCounter is cookieless and does not fingerprint — privacy-friendly choice.
- ✅ No cookies, no third-party trackers beyond the above.
- ⏳ *To consider:* `/.well-known/security.txt` for vulnerability disclosure, brief privacy notice page.

### 10. Process & Hygiene — ⏳ TO VERIFY
- ⏳ Branch protection on `main`?
- ⏳ GitHub 2FA enforced?
- ⏳ Last secret-scan run (gitleaks/trufflehog)?
- ⏳ The `.gs` file in `google-apps-script/` is the source of truth — confirm it's committed and matches the deployed Apps Script.
- ✅ `.gitignore` present.

### 11. Incident readiness — 🟢 LOW
- 🟢 No uptime monitor configured.
- 🟢 No alerting on Apps Script trigger failure (silent failure means stale news).
- ⏳ Add: nightly check that "All News" sheet has rows added in last 24h.

---

## 🔴 HIGH-priority problems (block before next iteration)

1. **XSS in card rendering** (`index.html:1397, 1419, 1423`) — escape headline, tags, and validate the link href.
2. **Missing Content-Security-Policy** — add `<meta http-equiv="Content-Security-Policy">` so any future XSS slip is contained.
3. **`href` accepts `javascript:` URLs** — validate that link starts with `http://` or `https://`.

## 🟡 MEDIUM problems (do soon)

4. Image URL attribute breakout (`index.html:1405`) — escape or validate feed-provided image URLs.
5. Sync URL not validated (`index.html:1326`) — restrict to `https://script.google.com/`.
6. Google Fonts hot-loaded — self-host for privacy + supply-chain.
7. GoatCounter script lacks SRI — covered by adding CSP.

## 🟢 LOW problems (nice-to-have)

8. Dead code: `escapedHeadline` (`index.html:1398`) — remove or wire in.
9. Inline `onerror` handler (`index.html:1406`) — replace with addEventListener so CSP can drop `'unsafe-inline'` for scripts.

## ✅ Doing well

- HTTPS everywhere, GitHub Pages enforces TLS
- All external links use `rel="noopener noreferrer"`
- Service worker caches only same-origin responses
- No npm dependency surface
- No cookies, no fingerprinting
- GoatCounter is privacy-respecting analytics
- Apps Script `.gs` file is checked into the repo as source of truth

## Recommended fix order

1. Add CSP `<meta>` tag (defensive, no behavior change)
2. Add `escapeHtml()` helper, apply to headline / tags / source / author in `createCard()`
3. Validate `href` (reject non-`http(s):` URLs)
4. Validate `syncUrl` prefix
5. Remove dead `escapedHeadline`
6. Self-host Google Fonts
7. Replace inline `onerror` with event listener

Steps 1–3 close the entire HIGH category and cost ~30 lines of code.
