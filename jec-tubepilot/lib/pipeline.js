// TubePilot — chaîne complète : lien public ou audio → écoute par Gemini (votre compte gemini.google.com) → recherches YouTube réelles → concurrents → pack SEO
import { t } from './lang.js';
import { getSettings, pickProfile, profileLanguages, savePack, getPack } from './storage.js';
import * as W from './gemini-web.js';
import { research, competition } from './keywords.js';
import { youtubeTrends } from './trends.js';
import { hooksPrompt, webAnalysisPrompt, webLinkRetryPrompt, webSeoPrompt, webSinglePrompt, jsonFormat, HOOKS_SCHEMA } from './prompts.js';
import { isPublic } from './ytapi.js';
import './format.js';
import './policy.js';
import './seo.js';
import './postprocess.js';

const F = globalThis.TPF, S = globalThis.TPSeo;

export const STEPS = [
  { id: 'prepare', label: 'Preparing media' },
  { id: 'gemini', label: 'Opening Gemini' },
  { id: 'analyze', label: 'Gemini listens and watches' },
  { id: 'keywords', label: 'Real YouTube searches' },
  { id: 'trends', label: 'Current trends' },
  { id: 'competition', label: 'Competitor analysis' },
  { id: 'seo', label: 'SEO writing' },
  { id: 'done', label: 'Done' }
];

const isMusicProfile = (p) => /music|musique|chanson|song|أغاني|اغاني|موسيقى|beat|rap|chaabi|raï|rai/i.test(`${p?.niche || ''} ${p?.genre || ''}`);

export function packKeyFor({ videoId, file, fileName, fileSize, youtubeUrl }) {
  if (file) return `file:${file.name}:${file.size}`;
  if (fileName && fileSize) return `file:${fileName}:${fileSize}`;
  if (videoId) return 'vid:' + videoId;
  if (youtubeUrl) return 'url:' + (youtubeUrl.match(/[\w-]{11}/)?.[0] || youtubeUrl);
  return 'manual:' + Date.now();
}

