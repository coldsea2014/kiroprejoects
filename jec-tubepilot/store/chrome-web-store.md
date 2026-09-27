# Chrome Web Store listing — TubePilot 5

> Copy these texts into the Chrome Web Store developer dashboard. Name, short description and in-extension texts are already localized through `_locales/` (en, fr, ar).

## Name (max 75)
TubePilot — AI SEO & Tags for Music Videos

## Summary (max 132)
Gemini listens to your songs: hook titles, 00:00 timeline of the best moments, tags, trending hashtags, auto-fill in YouTube Studio.

## Category
Productivity (alternative: Tools)

## Description (English)
TubePilot is the SEO co-pilot for music channels on YouTube. Instead of guessing, it lets Google Gemini **listen to your song** — then writes metadata your real audience searches for, and fills YouTube Studio for you.

🎧 LISTENS TO THE MUSIC
• Style, rhythm and tempo (BPM, meter, maqam), dialect, chorus and lyrics
• Every music of the world: khaliji, sheilat, Iraqi rap, Yemeni, Egyptian, Maghrebi chaabi / rai / gnawa, afrobeats, amapiano, trap, drill, RnB, jazz and fusions
• The 2–5 best moments, timestamped to the second

🔑 REAL KEYWORDS, NOT GUESSES
• Real YouTube search suggestions (A→Z) in the country and language of the style heard
• Import your Google Keyword Planner CSV: real monthly volumes in every table and in the AI brief
• Competition score, median views and subscribers of the top 15 (YouTube Data API, optional)
• One-click Google Trends (YouTube search) for any keyword

✍️ A COMPLETE SEO PACK
• 6–12 scored titles with different hooks (emotion, curiosity, direct address, share trigger, listening moment…) + 3 titles for YouTube “Test & compare”
• Description with a valid chapter timeline: 00:00 Intro · 00:45 🔥 Chorus
• 25–40 tags within the 500-character limit, 3–5 trending hashtags
• Pinned comment, thumbnail texts, the best Short to cut

⚡ FILLS YOUTUBE STUDIO
• A card under the title: Analyze, click a title, Apply all
• Autopilot on upload; only empty fields are filled — never what you typed
• Popular searches suggested while you type tags
• Analysis card on any YouTube video: views/hour, outlier score, hooks, tags

🛡️ FOLLOWS YOUTUBE RULES
Checks titles, descriptions, tags, hashtags and chapters against YouTube policies (misleading metadata, keyword stuffing, limits) before you publish.

💎 TWO AI ENGINES
• Your Gemini subscription (gemini.google.com): no key, no per-use cost
• Gemini API (your own key): runs in the background, full-video analysis

🌍 English, French and Arabic interface (right-to-left), light and dark themes.

🔒 PRIVATE BY DESIGN
No server. Keys, profiles and analyses stay in your browser. Media is sent only to Google Gemini.

TubePilot is an independent product, not affiliated with or endorsed by Google or YouTube. YouTube, YouTube Studio, Gemini and Google Ads are trademarks of Google LLC.

## Description (Français)
TubePilot est le copilote SEO des chaînes musicales sur YouTube. Gemini **écoute votre chanson** — style, rythme, dialecte, refrain, meilleurs moments — puis rédige des titres accrocheurs, une description avec timeline 00:00, des tags et des hashtags tendance, et remplit YouTube Studio à votre place.
• Vraies recherches YouTube dans le pays du style, volumes réels importés de Google Keyword Planner, score de concurrence
• 6 à 12 titres notés, titres A/B, description avec chapitres valides, tags ≤ 500 caractères, 3 à 5 hashtags
• Carte dans YouTube Studio, pilote automatique à la mise en ligne, suggestions de tags
• Contrôle des règles YouTube avant publication
• Votre abonnement Gemini (sans clé) ou l’API Gemini
• Interface anglais / français / arabe, thème clair et sombre — aucune donnée sur nos serveurs

## Single purpose (dashboard field)
Help YouTube music creators write and insert SEO metadata (titles, description with chapters, tags, hashtags) for their videos, based on an AI listening analysis of the song and real search data.

## Permission justifications
| Permission | Justification |
|---|---|
| storage, unlimitedStorage | Stores settings, channel profiles, analyses history and imported Keyword Planner volumes locally. Analyses of long videos can exceed the default quota. |
| sidePanel | The main interface (analysis report, keywords, competitors, trends, history) is a side panel. |
| scripting | Re-injects the content scripts into YouTube / Studio tabs that were already open when the extension is installed or updated, so the user does not have to reload them. |
| clipboardWrite | “Copy” buttons for titles, description, tags, hashtags and the manual-mode prompt. |
| Host: studio.youtube.com | Reads the video being edited (title, description, tags, chosen file) and inserts the accepted proposals. |
| Host: www.youtube.com | Analysis card on video pages; oEmbed check whether a video is public. |
| Host: gemini.google.com | Subscription mode: types the request, attaches the audio and reads Gemini’s answer in the user’s own session. |
| Host: generativelanguage.googleapis.com | API mode: Gemini API calls with the user’s own key. |
| Host: www.googleapis.com | YouTube Data API calls with the user’s own key (competition, statistics, trends). |
| Host: suggestqueries.google.com | Real YouTube search suggestions for keyword research. |

Remote code: **No** — all code is in the package.

## Data usage disclosures (dashboard checkboxes)
- Collects: **Website content** (video title/description/tags on YouTube Studio, processed locally and sent to Google Gemini at the user’s request). Nothing else.
- ✔ Not sold to third parties · ✔ Not used for purposes unrelated to the single purpose · ✔ Not used for creditworthiness or lending.
- Privacy policy URL: host `docs/privacy.html` (e.g. on GitHub Pages or your website) and paste its public URL.

## Screenshots (1280×800 or 640×400)
1. YouTube Studio card with scored titles (light) — `2b-studio-card.png`
2. Side panel full report — `3-panel.png`
3. Keyword research with Keyword Planner volumes — `4-keywords.png`
4. Arabic / dark mode — `7-panel-ar-dark.png`, `9-studio-card-ar.png`
5. Settings onboarding — `1-options.png`
Generate them with `SHOTS=./shots node tests/e2e/run.mjs`, then crop to 1280×800.

## Review notes for Google (dashboard “Notes for reviewer”)
Test account not required. Install, open https://studio.youtube.com with any channel, upload a short audio/video file: the TubePilot card appears under the title. Subscription mode requires being signed in at gemini.google.com; API mode requires a Gemini API key (free at aistudio.google.com/apikey).
