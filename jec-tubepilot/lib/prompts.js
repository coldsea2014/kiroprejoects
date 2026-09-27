// TubePilot — prompts and JSON schemas sent to Gemini (audio/video analysis, SEO pack, competitor hooks)
// Prompts are written in English (Gemini follows English instructions best). Metadata (titles, tags, description)
// is written in the AUDIENCE's language and dialect; explanatory fields follow the TubePilot interface language.
import './format.js';
import './policy.js';

const F = globalThis.TPF, P = globalThis.TPPolicy;
// language of explanatory fields = interface language (English, French or Arabic)
const EXPL = () => globalThis.TPI18n?.englishName?.() || 'English';

/* ---------- Schemas (OpenAPI subset of the Gemini API) ---------- */
const S = (type, extra = {}) => ({ type, ...extra });
const STR = (description) => S('STRING', description ? { description } : {});
const NUM = (description) => S('NUMBER', description ? { description } : {});
const INT = (description) => S('INTEGER', description ? { description } : {});
const BOOL = (description) => S('BOOLEAN', description ? { description } : {});
const ARR = (items, description) => S('ARRAY', { items, ...(description ? { description } : {}) });
const OBJ = (properties, required = Object.keys(properties)) => S('OBJECT', { properties, required, propertyOrdering: Object.keys(properties) });

export const ANALYSIS_SCHEMA = OBJ({
  content_type: S('STRING', { enum: ['music', 'music_compilation', 'talk', 'tutorial', 'vlog', 'gaming', 'other'] }),
  summary: STR('2-3 sentences (explanation language): what the video really contains'),
  language: STR('language and dialect heard (e.g. "Arabic — Kuwaiti dialect")'),
  language_code: STR('ISO 639-1 code of the main language'),
  dialect: STR('precise dialect (e.g. Saudi Najdi, Kuwaiti, Iraqi, Yemeni, Moroccan Darija, Egyptian) or empty'),
  language_evidence: STR('words heard that prove the language / dialect'),
  target_countries: ARR(STR(), 'ISO 3166 two-letter country codes of the main audience of THIS style, most important first (e.g. ["SA","KW","AE"])'),
  search_language: STR('two-letter language code this audience types its YouTube searches in'),
  is_cover: BOOL('true only if this is a cover of an existing song you recognise with certainty'),
  cover_original: STR('"title — original performer" if certainly a cover, else empty'),
  music: OBJ({
    primary_genre: STR('precise main style (e.g. khaliji samri, sheilat, Iraqi rap, drill, Moroccan chaabi, Yemeni sana\'ani, RnB, swing jazz)'),
    subgenres: ARR(STR()),
    fusion: STR('precisely named fusion (e.g. "khaliji × trap", "jazz × chaabi") or empty'),
    regional_style: STR('region of the STYLE based on musical evidence (e.g. Gulf, Iraq, Yemen, Morocco, international)'),
    genre_confidence: NUM('0 to 1'),
    genre_evidence: STR('evidence heard: rhythm, percussion, instruments, scale, voice, dialect'),
    rhythm_candidates: ARR(OBJ({ name: STR('candidate style / rhythm'), confidence: NUM('0 to 1'), evidence: STR('what supports or contradicts it') }), '2 to 4 candidates examined, most likely first'),
    bpm: NUM('tempo counted over several bars (beats per minute)'),
    time_signature: STR('e.g. 4/4, 6/8, 12/8, 9/8'),
    pulse: STR('straight, triplet/compound, swing, aksak (irregular) or half-time'),
    rhythm_pattern: STR('named rhythmic cycle (e.g. samri, khabiti, adani, choubi, maqsum, saidi, 6/8 chaabi, dembow, boom bap, trap, drill, swing)'),
    percussion: ARR(STR(), 'percussion heard (darbuka, riq, tabl, mirwas, bendir, qraqeb, handclaps, 808, drum kit…)'),
    key: STR('key (e.g. A minor) if audible'),
    scale_or_maqam: STR('scale or maqam (e.g. Bayati, Hijaz, Saba, Rast, Nahawand, Kurd, Sikah, Ajam, pentatonic, blues)'),
    mood: ARR(STR()),
    energy: INT('1 (calm) to 10 (very energetic)'),
    instruments: ARR(STR()),
    vocals: STR('voice type (male, female, duet, choir, instrumental), technique (mawwal, melismas, rap flow), effects (autotune…)'),
    production: STR('production quality / style'),
    hook_line: STR('the sung line that repeats the most (chorus), in its original language and script'),
    hook_start: NUM('second where the chorus first starts'),
    song_title_guess: STR('most likely song title (often the chorus line)'),
    lyrics_theme: STR('theme of the lyrics (explanation language)'),
    lyrics: STR('lyrics transcription if requested, else empty'),
    listening_moments: ARR(STR(), 'listening moments (night drive, wedding, jalsa, workout…)'),
    genre_search_terms: ARR(STR(), 'how THIS audience names this style in YouTube search, original script + Latin script (e.g. "اغاني خليجية", "شيلات", "راب عراقي", "iraqi rap", "طرب يمني")'),
    similar_styles: ARR(STR(), 'related styles (never artist names)')
  }, ['primary_genre', 'rhythm_candidates', 'mood', 'energy', 'instruments', 'vocals', 'hook_line', 'genre_search_terms']),
  timeline: ARR(OBJ({ start: NUM('seconds'), end: NUM('seconds'), label: STR('short label in the song language'), kind: STR('intro, verse, pre-chorus, chorus, bridge, drop, solo, mawwal, outro, topic, track…') }, ['start', 'label', 'kind']), 'timestamped structure of the WHOLE video'),
  highlights: ARR(OBJ({ start: NUM('seconds'), end: NUM('seconds'), label: STR('short, catchy label in the song language'), kind: STR('chorus, drop, climax, solo, beat switch, vocal run, emotional moment, dance'), why: STR('why it is one of the best moments (explanation language)') }, ['start', 'label', 'kind', 'why']), '2 to 5 BEST moments of the video'),
  tracks: ARR(OBJ({ start: NUM(), title: STR() }), 'for a compilation / mix: start of each track'),
  best_short: OBJ({ start: NUM(), end: NUM(), reason: STR() }),
  thumbnail_moment: NUM('second of the strongest frame for a thumbnail'),
  visual: OBJ({ description: STR(), colors: ARR(STR()), on_screen_text: STR(), people: STR('people visible, without identifying them') }, ['description']),
  audience: STR('target audience and what they feel (explanation language)'),
  search_queries: ARR(STR(), '10 to 15 searches this audience really types on YouTube to find THIS song, in its dialect + Latin script if useful'),
  topics: ARR(STR()),
  duration_seconds: NUM(),
  confidence: NUM('0 to 1: overall confidence of the analysis'),
  uncertain: ARR(STR(), 'uncertain points (explanation language)')
}, ['content_type', 'summary', 'language', 'language_code', 'target_countries', 'music', 'timeline', 'highlights', 'search_queries', 'confidence']);

