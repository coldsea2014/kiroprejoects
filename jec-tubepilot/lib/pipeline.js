// JEC TubePilot — chaîne complète : média → écoute Gemini → recherches YouTube réelles → concurrents → pack SEO
import { getSettings, setSettings, pickProfile, profileLanguages, savePack, getPack } from './storage.js';
import * as G from './gemini.js';
import { research, competition } from './keywords.js';
import { youtubeTrends, webTrends } from './trends.js';
import { analysisPrompt, seoPrompt, hooksPrompt, webAnalysisPrompt, webSeoPrompt, webSinglePrompt, jsonFormat, ANALYSIS_SCHEMA, SEO_SCHEMA, HOOKS_SCHEMA } from './prompts.js';
import { isPublic } from './ytapi.js';
import './format.js';
import './policy.js';
import './seo.js';
import './postprocess.js';

const F = globalThis.TPF, S = globalThis.TPSeo;

export const STEPS = [
  { id: 'prepare', label: 'Préparation du média' },
  { id: 'upload', label: 'Envoi sécurisé à Gemini' },
  { id: 'processing', label: 'Traitement par Google' },
  { id: 'gemini', label: 'Ouverture de Gemini' },
  { id: 'analyze', label: 'Gemini écoute et regarde' },
  { id: 'keywords', label: 'Recherches YouTube réelles' },
  { id: 'trends', label: 'Tendances du moment' },
  { id: 'competition', label: 'Analyse des concurrents' },
  { id: 'seo', label: 'Rédaction SEO' },
  { id: 'done', label: 'Terminé' }
];

// Choisit automatiquement les modèles si l'utilisateur ne l'a pas fait
export async function ensureModels(settings) {
  if (settings.modelMain && settings.modelFast) return settings;
  if (!settings.geminiKey) return settings;
  const models = await G.listModels(settings.geminiKey);
  const r = G.rankModels(models);
  return setSettings({
    models: r.all.map((m) => ({ id: m.id, label: m.label })),
    modelMain: settings.modelMain || r.pro || r.flash || r.all[0]?.id || '',
    modelFast: settings.modelFast || r.flash || r.lite || r.pro || r.all[0]?.id || ''
  });
}

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
  const hl = String(analysis?.search_language || analysis?.language_code || langs[0] || 'fr').slice(0, 2).toLowerCase();
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

// Tendances YouTube (pays du style) + web, en parallèle ; une erreur n'arrête jamais la génération
async function gatherTrends({ settings, analysis, profile, kw, useWeb, signal, warn }) {
  const out = { youtube: null, web: null };
  const m = analysis?.music || {};
  const jobs = [];
  if (settings.ytKey && kw.locale.gl) {
    jobs.push(youtubeTrends(kw.locale.gl).then((r) => { out.youtube = r; }).catch((e) => warn('Tendances YouTube : ' + e.message)));
  }
  if (useWeb && (m.primary_genre || profile.genre)) {
    jobs.push(webTrends({
      key: settings.geminiKey,
      model: settings.modelFast || settings.modelMain,
      genre: [m.primary_genre || profile.genre, m.fusion].filter(Boolean).join(' / '),
      countries: kw.locale.countries,
      language: kw.locale.hl,
      terms: (m.genre_search_terms || []).slice(0, 4),
      signal
    }).then((r) => { out.web = r; }).catch((e) => warn('Tendances web : ' + e.message)));
  }
  await Promise.all(jobs);
  return out.youtube || out.web ? out : null;
}

