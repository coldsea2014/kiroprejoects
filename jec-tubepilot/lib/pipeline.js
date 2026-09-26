// JEC TubePilot — chaîne complète : média → écoute Gemini → recherches YouTube réelles → concurrents → pack SEO
import { getSettings, setSettings, pickProfile, profileLanguages, savePack, getPack } from './storage.js';
import * as G from './gemini.js';
import { research, competition } from './keywords.js';
import { analysisPrompt, seoPrompt, hooksPrompt, ANALYSIS_SCHEMA, SEO_SCHEMA, HOOKS_SCHEMA } from './prompts.js';
import './format.js';
import './policy.js';
import './seo.js';
import './postprocess.js';

const F = globalThis.TPF, S = globalThis.TPSeo;

export const STEPS = [
  { id: 'prepare', label: 'Préparation du média' },
  { id: 'upload', label: 'Envoi sécurisé à Gemini' },
  { id: 'processing', label: 'Traitement par Google' },
  { id: 'analyze', label: 'Gemini écoute et regarde' },
  { id: 'keywords', label: 'Recherches YouTube réelles' },
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
async function gatherKeywords(ctx, analysis, profile, { deep = true, onProgress } = {}) {
  const langs = profileLanguages(profile);
  const primary = { hl: (analysis?.language_code || langs[0] || 'fr').slice(0, 2), gl: String(profile.country || '').toUpperCase() };
  const seeds = F.uniq([
    ctx.keyword,
    analysis?.music?.song_title_guess,
    ctx.cleanTitle,
    ...(analysis?.search_queries || []).slice(0, 6),
    analysis?.music?.primary_genre && profile.country ? `${analysis.music.primary_genre}` : '',
    profile.genre
  ].map((s) => String(s || '').trim()).filter((s) => s && s.length <= 60)).slice(0, 8);
  const merged = new Map();
  let done = 0;
  await F.pool(seeds, 3, async (seed, i) => {
    try {
      const r = await research(seed, { ...primary, deep: deep && i === 0 });
      r.items.forEach((it) => {
        const k = F.norm(it.kw);
        const cur = merged.get(k);
        if (!cur || cur.popularity < it.popularity) merged.set(k, { ...it, source: seed });
      });
    } catch (e) { /* suggestions indisponibles : Gemini travaillera sans */ }
    onProgress?.(++done / seeds.length);
  });
  const items = [...merged.values()].sort((a, b) => b.popularity - a.popularity);
  // meilleur mot-clé : demandé par l'utilisateur, sinon le plus populaire qui reste pertinent pour la vidéo
  const relevant = (kw) => seeds.some((s) => S.similarity(kw, s) >= 0.34 || F.norm(kw).includes(F.norm(s)) || F.norm(s).includes(F.norm(kw)));
  const best = ctx.keyword || items.find((x) => relevant(x.kw))?.kw || items[0]?.kw || seeds[0] || '';
  return { seed: seeds[0] || '', sources: seeds, items: items.slice(0, 80), best, locale: primary };
}

/* ---------- Chaîne complète ---------- */
// input : { file } (fichier local) | { youtubeUrl } (vidéo publique) | rien (mode express)
export async function run({ file = null, youtubeUrl = '', ctx: raw = {}, options = {}, onProgress, signal } = {}) {
  let settings = await getSettings();
  if (!settings.geminiKey) throw new G.GeminiError('Ajoutez votre clé Gemini dans Réglages (gratuite sur aistudio.google.com/apikey).', { reason: 'key' });
  settings = await ensureModels(settings);
  const profile = (raw.profileId && settings.profiles.find((p) => p.id === raw.profileId)) || pickProfile(settings, raw.channelId);
  const ctx = {
    ...raw,
    profile,
    cleanTitle: raw.cleanTitle ?? F.cleanFileName(raw.fileName),
    titleCount: settings.titleCount,
    transcribeLyrics: options.transcribeLyrics ?? settings.transcribeLyrics
  };
  const key = settings.geminiKey;
  const mainModel = options.model || settings.modelMain;
  const seoModel = options.seoModel || settings.modelMain || settings.modelFast;
  const emit = (step, extra = {}) => onProgress?.({ step, ...extra });
  const packKey = raw.packKey || packKeyFor({ videoId: raw.videoId, file, youtubeUrl });
  const aliases = F.uniq([packKey, raw.videoId ? 'vid:' + raw.videoId : '', ...(raw.aliases || [])].filter(Boolean));
  const usage = {};
  let analysis = null, media = null, uploaded = null;

  // écoute déjà faite pour cette vidéo : on la réutilise (régénération SEO sans nouvel envoi)
  const prev = await getPack(...aliases);
  if (prev?.analysis && !options.reanalyze) { analysis = prev.analysis; media = prev.media; ctx.duration = ctx.duration || prev.ctx?.duration; ctx.localBpm = ctx.localBpm || prev.ctx?.localBpm; }

  if (!analysis && options.mode !== 'express' && (file || youtubeUrl)) {
    let part;
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
    emit('analyze', { detail: mainModel });
    const { system, text } = analysisPrompt(ctx);
    const long = (ctx.duration || 0) > 20 * 60 && media.kind !== 'audio';
    try {
      const r = await G.generate({
        key, model: mainModel, parts: [part, { text }], system, schema: ANALYSIS_SCHEMA, temperature: 0.3,
        mediaResolution: long ? 'MEDIA_RESOLUTION_LOW' : undefined, signal, timeoutMs: 600000,
        onRetry: (e) => emit('analyze', { detail: e.message })
      });
      if (!r.json || typeof r.json !== 'object') throw new G.GeminiError('Gemini n\'a pas renvoyé d\'analyse lisible. Réessayez.', { reason: 'json' });
      analysis = r.json;
      usage.analysis = r.usage;
    } finally {
      if (uploaded && settings.deleteFiles) G.deleteFile(key, uploaded.name);
    }
    ctx.duration = ctx.duration || Math.round(analysis.duration_seconds || 0);
  }
  if (analysis?.is_cover) ctx.isCover = true;

  emit('keywords');
  const kw = await gatherKeywords(ctx, analysis, profile, { deep: options.deepKeywords !== false, onProgress: (p) => emit('keywords', { pct: p }) });

  let comp = null;
  const wantComp = (options.competitors ?? settings.competitorLookup) && settings.ytKey && kw.best;
  if (wantComp) {
    emit('competition', { detail: `« ${kw.best} »` });
    const music = /music/.test(analysis?.content_type || '') || isMusicProfile(profile);
    try {
      comp = await competition(kw.best, { regionCode: String(profile.country || '').toUpperCase() || undefined, relevanceLanguage: kw.locale.hl, videoCategoryId: music ? '10' : undefined });
    } catch (e) { emit('competition', { warn: e.message }); }
  }

  emit('seo', { detail: seoModel });
  const { system, text } = seoPrompt({ ...ctx, keyword: ctx.keyword || '' }, analysis, kw, comp);
  const r = await G.generate({ key, model: seoModel, parts: [{ text }], system, schema: SEO_SCHEMA, temperature: 0.85, signal, timeoutMs: 300000, onRetry: (e) => emit('seo', { detail: e.message }) });
  if (!r.json || !Array.isArray(r.json.titles)) throw new G.GeminiError('Gemini n\'a pas renvoyé de titres. Réessayez.', { reason: 'json' });
  usage.seo = r.usage;

  const pack = globalThis.TPPost.buildPack({
    key: packKey, aliases,
    source: { fileName: raw.fileName || file?.name || '', videoId: raw.videoId || '', youtubeUrl, fileSize: file?.size || raw.fileSize || 0 },
    ctx, analysis, seo: r.json, kw, comp, media,
    models: { analysis: analysis ? (prev?.models?.analysis || mainModel) : '', seo: seoModel },
    usage
  });
  await savePack(pack);
  emit('done');
  return pack;
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
  settings = await ensureModels(settings);
  const profile = (profileId && settings.profiles.find((p) => p.id === profileId)) || pickProfile(settings);
  const { system, text } = hooksPrompt(titles, { profile, topic });
  const r = await G.generate({ key: settings.geminiKey, model: settings.modelFast || settings.modelMain, parts: [{ text }], system, schema: HOOKS_SCHEMA, temperature: 0.8 });
  if (!r.json) throw new G.GeminiError('Réponse illisible, réessayez.');
  const ideas = (r.json.title_ideas || []).map((t) => ({ ...t, score: S.scoreTitle(t.text, { keyword: topic }).score }));
  return { ...r.json, title_ideas: ideas.sort((a, b) => b.score - a.score) };
}