export const SEO_SCHEMA = OBJ({
  main_keyword: STR('main keyword: the real search with the highest demand that is ALSO relevant'),
  secondary_keywords: ARR(STR(), '5 to 10 secondary real searches'),
  keyword_strategy: STR('1-2 sentences (explanation language): why these keywords, target countries and language'),
  audience_insight: STR('audience psychology in 1-2 sentences (explanation language)'),
  titles: ARR(OBJ({ text: STR(), hook_type: STR('curiosity, emotion, direct address, share trigger, contrast, listening moment, question, pure keyword…'), angle: STR('why this title will work (explanation language, short)') }, ['text', 'hook_type'])),
  ab_titles: ARR(STR(), '3 very different titles for YouTube "Test & compare"'),
  description_intro: STR('first 2 lines: hook + main keyword, natural'),
  description_body: STR('description body (without chapters or hashtags)'),
  lyrics_section: STR('chorus excerpt (channel-owned lyrics only) or empty'),
  cta: STR('call to action: subscribe, comment, share'),
  chapters: ARR(OBJ({ start: NUM('seconds'), label: STR() }), 'chapters in the video language'),
  tags: ARR(STR(), '25 to 40 tags ordered by importance'),
  hashtags: ARR(STR(), '3 to 5 hashtags: song title, style, 1-2 relevant trends'),
  pinned_comment: STR('question that makes people comment + pointer to the best moment (mm:ss timestamp)'),
  thumbnail: OBJ({ texts: ARR(STR(), '3 thumbnail texts of 2 to 4 words'), concept: STR(), prompt: STR('AI image prompt (English), no celebrity face or logo') }),
  short: OBJ({ title: STR(), description: STR() }),
  compliance_notes: ARR(STR(), 'YouTube policy points to check (explanation language)'),
  trends_found: OBJ({ keywords: ARR(STR()), hashtags: ARR(STR()), notes: STR() }, [])
}, ['main_keyword', 'titles', 'ab_titles', 'description_intro', 'description_body', 'cta', 'tags', 'hashtags', 'pinned_comment', 'thumbnail']);