/* ---------- Chaîne complète ---------- */
// input : { file } (fichier local) | { youtubeUrl } (vidéo publique) | rien (mode express)
// Analyse par l'API Gemini (clé AI Studio) : envoi du fichier ou du lien, réponse en JSON imposé
async function apiAnalyze({ file, youtubeUrl, ctx, settings, options, emit, signal, usage }) {
  const key = settings.geminiKey;
  const model = options.model || settings.modelMain;
  let part, media = null, uploaded = null;
  if (file) {
    const { prepare } = await import('./media.js');
    emit('prepare');
    const prep = await prepare(file, { mode: options.mediaMode || settings.mediaMode, onStep: () => emit('prepare', { detail: 'Extraction de l\'audio sur votre ordinateur…' }) });
    ctx.duration = ctx.duration || Math.round(prep.info.duration);
    if (ctx.isShort === undefined) ctx.isShort = prep.info.height > prep.info.width && prep.info.duration <= 180;
    if (prep.bpm) ctx.localBpm = prep.bpm.bpm;
    media = { kind: prep.kind, mime: prep.mime, size: prep.blob.size, duration: prep.info.duration, bpm: prep.bpm, fileName: file.name };
    emit('upload', { pct: 0, detail: `${prep.kind === 'audio' ? 'Audio' : 'Vidéo'} · ${(prep.blob.size / 1048576).toFixed(1)} Mo` });
    uploaded = await G.uploadFile({ key, blob: prep.blob, mimeType: prep.mime, displayName: prep.displayName, onProgress: (p) => emit('upload', { pct: p }), signal });
    emit('processing');
    uploaded = await G.waitActive(key, uploaded, { signal, onTick: (ms) => emit('processing', { detail: `${Math.round(ms / 1000)} s` }) });
    part = { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType || prep.mime } };
  } else {
    part = { fileData: { fileUri: youtubeUrl } };
    media = { kind: 'youtube', url: youtubeUrl };
  }
  emit('analyze', { detail: model });
  const { system, text } = analysisPrompt(ctx);
  const long = (ctx.duration || 0) > 20 * 60 && media.kind !== 'audio';
  try {
    const r = await G.generate({
      key, model, parts: [part, { text }], system, schema: ANALYSIS_SCHEMA, temperature: 0.3,
      mediaResolution: long ? 'MEDIA_RESOLUTION_LOW' : undefined, signal, timeoutMs: 600000,
      onRetry: (e) => emit('analyze', { detail: e.message })
    });
    if (!r.json || typeof r.json !== 'object') throw new G.GeminiError('Gemini n\'a pas renvoyé d\'analyse lisible. Réessayez.', { reason: 'json' });
    usage.analysis = r.usage;
    return { analysis: r.json, media, model };
  } finally {
    if (uploaded && settings.deleteFiles) G.deleteFile(key, uploaded.name);
  }
}

// Audio de la vidéo pour la conversation Gemini (mode abonnement)
async function chatAudio(file, ctx, emit) {
  const { prepareChatAudio } = await import('./media.js');
  emit('prepare', { detail: 'Extraction de l\'audio sur votre ordinateur…' });
  const a = await prepareChatAudio(file);
  ctx.duration = ctx.duration || Math.round(a.info.duration || 0);
  if (ctx.isShort === undefined && a.info.width) ctx.isShort = a.info.height > a.info.width && a.info.duration <= 180;
  if (a.bpm) ctx.localBpm = a.bpm.bpm;
  return a;
}

// Analyse dans gemini.google.com (votre abonnement) : lien si la vidéo est publique, sinon l'audio joint
async function webAnalyze({ file, youtubeUrl, raw, ctx, settings, emit, signal, warns, sessionRef }) {
  const W = await import('./gemini-web.js');
  let link = youtubeUrl || '';
  if (!link && raw.videoId && !file) {
    emit('prepare', { detail: 'La vidéo est-elle publique ?' });
    if (await isPublic(raw.videoId)) link = 'https://www.youtube.com/watch?v=' + raw.videoId;
  }
  let audio = null;
  if (!link && file) audio = await chatAudio(file, ctx, emit);
  if (!link && !audio) {
    warns.push('Vidéo privée et fichier non capté : SEO écrit sans écoute. Choisissez le fichier de la vidéo pour que Gemini l\'écoute.');
    return { analysis: null, media: null };
  }
  emit('gemini', { detail: 'Ouverture de Gemini (votre abonnement)' });
  sessionRef.s = sessionRef.s || await W.openSession({ url: settings.geminiUrl, mode: settings.geminiWindow });
  const onStatus = (m) => emit('analyze', { detail: m.text || '' });
  emit('analyze', { detail: link ? 'Gemini ouvre le lien YouTube' : 'Gemini écoute l\'audio joint' });
  let r = await W.ask(sessionRef.s, { prompt: webAnalysisPrompt(ctx, { link }), attachment: audio?.blob, attachName: audio?.name, keys: ['music', 'timeline'], signal, onStatus });
  if (r.error && link && file) {
    // lien refusé par Gemini : l'audio est joint dans la même conversation
    audio = await chatAudio(file, ctx, emit);
    emit('analyze', { detail: 'Lien refusé : Gemini écoute l\'audio joint' });
    r = await W.ask(sessionRef.s, { prompt: webAnalysisPrompt(ctx, {}), attachment: audio.blob, attachName: audio.name, keys: ['music', 'timeline'], signal, onStatus });
  }
  if (r.error) {
    warns.push(`Gemini n'a pas pu accéder à la vidéo (${r.error}) : SEO écrit sans écoute.${link ? ' Pour une vidéo privée, choisissez son fichier.' : ''}`);
    return { analysis: null, media: null };
  }
  if (!r.obj) throw new W.GeminiWebError('Réponse de Gemini illisible. Réessayez (ou choisissez un autre modèle dans Gemini).', 'json');
  if (r.cut) warns.push('Réponse d\'écoute de Gemini coupée : certaines informations peuvent manquer.');
  const media = audio ? { kind: 'audio', mime: 'audio/wav', size: audio.blob.size, duration: audio.info.duration, bpm: audio.bpm, fileName: file?.name || '' } : { kind: 'youtube', url: link };
  return { analysis: r.obj, media };
}

