# CodeCanyon item — TubePilot 5.1 (Chrome extension source code)

**Category:** JavaScript › Browser extensions (or Plugins › Chrome)
**Compatible browsers:** Chrome 116+, Edge, Brave, Opera (Chromium)
**Files included:** JavaScript, HTML, CSS, JSON · **Documentation:** well documented (`docs/index.html`)
**Framework:** none (vanilla JavaScript, Manifest V3) · **Build step:** none

## Item description
TubePilot is a complete, production-ready Manifest V3 Chrome extension that brings AI SEO to YouTube music creators. Google Gemini listens to the song (style, rhythm, BPM, maqam, dialect, chorus, best moments) and TubePilot writes scored titles, a description with a valid 00:00 chapter timeline, tags within 500 characters and trending hashtags — then fills YouTube Studio automatically.

### Features
- Gemini listening analysis tuned for world music (Gulf, Iraq, Yemen, Levant, Egypt, Maghreb, Africa, urban, jazz, RnB, fusions)
- Works with the user’s own Gemini account (gemini.google.com): no API key, no AI Studio quota; Pro model selected automatically; expert master prompt (YouTube strategist, ethnomusicologist, SEO specialist, hook copywriter); link retry; JSON repair
- Keyword research from real YouTube suggestions in the style’s country and language
- Google Keyword Planner CSV import (UTF-16/UTF-8, 7 languages of headers, volume ranges) blended into the ranking and the AI brief
- Competition score (YouTube Data API), competitor tracking with outlier videos, trends by country
- YouTube Studio card (Shadow DOM), autopilot on upload, replacement of the old title / description / tags, comment to pin, tag suggestions, YouTube watch-page card
- YouTube policy checker (titles, description, tags, hashtags, chapters, synthetic content, covers)
- Side panel report with editable fields, live SEO score, history
- i18n: English, French, Arabic (RTL) — add a language by copying one file in `lib/locales/`
- Design system with tokens, light / dark themes, SVG icon set
- No server, no tracking; local storage only; 30-day YouTube data retention
- 30 unit tests (Node) + end-to-end test (Playwright) with mocked Google services

### Requirements for the buyer
- Chrome 116+ · a Google account signed in to Gemini · optional YouTube Data API key, Google Ads account (Keyword Planner export)
- To publish on the Chrome Web Store: a developer account ($5 one-time), your own brand name and privacy-policy URL

### What’s included
- `tubepilot/` — the extension, ready to “Load unpacked” or to zip for the Web Store
- `docs/` — user documentation and privacy policy template
- `store/` — Chrome Web Store listing texts, permission justifications, data disclosures
- `tests/`, `tools/` — test suites, i18n key checker, icon generator, packager

### Customization
- Brand: `_locales/*/messages.json`, `icons/`, colors in `lib/tp.css` (`--tp-brand`, `--tp-grad`)
- Prompts: `lib/prompts.js` · YouTube rules and limits: `lib/policy.js` · scoring: `lib/seo.js`
- Languages: `lib/locales/*.js` then `node tools/check-i18n.mjs`

### Important notes (please read before buying)
- TubePilot automates the Gemini web page in the user’s own browser. Google may change that page at any time; the manual copy/paste mode keeps working in the meantime and the selectors live in `content/gemini-web.js`. Review Google’s terms for your use case.
- Keyword Planner has no free public API; volumes come from the user’s CSV export.
- You are responsible for complying with the Chrome Web Store program policies, the YouTube API Services Terms and Google trademark guidelines (do not use “YouTube” or “Gemini” in your product name).

## Changelog
See `CHANGELOG.md`.