export const HOOKS_SCHEMA = OBJ({
  formulas: ARR(OBJ({ name: STR(), template: STR(), example: STR(), why: STR() }, ['name', 'template', 'why'])),
  power_words: ARR(STR()),
  emoji_usage: STR(),
  ideal_length: STR(),
  recommendations: ARR(STR()),
  title_ideas: ARR(OBJ({ text: STR(), hook_type: STR() }, ['text', 'hook_type']))
});

export const TRENDS_SCHEMA = OBJ({
  keywords: ARR(STR(), 'searches / phrases rising right now for this style and these countries'),
  hashtags: ARR(STR(), 'hashtags circulating right now (YouTube, TikTok, Instagram)'),
  title_patterns: ARR(STR(), 'title formulas working right now'),
  notes: STR('summary')
});

/* ---------- World styles & rhythms guide ---------- */
export const WORLD_MUSIC_GUIDE = `WORLD STYLES & RHYTHMS GUIDE — compare with what you HEAR; the channel publishes EVERY style, never infer the style from the channel name or profile:
• Gulf / khaliji (Saudi Arabia, Kuwait, UAE, Qatar, Bahrain, Oman): samri (slow, compound meter, group handclaps), khabiti, adani (swaying, Yemeni origin), bandari (fast, 6/8, Iranian influence), liwa; percussion mirwas (small two-headed drum), tabl, hands; oud, qanun, strings; dialect "وش", "ابي", "شلونك".
  – Sheilat (شيلات): chanted singing, choirs, often without instruments or with vocal effects / bass; arda / ardha: drums, choirs, poetry.
  – Saudi: samri, khabiti, Hijazi mizmar (stick dance, drums), jalsa (acoustic oud session), Saudi pop.
• Yemen: sana'ani (qanbus / turbi oud, ornamented voice), adani, lahji, hadrami, tihami; swaying 6/8 or 2/4 rhythms.
• Iraq: choubi (fast dance), Iraqi dabke, Iraqi maqam (chalghi: santur, joza), Basra khashaba (percussion), mawwal; Iraqi pop; Iraqi rap (راب عراقي: trap / drill, 808, dialect "شكو", "ماكو", "اكو", "هواية").
• Levant (Syria, Lebanon, Palestine, Jordan): dabke (darbuka + tabl, mijwiz / yarghoul), baladi; dialect "شو", "هيك".
• Egypt: maqsum (DUM-tak-tak-DUM-tak), baladi, saidi (mizmar, double DUM), masmoudi, mahraganat (electro shaabi, heavy autotune, 808); dialect "عايز", "كده".
• Maghreb: Moroccan chaabi (fast 6/8, violin, bendir, darbuka, "nayda"), reggada (bouncy 6/8, gasba, bendir), aita (female voices, violin), gnawa (guembri, qraqeb in triplets), ahwach / ahidous (Amazigh, choirs, bendir), Andalusian, malhoun, rai (Oran / Oujda, synth, darbuka), staifi, chaoui, mezoued (Tunisia); Maghreb rap / trap; dialects "bghit / bzaf" (Morocco), "wech / khoya" (Algeria), "barcha / chnowa" (Tunisia).
• Turkey / Kurdish / Iran: aksak 9/8 (karşılama), arabesk, halay / govend, bandari / Persian pop 6/8.
• Africa: afrobeats (syncopated 4/4), amapiano (log drum, ~110-115 BPM), coupé-décalé, afro-trap.
• Urban / Western: boom bap (80-95 BPM, snare on 2 and 4), trap (130-150 BPM or half-time, sliding 808s, hi-hat rolls), drill (~140 BPM, shifted hi-hats, sliding 808s), RnB / neo-soul (7th and 9th chords, melismatic vocals), soul, funk, pop, house / EDM (kick on every beat, 120-128 BPM), techno, lo-fi (swing, vinyl grain), phonk (cowbell), reggaeton / dembow (90-100 BPM), dancehall, reggae (offbeat), latin, bollywood, K-pop.
• Jazz: swing (triplet eighths, walking bass, ride), bossa nova, modal jazz, fusion, oriental jazz (oud / qanun + double bass + drums, maqams).
• Fusions: name them precisely ("khaliji × trap", "Iraqi rap on a drill beat", "jazz × chaabi", "RnB in Darija", "electro sheilat").
RHYTHM METHOD: 1) count beats over several bars → BPM (say if it is half-time); 2) pulse: straight, compound (6/8, 12/8), swing or aksak (9/8, 7/8); 3) placement of low (DUM) and high (tak) strokes; 4) percussion; 5) melodic instruments; 6) scale / maqam; 7) dialect (words heard); 8) 2 to 4 candidate styles with confidence and evidence, then choose. The COUNTRY comes from musical evidence and dialect, not from the profile.`;