/* ---------- Chaîne complète ---------- */
// input : { file } (fichier local) | { youtubeUrl } (vidéo publique) | rien (mode express)
export async function run({ file = null, youtubeUrl = '', ctx: raw = {}, options = {}, onProgress, signal } = {}) {
  let settings = await getSettings();
  const web = (options.engine || settings.aiEngine) !== 'api';
  if (!web) {
    if (!settings.geminiKey) throw new G.GeminiError('Mode API : ajoutez votre clé Gemini (aistudio.google.com/apikey), ou choisissez « Gemini Pro (mon abonnement) » dans les réglages.', { reason: 'key' });
    settings = await ensureModels(settings);
  }
  const profile = (raw.profileId && settings.profiles.find((p) => p.id === raw.profileId)) || pickProfile(settings, raw.channelId);
  const ctx = {
    ...raw,
    profile,
    cleanTitle: raw.cleanTitle ?? F.cleanFileName(raw.fileName),
    titleCount: settings.titleCount,
    transcribeLyrics: options.transcribeLyrics ?? settings.transcribeLyrics
  };
  const seoModel = web ? 'Gemini (abonnement)' : options.seoModel || settings.modelMain || settings.modelFast;
  const emit = (step, extra = {}) => onProgress?.({ step, ...extra });
  const packKey = raw.packKey || packKeyFor({ videoId: raw.videoId, file, youtubeUrl });
  const aliases = F.uniq([packKey, raw.videoId ? 'vid:' + raw.videoId : '', ...(raw.aliases || [])].filter(Boolean));
  const usage = {};
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
    if (web && listen && (options.steps || settings.geminiSteps) === 1 && (file || youtubeUrl)) {
      // une seule demande : écoute + SEO
      const W = await import('./gemini-web.js');
      let link = youtubeUrl;
      if (!link && raw.videoId && !file && await isPublic(raw.videoId)) link = 'https://www.youtube.com/watch?v=' + raw.videoId;
      const audio = !link && file ? await chatAudio(file, ctx, emit) : null;
      emit('keywords');
      const kw0 = await gatherKeywords(ctx, null, profile, { deep: false });
      emit('gemini', { detail: 'Ouverture de Gemini (votre abonnement)' });
      sessionRef.s = await W.openSession({ url: settings.geminiUrl, mode: settings.geminiWindow });
      emit('analyze', { detail: 'Écoute + SEO en une seule demande' });
      const r = await W.ask(sessionRef.s, { prompt: webSinglePrompt(ctx, { link, kwData: kw0 }), attachment: audio?.blob, attachName: audio?.name, keys: ['analysis', 'seo'], signal, onStatus: (m) => emit('analyze', { detail: m.text || '' }) });
      if (r.error || !r.obj) throw new W.GeminiWebError(r.error ? `Gemini n'a pas pu accéder à la vidéo (${r.error}).` : 'Réponse de Gemini illisible. Réessayez.', 'json');
      analysis = r.obj.analysis || null;
      seoJson = r.obj.seo || null;
      media = audio ? { kind: 'audio', size: audio.blob.size, duration: audio.info.duration, bpm: audio.bpm, fileName: file?.name || '' } : { kind: 'youtube', url: link };
      analysisModel = 'Gemini (abonnement)';
    } else if (listen && (file || youtubeUrl || (web && raw.videoId))) {
      const r = web
        ? await webAnalyze({ file, youtubeUrl, raw, ctx, settings, emit, signal, warns, sessionRef })
        : await apiAnalyze({ file, youtubeUrl, ctx, settings, options, emit, signal, usage });
      analysis = r.analysis;
      media = r.media;
      analysisModel = web ? 'Gemini (abonnement)' : r.model;
    }
    if (analysis) ctx.duration = ctx.duration || Math.round(analysis.duration_seconds || 0);
    if (analysis?.is_cover) ctx.isCover = true;

    emit('keywords');
    const kw = await gatherKeywords(ctx, analysis, profile, { deep: options.deepKeywords !== false, onProgress: (p) => emit('keywords', { pct: p }) });

    emit('trends', { detail: kw.locale.gl ? `pays : ${kw.locale.countries.join(', ')}` : '' });
    const trends = await gatherTrends({
      settings, analysis, profile, kw, signal,
      // en mode abonnement, Gemini cherche lui-même les tendances sur Google dans la conversation
      useWeb: !web && (options.webTrends ?? settings.webTrends),
      warn: (w) => { warns.push(w); emit('trends', { warn: w }); }
    });

    // concurrence : les 2 meilleurs candidats sont comparés, on garde celui qui a le meilleur score
    let comp = null;
    const wantComp = (options.competitors ?? settings.competitorLookup) && settings.ytKey && kw.candidates.length;
    if (wantComp) {
      const music = /music/.test(analysis?.content_type || '') || isMusicProfile(profile);
      const results = [];
      for (const cand of kw.candidates.slice(0, 2)) {
        emit('competition', { detail: `« ${cand} »` });
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
      emit('seo', { detail: web ? 'Gemini rédige dans la même conversation' : seoModel });
      const sctx = { ...ctx, keyword: ctx.keyword || '' };
      if (web) {
        const W = await import('./gemini-web.js');
        if (!sessionRef.s) { emit('gemini', { detail: 'Ouverture de Gemini (votre abonnement)' }); sessionRef.s = await W.openSession({ url: settings.geminiUrl, mode: settings.geminiWindow }); }
        const r = await W.ask(sessionRef.s, { prompt: webSeoPrompt(sctx, analysis, kw, comp, trends), keys: ['titles', 'tags'], signal, onStatus: (m) => emit('seo', { detail: m.text || '' }) });
        if (!r.obj || !Array.isArray(r.obj.titles)) throw new W.GeminiWebError('Gemini n\'a pas renvoyé de titres lisibles. Réessayez.', 'json');
        if (r.cut) warns.push('Réponse SEO de Gemini coupée : vérifiez la description.');
        seoJson = r.obj;
      } else {
        const { system, text } = seoPrompt(sctx, analysis, kw, comp, trends);
        const r = await G.generate({ key: settings.geminiKey, model: seoModel, parts: [{ text }], system, schema: SEO_SCHEMA, temperature: 0.85, signal, timeoutMs: 300000, onRetry: (e) => emit('seo', { detail: e.message }) });
        if (!r.json || !Array.isArray(r.json.titles)) throw new G.GeminiError('Gemini n\'a pas renvoyé de titres. Réessayez.', { reason: 'json' });
        usage.seo = r.usage;
        seoJson = r.json;
      }
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
      models: { analysis: analysis ? analysisModel : '', seo: seoModel, engine: web ? 'web' : 'api' },
      usage
    });
    await savePack(pack);
    emit('done');
    succeeded = true;
    return pack;
  } finally {
    // succès : Gemini se ferme ; échec après que Gemini vous a été montré : il reste ouvert pour que vous voyiez pourquoi
    if (sessionRef.s && settings.geminiClose !== false && (succeeded || !sessionRef.s.shown)) {
      const W = await import('./gemini-web.js');
      W.closeSession(sessionRef.s);
    }
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

// Formules d'accroche des titres concurrents + idées originales (modèle rapide)
export async function analyzeHooks(titles, { topic = '', profileId } = {}) {
  let settings = await getSettings();
  const profile = (profileId && settings.profiles.find((p) => p.id === profileId)) || pickProfile(settings);
  const { system, text } = hooksPrompt(titles, { profile, topic });
  let json;
  if (settings.aiEngine !== 'api') {
    // mode abonnement : la demande passe par gemini.google.com
    const W = await import('./gemini-web.js');
    const s = await W.openSession({ url: settings.geminiUrl, mode: settings.geminiWindow });
    try {
      const r = await W.ask(s, { prompt: `${system}\n\n${text}\n\n${jsonFormat(HOOKS_SCHEMA)}`, keys: ['formulas', 'title_ideas'] });
      json = r.obj;
    } finally { if (settings.geminiClose !== false) W.closeSession(s); }
  } else {
    settings = await ensureModels(settings);
    const r = await G.generate({ key: settings.geminiKey, model: settings.modelFast || settings.modelMain, parts: [{ text }], system, schema: HOOKS_SCHEMA, temperature: 0.8 });
    json = r.json;
  }
  if (!json) throw new G.GeminiError('Réponse illisible, réessayez.');
  const ideas = (json.title_ideas || []).map((t) => ({ ...t, score: S.scoreTitle(t.text, { keyword: topic }).score }));
  return { formulas: [], power_words: [], recommendations: [], ...json, title_ideas: ideas.sort((a, b) => b.score - a.score) };
}
