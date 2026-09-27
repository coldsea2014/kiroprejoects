# TubePilot 5 — AI SEO for music videos on YouTube

Manifest V3 Chrome extension. **Gemini listens to the song** (style, rhythm, BPM, maqam, dialect, chorus, best moments), then TubePilot writes scored titles, a description with a valid `00:00` chapter timeline, tags within 500 characters and trending hashtags — and **fills YouTube Studio automatically**, following YouTube policies.

- User documentation: [`docs/index.html`](docs/index.html) · Privacy policy: [`docs/privacy.html`](docs/privacy.html)
- Store texts: [`store/chrome-web-store.md`](store/chrome-web-store.md), [`store/codecanyon.md`](store/codecanyon.md) · [`CHANGELOG.md`](CHANGELOG.md)

## Install (developer mode)
1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder (the one with `manifest.json`).
2. The settings page opens with a 4-step checklist: sign in to Gemini, describe the channel, optional YouTube API key, open YouTube Studio.

## Features
| Area | What it does |
|---|---|
| Listening | Gemini (your subscription at gemini.google.com, or the Gemini API) listens to the uploaded file (audio extracted locally, 16 kHz WAV) or the public link; world-music guide (Gulf, Iraq, Yemen, Levant, Egypt, Maghreb, Africa, urban, jazz, RnB, fusions); local BPM measurement |
| Keywords | Real YouTube suggestions A→Z in the style’s country/language; **Google Keyword Planner CSV import** (real monthly volumes); competition score (YouTube Data API); Google Trends links; tag basket |
| SEO pack | 6–12 scored titles (hooks), 3 A/B titles, description with chapters and 🔥 best moments, tags ≤ 500 chars, 3–5 hashtags, pinned comment, thumbnail texts, Short |
| Studio | Card between title and description, autopilot on upload, fills empty fields only, tag suggestions while typing, watch-page analysis card |
| Rules | Title/description/tags/hashtags/chapters checks against YouTube policies, synthetic-content and cover reminders |
| Panel | Video report, keywords, competitors (outliers, best hours, top tags), trends, history |
| UI | English / French / Arabic (RTL), light / dark, SVG icons, design tokens |
| Privacy | No server; everything in `chrome.storage.local`; YouTube API data pruned after 30 days |

## Project structure
```
manifest.json            MV3 manifest (name/description from _locales)
_locales/{en,fr,ar}/     store name and description
background/sw.js         service worker: side panel, messages, cache pruning
content/                 studio.js (Studio card), youtube.js (watch card), gemini-web.js (drives gemini.google.com),
                         ui-kit.js (Shadow DOM helpers), *-main.js (MAIN-world hooks), shadow.css
engine/                  hidden extension page inside Studio: receives the file, runs the pipeline
sidepanel/, options/     side panel and settings pages
lib/                     pipeline, prompts, gemini (API), gemini-web, keywords, kpimport (Keyword Planner),
                         ytapi, trends, media (audio/BPM), policy, seo (scores), postprocess, storage,
                         i18n + locales, icons, tp.css (design system)
docs/                    documentation and privacy policy
store/                   Chrome Web Store / CodeCanyon texts
tests/                   Node unit tests + Playwright e2e (mocked Studio, YouTube, Gemini)
tools/                   zip packager, i18n checker, icon generator
```

## Development
```bash
npm test                 # 29 unit tests (node --test)
npm run i18n             # every translation key exists in en/fr/ar
npm run e2e              # Chromium + extension, mocked Google services (needs Playwright)
npm run zip              # dist/tubepilot-<version>.zip (extension) + dist/tubepilot-<version>-source.zip
```
Add a language: copy `lib/locales/en.js` to `lib/locales/xx.js`, translate, add it to `lib/lang.js`, `manifest.json` (content scripts) and `NAMES` in `lib/i18n.js`, then run `npm run i18n`.

## Limits and notes
- **Subscription mode** automates the Gemini web page in the user’s own browser session; if Google changes that page, use the API engine or the manual copy/paste mode until an update.
- **Keyword Planner** has no free public API (it requires a Google Ads developer token): volumes come from the CSV export, which measures Google Search demand.
- Do not use “YouTube” or “Gemini” in a product name; TubePilot is not affiliated with Google.

## En bref (français)
Installez (`chrome://extensions` › Mode développeur › Charger l’extension non empaquetée), connectez-vous à gemini.google.com, remplissez le profil de chaîne, puis mettez une vidéo en ligne dans YouTube Studio : la carte TubePilot apparaît entre le titre et la description, Gemini écoute la chanson et les champs se remplissent. Importez vos exports **Keyword Planner** (Réglages › Keyword Planner) pour avoir les vrais volumes mensuels. La langue de l’interface (anglais, français, arabe) se choisit en haut des réglages.