/* ---------- Shared rules ---------- */
function rules(ctx) {
  const year = new Date().getFullYear();
  return `YOUTUBE / GOOGLE RULES (mandatory — "Spam, deceptive practices & scams" policy, hashtags, chapters):
- Title ≤ ${P.LIMITS.title} characters (ideal 40-70), main keyword in the first half, no < or >.
- The hook must be TRUE: it only promises what the video contains (no misleading clickbait).
- No ALL-CAPS titles (1-2 capitalised words at most), no "!!!", 0 to 2 emotion emojis.
- ${ctx.profile?.officialArtist ? '"Official" allowed (official artist channel).' : 'Never "official / officiel / رسمي" (this is not an official artist channel).'}
- No real artist, song or brand name that is not IN the video (misleading metadata is forbidden)${ctx.isCover ? ' — exception: credit the original of a cover, without "feat." or "official"' : ''}.
- No "sub4sub", "free download", fake promises, and no raw keyword lists in the description.
- Description ≤ ${P.LIMITS.description} characters; the first 2 lines contain the main keyword naturally.
- Tags: total ≤ ${P.LIMITS.tags} characters, relevant, from most important to most specific, no absent brands or artists.
- Hashtags: 3 to 5, no spaces, relevant (the first 3 are shown above the title).
- Chapters: first at 0 s, at least 3, each ≥ 10 s, ascending order.
- Never copy the lyrics of a song the channel does not own.
- Current year: ${year} (never write a past year as if it were current).`;
}

function profileBlock(p = {}) {
  return `CHANNEL PROFILE:
- Name: ${p.name || '—'}${p.handle ? ` (${p.handle})` : ''}
- Niche: ${p.niche || '—'}${p.genre ? ` · styles published: ${p.genre}` : ''}
${p.artistName ? `- Channel artist name (allowed in titles and tags): ${p.artistName}` : ''}
- Metadata languages: ${p.languages || '—'} (the first is the main title language)
- Audience countries: ${p.country || '—'}
- Audience: ${p.audience || '—'}
- Tone: ${p.tone || '—'}
- AI-generated music / voice: ${p.aiGenerated ? 'yes' : 'no'}
${p.notes ? `- Notes: ${p.notes}` : ''}`.trim();
}

function videoBlock(ctx) {
  const lines = [
    ctx.fileName ? `- File name: "${ctx.fileName}"${ctx.cleanTitle ? ` → probable title: "${ctx.cleanTitle}"` : ''}` : '',
    ctx.duration ? `- Duration: ${F.dur(ctx.duration)} (${Math.round(ctx.duration)} s)` : '',
    ctx.isShort ? '- Format: YouTube Short (vertical)' : '',
    ctx.currentTitle && ![ctx.fileName, String(ctx.fileName || '').replace(/\.[^.]+$/, '')].includes(ctx.currentTitle) ? `- Current title: "${ctx.currentTitle}"` : '',
    ctx.currentDescription ? `- Current description (excerpt): "${ctx.currentDescription.slice(0, 600)}"` : '',
    ctx.currentTags?.length ? `- Current tags: ${ctx.currentTags.join(', ')}` : '',
    ctx.localBpm ? `- Tempo measured on the computer: ~${ctx.localBpm} BPM (check it, it may be doubled or halved)` : '',
    ctx.keyword ? `- Keyword wanted by the creator: "${ctx.keyword}"` : '',
    ctx.notes ? `- Creator notes: ${ctx.notes}` : '',
    ctx.lyrics ? `- Lyrics provided by the creator:\n${ctx.lyrics.slice(0, 4000)}` : ''
  ].filter(Boolean);
  return lines.length ? 'VIDEO:\n' + lines.join('\n') : '';
}

