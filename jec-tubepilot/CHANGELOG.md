# Changelog

## 5.1.0 — 2026-09
- **Gemini account only**: the Gemini API / AI Studio key mode is removed (no key, no API quota). Old key and model settings are deleted from storage.
- TubePilot selects the **Pro** model in Gemini’s model menu before sending (setting “Gemini model”).
- **Expert master prompt**: YouTube growth strategist + international ethnomusicologist + YouTube/Google SEO specialist + hook copywriter; titles made for YouTube with 1–2 emotion emojis, search-ready first description lines, song timeline with 🔥 best moments, comment to pin.
- Public link refused by Gemini → asked again in the same conversation before falling back.
- **Replace old fields** (default on): the old title, description and tags are deleted and replaced; what you type during the analysis is never overwritten; reminder to click Save on existing videos.
- New **Comment** tab in the Studio card: comment to pin, copy button, link to the video.
- Host permission `generativelanguage.googleapis.com` removed.

## 5.0.0 — 2026-09
- New professional design: design system (tokens, light / dark), SVG icon set, redesigned YouTube Studio card, side panel, settings with onboarding checklist, YouTube watch-page card and Gemini status bar.
- **Fix:** the Studio card no longer overlaps the description on the “Video details” page (placed between the title and the description blocks).
- Interface in **English, French and Arabic** (right-to-left), numbers and dates in the user’s locale.
- **Google Keyword Planner** CSV import (UTF-16 / UTF-8, localized headers, volume ranges): real monthly volumes in keyword tables, blended into the ranking and sent to Gemini.
- Google Trends link for every keyword.
- Prompts rewritten in English; explanations follow the interface language, metadata stays in the audience’s dialect.
- YouTube API data older than 30 days is removed automatically; privacy policy and store texts included.
- Tests: Keyword Planner parser, translation completeness, data retention, card placement, RTL and dark screenshots.

## 4.2.0
- Subscription mode: drives gemini.google.com (Gemini Pro) automatically — no API key, no copy/paste.

## 4.1.0
- World rhythms guide, 00:05 timeline with 🔥 best moments, keywords in the style’s country, trends, keys in the panel.

## 4.0.0
- Gemini listens to the uploaded file, real YouTube searches, competitors, auto-insertion in Studio, policy checks.