/* ---------- Mots-clés à partir de l'écoute ---------- */
// Pays et langue de recherche : ceux du STYLE entendu (khaliji → SA, rap irakien → IQ…), sinon ceux du profil
export function searchLocale(analysis, profile) {
  const langs = profileLanguages(profile);
  const countries = (analysis?.target_countries || []).map((c) => String(c || '').trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  const gl = countries[0] || String(profile?.country || '').toUpperCase();
  const hl = String(analysis?.search_language || analysis?.language_code || langs[0] || 'en').slice(0, 2).toLowerCase();
  return { hl, gl, countries: countries.length ? countries : gl ? [gl] : [] };
}

async function gatherKeywords(ctx, analysis, profile, { deep = true, onProgress } = {}) {
  const loc = searchLocale(analysis, profile);
  const primary = { hl: loc.hl, gl: loc.gl };
  const m = analysis?.music || {};
  const seeds = F.uniq([
    ctx.keyword,
    m.song_title_guess,
    ctx.cleanTitle,
    m.hook_line && m.hook_line !== m.song_title_guess ? m.hook_line : '',
    ...(analysis?.search_queries || []).slice(0, 6),
    ...(m.genre_search_terms || []).slice(0, 3),
    !analysis ? profile.genre : ''
  ].map((s) => String(s || '').trim()).filter((s) => s && s.length <= 60)).slice(0, 10);
  // la graine principale est aussi cherchée dans le 2e pays du public (ex. Arabie saoudite puis Koweït)
  const jobs = seeds.map((seed, i) => ({ seed, loc: primary, deep: deep && i < 2 }));
  if (seeds[0] && loc.countries[1]) jobs.push({ seed: seeds[0], loc: { hl: loc.hl, gl: loc.countries[1] }, deep: false });
  const merged = new Map();
  let done = 0;
  await F.pool(jobs, 3, async (job) => {
    try {
      const r = await research(job.seed, { ...job.loc, deep: job.deep });
      r.items.forEach((it) => {
        const k = F.norm(it.kw);
        const cur = merged.get(k);
        if (!cur || cur.popularity < it.popularity) merged.set(k, { ...it, source: job.seed, gl: job.loc.gl });
      });
    } catch (e) { /* suggestions indisponibles : Gemini travaillera sans */ }
    onProgress?.(++done / jobs.length);
  });
  const items = [...merged.values()].sort((a, b) => b.popularity - a.popularity);
  // candidats : les recherches les plus demandées qui restent pertinentes pour CETTE chanson
  const relevant = (kw) => seeds.some((s) => S.similarity(kw, s) >= 0.34 || F.norm(kw).includes(F.norm(s)) || F.norm(s).includes(F.norm(kw)));
  const candidates = [];
  if (ctx.keyword) candidates.push(ctx.keyword);
  for (const it of items) {
    if (candidates.length >= 3) break;
    if (relevant(it.kw) && !candidates.some((c) => S.similarity(c, it.kw) >= 0.6)) candidates.push(it.kw);
  }
  if (!candidates.length && (items[0]?.kw || seeds[0])) candidates.push(items[0]?.kw || seeds[0]);
  return { seed: seeds[0] || '', sources: seeds, items: items.slice(0, 90), best: candidates[0] || '', candidates, locale: { ...primary, countries: loc.countries } };
}

// Tendances YouTube du pays du style (clé YouTube facultative) ; une erreur n'arrête jamais la génération.
// Les tendances web sont cherchées par Gemini lui-même sur Google, dans la conversation.
async function gatherTrends({ settings, kw, warn }) {
  if (!settings.ytKey || !kw.locale.gl) return null;
  try { return { youtube: await youtubeTrends(kw.locale.gl), web: null }; } catch (e) { warn(t('warn.ytTrends', { msg: e.message })); return null; }
}

// Audio de la vidéo pour la conversation Gemini (mode abonnement)
async function chatAudio(file, ctx, emit) {
  const { prepareChatAudio } = await import('./media.js');
  emit('prepare', { detail: t('prog.extracting') });
  const a = await prepareChatAudio(file);
  ctx.duration = ctx.duration || Math.round(a.info.duration || 0);
  if (ctx.isShort === undefined && a.info.width) ctx.isShort = a.info.height > a.info.width && a.info.duration <= 180;
  if (a.bpm) ctx.localBpm = a.bpm.bpm;
  return a;
}

// Analyse dans gemini.google.com (votre abonnement) : lien si la vidéo est publique, sinon l'audio joint
const openGemini = (settings) => W.openSession({ url: settings.geminiUrl, mode: settings.geminiWindow, model: settings.geminiModel });

// lien de la vidéo s'il est public (ou non répertorié) : Gemini l'écoute directement
async function publicLink({ youtubeUrl, raw, file, emit }) {
  if (youtubeUrl) return youtubeUrl;
  if (!raw.videoId || file) return '';
  emit('prepare', { detail: t('prog.checkPublic') });
  return (await isPublic(raw.videoId)) ? 'https://www.youtube.com/watch?v=' + raw.videoId : '';
}

async function webAnalyze({ file, youtubeUrl, raw, ctx, settings, emit, signal, warns, sessionRef }) {
  let link = await publicLink({ youtubeUrl, raw, file, emit });
  let audio = null;
  if (!link && file) audio = await chatAudio(file, ctx, emit);
  if (!link && !audio) {
    warns.push(t('warn.privateNoFile'));
    return { analysis: null, media: null };
  }
  emit('gemini', { detail: t('prog.openingGemini') });
  sessionRef.s = sessionRef.s || await openGemini(settings);
  const onStatus = (m) => emit('analyze', { detail: m.text || '' });
  emit('analyze', { detail: link ? t('prog.viaLink') : t('prog.viaAudio') });
  let r = await W.ask(sessionRef.s, { prompt: webAnalysisPrompt(ctx, { link }), attachment: audio?.blob, attachName: audio?.name, keys: ['music', 'timeline'], signal, onStatus });
  if (r.error && link && !file) {
    // Gemini n'a pas ouvert le lien du premier coup : on le lui redemande dans la même conversation
    emit('analyze', { detail: t('prog.linkRetry') });
    r = await W.ask(sessionRef.s, { prompt: webLinkRetryPrompt(link), keys: ['music', 'timeline'], signal, onStatus });
    if (!r.obj && !r.error) r = { ...r, error: 'no_access' };
  }
  if (r.error && link && file) {
    // lien refusé par Gemini : l'audio est joint dans la même conversation
    audio = await chatAudio(file, ctx, emit);
    emit('analyze', { detail: t('prog.linkRefused') });
    r = await W.ask(sessionRef.s, { prompt: webAnalysisPrompt(ctx, {}), attachment: audio.blob, attachName: audio.name, keys: ['music', 'timeline'], signal, onStatus });
  }
  if (r.error) {
    warns.push(t('warn.noAccess', { why: r.error }) + (link ? ' ' + t('warn.pickFileForPrivate') : ''));
    return { analysis: null, media: null };
  }
  if (!r.obj) throw new W.GeminiWebError(t('err.unreadable'), 'json');
  if (r.cut) warns.push(t('warn.analysisCut'));
  const media = audio ? { kind: 'audio', mime: 'audio/wav', size: audio.blob.size, duration: audio.info.duration, bpm: audio.bpm, fileName: file?.name || '' } : { kind: 'youtube', url: link };
  return { analysis: r.obj, media };
}

/* ---------- Chaîne complète ---------- */
// input : { file } (fichier local) | { youtubeUrl } (vidéo publique) | rien (mode express)
export async function run({ file = null, youtubeUrl = '', ctx: raw = {}, options = {}, onProgress, signal } = {}) {
  const settings = await getSettings();
  const profile = (raw.profileId && settings.profiles.find((p) => p.id === raw.profileId)) || pickProfile(settings, raw.channelId);
  const ctx = {
    ...raw,
    profile,
    cleanTitle: raw.cleanTitle ?? F.cleanFileName(raw.fileName),
    titleCount: settings.titleCount,
    transcribeLyrics: options.transcribeLyrics ?? settings.transcribeLyrics
  };
  const engineName = t('engine.web');
  const emit = (step, extra = {}) => onProgress?.({ step, ...extra });
  const packKey = raw.packKey || packKeyFor({ videoId: raw.videoId, file, youtubeUrl });
  const aliases = F.uniq([packKey, raw.videoId ? 'vid:' + raw.videoId : '', ...(raw.aliases || [])].filter(Boolean));
  const warns = [];
  const sessionRef = { s: null };
  let analysis = null, media = null, analysisModel = '', succeeded = false;

  // écoute déjà faite pour cette vidéo : on la réutilise (régénération SEO sans nouvel envoi)
  const prev = await getPack(...aliases);
  // l'écoute d'une fiche n'est réutilisée que pour le même fichier (jamais celle d'une autre vidéo)
  const sameMedia = !file || !prev?.source?.fileName || (prev.source.fileName === file.name && (!prev.source.fileSize || prev.source.fileSize === file.size));
  if (prev?.analysis && !options.reanalyze && sameMedia) { analysis = prev.analysis; media = prev.media; analysisModel = prev.models?.analysis || ''; ctx.duration = ctx.duration || prev.ctx?.duration; ctx.localBpm = ctx.localBpm || prev.ctx?.localBpm; }

  try {
    let seoJson = null;
    const listen = !analysis && options.mode !== 'express';
    if (listen && (options.steps || settings.geminiSteps) === 1 && (file || youtubeUrl || raw.videoId)) {
      // une seule demande : écoute + SEO
      const link = await publicLink({ youtubeUrl, raw, file, emit });
      const audio = !link && file ? await chatAudio(file, ctx, emit) : null;
      if (link || audio) {
        emit('keywords');
        const kw0 = await gatherKeywords(ctx, null, profile, { deep: false });
        emit('gemini', { detail: t('prog.openingGemini') });
        sessionRef.s = await openGemini(settings);
        emit('analyze', { detail: t('prog.single') });
        const r = await W.ask(sessionRef.s, { prompt: webSinglePrompt(ctx, { link, kwData: kw0 }), attachment: audio?.blob, attachName: audio?.name, keys: ['analysis', 'seo'], signal, onStatus: (m) => emit('analyze', { detail: m.text || '' }) });
        if (r.error || !r.obj) throw new W.GeminiWebError(r.error ? t('warn.noAccess', { why: r.error }) : t('err.unreadable'), 'json');
        analysis = r.obj.analysis || null;
        seoJson = r.obj.seo || null;
        media = audio ? { kind: 'audio', size: audio.blob.size, duration: audio.info.duration, bpm: audio.bpm, fileName: file?.name || '' } : { kind: 'youtube', url: link };
        analysisModel = engineName;
      } else warns.push(t('warn.privateNoFile'));
    } else if (listen && (file || youtubeUrl || raw.videoId)) {
      const r = await webAnalyze({ file, youtubeUrl, raw, ctx, settings, emit, signal, warns, sessionRef });
      analysis = r.analysis;
      media = r.media;
      analysisModel = engineName;
    }
    if (analysis) ctx.duration = ctx.duration || Math.round(analysis.duration_seconds || 0);
    if (analysis?.is_cover) ctx.isCover = true;

    emit('keywords');
    const kw = await gatherKeywords(ctx, analysis, profile, { deep: options.deepKeywords !== false, onProgress: (p) => emit('keywords', { pct: p }) });

    emit('trends', { detail: kw.locale.countries.join(', ') });
    const trends = await gatherTrends({ settings, kw, warn: (w) => { warns.push(w); emit('trends', { warn: w }); } });

    // concurrence : les 2 meilleurs candidats sont comparés, on garde celui qui a le meilleur score
    let comp = null;
    const wantComp = (options.competitors ?? settings.competitorLookup) && settings.ytKey && kw.candidates.length;
    if (wantComp) {
      const music = /music/.test(analysis?.content_type || '') || isMusicProfile(profile);
      const results = [];
      for (const cand of kw.candidates.slice(0, 2)) {
        emit('competition', { detail: cand });
        try {
          results.push(await competition(cand, { regionCode: kw.locale.gl || undefined, relevanceLanguage: kw.locale.hl, videoCategoryId: music ? '10' : undefined }));
        } catch (e) { emit('competition', { warn: e.message }); break; }
      }
      if (results.length) {
        comp = results.reduce((a, b) => (b.overall > a.overall ? b : a));
        kw.compared = results.map((c) => ({ kw: c.kw, overall: c.overall, demand: c.demand, competition: c.competition }));
        if (!ctx.keyword) kw.best = comp.kw;
      }
    }

    if (!seoJson) {
      emit('seo', { detail: t('prog.sameConversation') });
      const sctx = { ...ctx, keyword: ctx.keyword || '' };
      if (!sessionRef.s) { emit('gemini', { detail: t('prog.openingGemini') }); sessionRef.s = await openGemini(settings); }
      const r = await W.ask(sessionRef.s, { prompt: webSeoPrompt(sctx, analysis, kw, comp, trends), keys: ['titles', 'tags'], signal, onStatus: (m) => emit('seo', { detail: m.text || '' }) });
      if (!r.obj || !Array.isArray(r.obj.titles)) throw new W.GeminiWebError(t('err.noTitles'), 'json');
      if (r.cut) warns.push(t('warn.seoCut'));
      seoJson = r.obj;
    }

    // tendances trouvées par Gemini lui-même (recherche Google dans la conversation)
    const found = seoJson.trends_found;
    const allTrends = found && (found.keywords?.length || found.hashtags?.length)
      ? { youtube: trends?.youtube || null, web: trends?.web || { keywords: (found.keywords || []).slice(0, 20), hashtags: (found.hashtags || []).map(globalThis.TPPolicy.normalizeHashtag).filter(Boolean).slice(0, 20), title_patterns: [], notes: found.notes || '', sources: [], grounded: false } }
      : trends;

    const pack = globalThis.TPPost.buildPack({
      key: packKey, aliases,
      source: { fileName: raw.fileName || file?.name || '', videoId: raw.videoId || '', youtubeUrl, fileSize: file?.size || raw.fileSize || 0 },
      ctx, analysis, seo: seoJson, kw, comp, media, trends: allTrends, warnings: warns,
      models: { analysis: analysis ? analysisModel : '', seo: engineName, engine: 'web' }
    });
    await savePack(pack);
    emit('done');
    succeeded = true;
    return pack;
  } finally {
    // succès : Gemini se ferme ; échec après que Gemini vous a été montré : il reste ouvert pour que vous voyiez pourquoi
    if (sessionRef.s && settings.geminiClose !== false && (succeeded || !sessionRef.s.shown)) W.closeSession(sessionRef.s);
  }
}

// Fiche construite à partir d'une réponse collée depuis gemini.google.com (mode abonnement, sans clé)
export async function fromManual({ text, ctx: raw = {} }) {
  const settings = await getSettings();
  const profile = (raw.profileId && settings.profiles.find((p) => p.id === raw.profileId)) || pickProfile(settings, raw.channelId);
  const { analysis, seo } = globalThis.TPPost.parseManual(text);
  const ctx = { ...raw, profile, cleanTitle: F.cleanFileName(raw.fileName) };
  const packKey = raw.packKey || packKeyFor({ videoId: raw.videoId, fileName: raw.fileName, fileSize: raw.fileSize });
  const pack = globalThis.TPPost.buildPack({ key: packKey, aliases: F.uniq([packKey, raw.videoId ? 'vid:' + raw.videoId : ''].filter(Boolean)), source: { fileName: raw.fileName || '', videoId: raw.videoId || '' }, ctx, analysis, seo, models: { analysis: 'gemini.google.com', seo: 'gemini.google.com' } });
  await savePack(pack);
  return pack;
}

// Formules d'accroche des titres concurrents + idées originales (demande envoyée à gemini.google.com)
export async function analyzeHooks(titles, { topic = '', profileId } = {}) {
  const settings = await getSettings();
  const profile = (profileId && settings.profiles.find((p) => p.id === profileId)) || pickProfile(settings);
  const { system, text } = hooksPrompt(titles, { profile, topic });
  const s = await openGemini(settings);
  let json;
  try {
    const r = await W.ask(s, { prompt: `${system}\n\n${text}\n\n${jsonFormat(HOOKS_SCHEMA)}`, keys: ['formulas', 'title_ideas'] });
    json = r.obj;
  } finally { if (settings.geminiClose !== false) W.closeSession(s); }
  if (!json) throw new W.GeminiWebError(t('err.unreadable'), 'json');
  const ideas = (json.title_ideas || []).map((x) => ({ ...x, score: S.scoreTitle(x.text, { keyword: topic }).score }));
  return { formulas: [], power_words: [], recommendations: [], ...json, title_ideas: ideas.sort((a, b) => b.score - a.score) };
}