/* ---------- 1. Audio / video analysis ---------- */
export function analysisPrompt(ctx) {
  const system = `You are at once an ethnomusicologist (every music of the world: Gulf, Iraq, Yemen, Levant, Egypt, Maghreb, Africa, Turkey, urban, jazz, RnB…), a sound engineer and a YouTube analyst.
You ANALYSE the attached media: you listen to it and watch it ENTIRELY before answering.
Method: 1) timestamped structure (intro, verses, choruses, bridge, drop, solo, outro — or tracks of a compilation); 2) lyrics heard; 3) the most repeated line = chorus; 4) language and dialect WITH evidence; 5) rhythm following the guide's METHOD; 6) main style, rejected candidates and fusion; 7) the 2 to 5 BEST moments (strongest chorus, drop, build-up, solo, beat switch); 8) audience, countries and the searches they type; 9) best 15-45 s excerpt for a Short; 10) final check.
Invent nothing: if you do not hear a piece of information, leave the field empty and list it in "uncertain". Never identify a real person from their face or voice.
Explanatory fields (summary, evidence, why, audience, uncertain, reason, lyrics_theme) are written in ${EXPL()}; hook_line, song_title_guess, lyrics, labels, genre_search_terms and search_queries stay in the audience's language and script.
Answer only with the requested JSON.`;
  const text = `${WORLD_MUSIC_GUIDE}

${profileBlock(ctx.profile)}

${videoBlock(ctx)}

INSTRUCTIONS:
- Timeline: cover the whole duration, positions in seconds, short catchy labels in the song language (they become the "00:05 Chorus" chapters of the description).
- highlights: the best moments, timestamped to the second (start of the chorus, the drop, the build-up…).
- If it is a compilation / mix: fill "tracks" with the start of each track.
- ${ctx.transcribeLyrics ? 'Transcribe the lyrics heard into "lyrics" (original script, one line per verse).' : 'Leave "lyrics" empty.'}
- target_countries and search_language: from the STYLE and DIALECT heard (e.g. khaliji → SA, KW, AE; Iraqi rap → IQ; chaabi → MA).
- search_queries and genre_search_terms: what this audience really types (dialect, common misspellings, Latin "Arabizi" spelling if used).
- Real duration in seconds in "duration_seconds".`;
  return { system, text };
}

/* ---------- 2. SEO pack ---------- */
const fmtVol = (k) => (k.vol ? ` · ${k.volLabel || F.num(k.vol)}/month (Google Keyword Planner)` : '');

function keywordBlock(kw) {
  if (!kw?.items?.length) return '';
  const where = kw.locale ? ` — language "${kw.locale.hl}", country ${kw.locale.gl || '—'}` : '';
  const hasVol = kw.items.some((k) => k.vol);
  const lines = kw.items.slice(0, 45).map((k) => `  • ${k.kw} — popularity ${k.popularity}/100${fmtVol(k)}`);
  const compared = (kw.compared || []).map((c) => `  • "${c.kw}": score ${c.overall}/100 (demand ${c.demand}, competition ${c.competition})`);
  return `REAL YOUTUBE SEARCHES${where} (search-bar suggestions, estimated popularity${hasVol ? ' blended with real monthly volumes from Google Keyword Planner' : ''}, highest demand first):
${lines.join('\n')}${compared.length ? `\nKEYWORDS COMPARED ON YOUTUBE (views of the top 15 and competitor size):\n${compared.join('\n')}` : ''}${hasVol ? '\n→ Prefer the keywords with the highest REAL volume that truly match this song; use mid-volume long-tail searches for the other titles and tags.' : ''}`;
}

function trendsBlock(t) {
  if (!t) return '';
  const yt = t.youtube;
  const web = t.web;
  const parts = [];
  if (yt?.hashtags?.length || yt?.tags?.length) {
    parts.push(`- YouTube Trending Music (${yt.region}) — hashtags: ${(yt.hashtags || []).slice(0, 20).map((h) => `${h.tag} ×${h.n}`).join(', ') || '—'}`);
    if (yt.tags?.length) parts.push(`- Frequent tags of trending videos: ${yt.tags.slice(0, 20).map((x) => x.tag).join(', ')}`);
    if (yt.words?.length) parts.push(`- Words in trending titles: ${yt.words.slice(0, 15).map((w) => w.k).join(', ')}`);
  }
  if (web && (web.keywords?.length || web.hashtags?.length)) {
    parts.push(`- Current web trends (Google) — searches: ${(web.keywords || []).slice(0, 15).join(', ') || '—'}`);
    parts.push(`- Hashtags circulating: ${(web.hashtags || []).slice(0, 15).join(', ') || '—'}`);
    if (web.title_patterns?.length) parts.push(`- Title formulas of the moment: ${web.title_patterns.slice(0, 6).join(' | ')}`);
  }
  if (!parts.length) return '';
  return `CURRENT TRENDS:\n${parts.join('\n')}\n→ Use a trend ONLY if it truly matches this song (an unrelated hashtag or tag = misleading metadata).`;
}

function competitionBlock(c) {
  if (!c?.videos?.length) return '';
  const vids = c.videos.slice(0, 10).map((v) => `  • "${v.title}" — ${F.num(v.views)} views, ${F.num(v.subs || 0)} subscribers, ${Math.round(v.ageDays)} d`);
  const hooks = (c.patterns?.hooks || []).slice(0, 5).map((h) => `${h.k} ${h.pct}%`).join(', ');
  const tags = (c.tags || []).slice(0, 25).map((t) => t.tag).join(', ');
  return `COMPETITION ON "${c.kw}" (demand ${c.demand}/100, competition ${c.competition}/100):
${vids.join('\n')}
  Most used hooks: ${hooks || '—'} · average length ${c.patterns?.avgLength || '?'} chars
  Competitor tags: ${tags || '—'}
→ Learn from the FORMULAS that work, never copy a title word for word; stand out.`;
}

function seoSystem(ctx) {
  const langs = String(ctx.profile?.languages || '');
  return `You are the best YouTube SEO strategist for ${ctx.profile?.niche || 'music'} channels in every style of the world (khaliji, sheilat, Iraqi rap, Yemeni, Egyptian, Maghrebi, RnB, jazz, afro…): titles with very strong hooks (audience psychology), descriptions rich in natural keywords, tags and hashtags aimed at the MOST SEARCHED queries — while strictly following YouTube / Google policies.
You rely on the REAL DATA provided (YouTube searches, Keyword Planner volumes, competitors, trends) rather than assumptions.
Metadata language: the language of the song's AUDIENCE (dialect heard)${langs ? `; channel languages: ${langs}. The description may add a short part in the other channel languages` : ''}. Explanatory fields (angle, audience_insight, keyword_strategy, compliance_notes, concept) are written in ${EXPL()}.`;
}

export function seoPrompt(ctx, analysis, kw, comp, trends) {
  const system = `${seoSystem(ctx)}
Answer only with the requested JSON.`;
  const text = `${profileBlock(ctx.profile)}

${videoBlock(ctx)}

${analysis ? `LISTENING ANALYSIS OF THE VIDEO (JSON):\n${JSON.stringify(slimAnalysis(analysis))}` : 'No listening: work from the file name, notes and lyrics provided. Invent neither style nor lyrics.'}

${keywordBlock(kw)}

${competitionBlock(comp)}

${trendsBlock(trends)}

${rules(ctx)}

${seoTasks(ctx, analysis)}`;
  return { system, text };
}

function seoTasks(ctx, analysis, { listened = !!analysis } = {}) {
  const n = ctx.titleCount || 8;
  const hook = analysis?.music?.hook_line;
  const artist = ctx.profile?.artistName;
  return `DELIVERABLES (like a professional YouTube SEO expert):
1. main_keyword: among the REAL SEARCHES, the highest-demand one that truly matches this song (song title, style + country, or chorus line). It goes in title #1 (within the first 50 characters), the 1st line of the description, the 1st tag and, if short, a hashtag. secondary_keywords: 5 to 10 other real searches. keyword_strategy: explain the choice.
2. titles: ${n} titles, each with a different lever:
   a) search + emotion: "[title / chorus] [emoji] [style + country]";
   b) direct address: "للي… / À toi qui… / For the one who…";
   c) share trigger: "صيفطها / ابعثها / Send it to…";
   d) listening moment / belonging: jalsa, night drive, wedding, sahra…;
   e) curiosity / open loop (TRUE: what is promised is in the video, e.g. the best moment);
   f) contrast or fusion ("khaliji but trap", "jazz × chaabi");
   g) emotional question;
   h) pure keyword: "[style] [country] ${new Date().getFullYear()} | [title]".
   ${hook ? `At least half start with the chorus line "${hook}" or the song title (that is what people type after hearing it).` : 'If the video is a song, at least half of the titles start with the chorus line or the song title.'}${artist ? ` 2 titles in the format "${artist} - [title] …".` : ''} Write in the audience's dialect; 1-2 emotion emojis at most.
3. ab_titles: 3 very different titles for the YouTube "Test & compare" A/B test.
4. description_intro: 2 strong lines (chorus / title + main keyword + emotional promise). description_body: 150-300 words — story and emotion, style and rhythm, when to listen, natural secondary keywords (never as a list), known credits${ctx.profile?.aiGenerated ? ', transparent mention of AI-assisted creation' : ''}. lyrics_section: short chorus excerpt only if the song belongs to the channel. cta: subscribe + comment + share.
5. chapters: ${listened ? 'the full "00:05 Chorus" timeline: one marker per part (intro, verses, choruses, drop, bridge, outro), short catchy labels in the song language, first at 0, each ≥ 10 s; the best moments are marked to the second.' : 'leave the list EMPTY (without listening, timestamps would be invented).'}
6. tags: 25-40, from most important to most specific: main keyword, song title (original + Latin script), style + country, names of the style in search, spelling variants and common misspellings, long tail, real searches${artist ? ', channel artist name' : ''}. Never an artist or brand absent from the video.
7. hashtags: 3 to 5 — #song title, #style, 1-2 relevant TRENDING hashtags, no spaces. pinned_comment: a question that makes the audience tell their own story + pointer to the best moment ("🔥 01:12").
8. thumbnail: 3 short texts (2-4 words), a concept, an image prompt. short: title + description for a Short cut from the best excerpt.
9. compliance_notes: what the creator must check (AI, cover, rights…).
Check before answering: lengths, main keyword first, truth of the hook, no misleading name, relevant hashtags.`;
}

// Slim analysis for the 2nd request (no full lyrics, to save tokens)
function slimAnalysis(a) {
  const m = a.music || {};
  return {
    content_type: a.content_type, summary: a.summary, language: a.language, language_code: a.language_code, dialect: a.dialect,
    target_countries: a.target_countries, search_language: a.search_language,
    is_cover: a.is_cover, cover_original: a.cover_original,
    music: { primary_genre: m.primary_genre, subgenres: m.subgenres, fusion: m.fusion, regional_style: m.regional_style, genre_search_terms: m.genre_search_terms, pulse: m.pulse, percussion: m.percussion, bpm: m.bpm, time_signature: m.time_signature, key: m.key, scale_or_maqam: m.scale_or_maqam, rhythm_pattern: m.rhythm_pattern, mood: m.mood, energy: m.energy, instruments: m.instruments, vocals: m.vocals, hook_line: m.hook_line, song_title_guess: m.song_title_guess, lyrics_theme: m.lyrics_theme, lyrics_excerpt: String(m.lyrics || '').split('\n').slice(0, 8).join('\n'), listening_moments: m.listening_moments, similar_styles: m.similar_styles },
    timeline: a.timeline, highlights: a.highlights, tracks: a.tracks, best_short: a.best_short, visual: a.visual, audience: a.audience,
    search_queries: a.search_queries, topics: a.topics, duration_seconds: a.duration_seconds
  };
}

/* ---------- Web trends (Google Search through Gemini) ---------- */
export function trendsPrompt({ genre, countries, language, terms }) {
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `Search Google for what is trending RIGHT NOW (${month}) on YouTube, TikTok and Instagram for "${genre}" music${terms?.length ? ` (${terms.join(', ')})` : ''} in ${countries?.length ? countries.join(', ') : 'the Arab world'}, language "${language || 'ar'}".
Give: rising searches / phrases, hashtags that really circulate, and title formulas that work. Only items found in your searches, never invented; no artist names. Write "notes" in ${EXPL()}.
Answer ONLY with a JSON object: {"keywords": [], "hashtags": [], "title_patterns": [], "notes": ""}`;
}

/* ---------- 3. Competitor hooks ---------- */
export function hooksPrompt(titles, ctx = {}) {
  const system = `You are a YouTube analyst specialised in title hooks (psychology, curiosity, emotion). Answer in ${EXPL()}, JSON only. Examples and title ideas stay in the language of the analysed titles.`;
  const text = `${profileBlock(ctx.profile)}

TITLES THAT WORK (views in brackets):
${titles.slice(0, 40).map((t) => `- ${t.title}${t.views ? ` (${F.num(t.views)} views)` : ''}`).join('\n')}

Extract the hook formulas (generic template with [variables]), the power words, emoji usage and ideal length, then propose 8 ORIGINAL title ideas (never copied) for ${ctx.topic ? `"${ctx.topic}"` : 'the channel'}.
${rules(ctx)}`;
  return { system, text };
}

/* ---------- 4. Subscription mode: gemini.google.com driven by the extension ---------- */
// Readable JSON template built from a schema (the Gemini app does not accept an enforced schema)
export function jsonExample(schema) {
  switch (schema.type) {
    case 'OBJECT': return Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, jsonExample(v)]));
    case 'ARRAY': return [jsonExample(schema.items)];
    case 'NUMBER': case 'INTEGER': return 0;
    case 'BOOLEAN': return false;
    default: return schema.enum ? schema.enum.join(' | ') : (schema.description ? `<${schema.description}>` : '');
  }
}

export const jsonFormat = (schema) => `MANDATORY ANSWER FORMAT: ONE single valid JSON code block, with no text before or after, with exactly these keys (the <…> describe what to put):
\`\`\`json
${JSON.stringify(jsonExample(schema), null, 1)}
\`\`\``;

const mediaLine = (link) => (link
  ? `VIDEO TO ANALYZE: ${link}
Open this YouTube video with your YouTube tool, watch it and listen to it ENTIRELY.`
  : 'The attached audio file is the complete soundtrack of the video: listen to it ENTIRELY.');

export function webAnalysisPrompt(ctx, { link = '' } = {}) {
  const a = analysisPrompt(ctx);
  return `${a.system}

${mediaLine(link)}
If you CANNOT access the video or the sound, answer only: {"error": "no_access"}

${a.text}

${jsonFormat(ANALYSIS_SCHEMA)}`;
}

export function webSeoPrompt(ctx, analysis, kw, comp, trends) {
  const s = seoPrompt(ctx, analysis, kw, comp, trends);
  return `${s.system}

${s.text}

TREND RESEARCH: before writing, run a Google search for the hashtags and searches rising THIS MONTH for this style in these countries (YouTube, TikTok, Instagram). Put what you find in "trends_found" and only use what truly matches this song.

${jsonFormat(SEO_SCHEMA)}`;
}

// Single request (analysis + SEO): faster, slightly less precise on keywords
export function webSinglePrompt(ctx, { link = '', kwData = null } = {}) {
  const a = analysisPrompt(ctx);
  return `${a.system}

${mediaLine(link)}
If you CANNOT access the video or the sound, answer only: {"error": "no_access"}

Do TWO things: A) the music and video analysis (key "analysis"); B) the YouTube SEO pack based on this analysis (key "seo").

${seoSystem(ctx)}

${a.text}

${keywordBlock(kwData)}

${rules(ctx)}

TREND RESEARCH: run a Google search for the hashtags and searches rising this month for this style; put them in "seo.trends_found".

PART B — ${seoTasks(ctx, null, { listened: true })}

MANDATORY ANSWER FORMAT: ONE single valid JSON code block, with no text around it:
\`\`\`json
${JSON.stringify({ analysis: jsonExample(ANALYSIS_SCHEMA), seo: jsonExample(SEO_SCHEMA) }, null, 1)}
\`\`\``;
}

/* ---------- 5. Manual mode (copy / paste into gemini.google.com) ---------- */
export function manualPrompt(ctx) {
  const a = analysisPrompt(ctx);
  return `${a.system}

I attached my video (or its audio). Listen to it and watch it entirely, then do TWO things:
A) the music and video analysis (key "analysis");
B) the YouTube SEO pack based on this analysis (key "seo").

${seoSystem(ctx)}

${a.text}

${keywordBlock(ctx.kwData)}

${rules(ctx)}

PART B — ${seoTasks(ctx, null, { listened: true })}

ANSWER FORMAT: ONE single JSON code block, with no text around it:
{
  "analysis": { "content_type": "", "summary": "", "language": "", "language_code": "", "dialect": "", "target_countries": [], "search_language": "", "is_cover": false, "cover_original": "",
    "music": { "primary_genre": "", "subgenres": [], "fusion": "", "regional_style": "", "rhythm_candidates": [{ "name": "", "confidence": 0, "evidence": "" }], "bpm": 0, "time_signature": "", "pulse": "", "rhythm_pattern": "", "percussion": [], "key": "", "scale_or_maqam": "", "mood": [], "energy": 5, "instruments": [], "vocals": "", "hook_line": "", "hook_start": 0, "song_title_guess": "", "lyrics_theme": "", "lyrics": "", "listening_moments": [], "genre_search_terms": [] },
    "timeline": [{ "start": 0, "end": 0, "label": "", "kind": "" }], "highlights": [{ "start": 0, "end": 0, "label": "", "kind": "", "why": "" }], "tracks": [], "best_short": { "start": 0, "end": 0, "reason": "" },
    "visual": { "description": "" }, "audience": "", "search_queries": [], "duration_seconds": 0, "confidence": 0.8, "uncertain": [] },
  "seo": { "main_keyword": "", "secondary_keywords": [], "keyword_strategy": "", "audience_insight": "", "titles": [{ "text": "", "hook_type": "", "angle": "" }], "ab_titles": [],
    "description_intro": "", "description_body": "", "lyrics_section": "", "cta": "", "chapters": [{ "start": 0, "label": "" }],
    "tags": [], "hashtags": [], "pinned_comment": "", "thumbnail": { "texts": [], "concept": "", "prompt": "" }, "short": { "title": "", "description": "" }, "compliance_notes": [] }
}`;
}
