// JEC TubePilot — tendances du moment : YouTube Tendances Musique (API officielle) et recherche Google faite par Gemini
import { cacheGet, cacheSet } from './storage.js';
import { trending } from './ytapi.js';
import * as G from './gemini.js';
import { trendsPrompt, TRENDS_SCHEMA } from './prompts.js';
import './format.js';
import './policy.js';
import './seo.js';

const F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo;

const count = (list) => {
  const m = new Map();
  list.forEach((x) => {
    const k = F.norm(x);
    if (!k) return;
    const e = m.get(k) || { tag: x, n: 0 };
    e.n++;
    m.set(k, e);
  });
  return [...m.values()].sort((a, b) => b.n - a.n);
};

// Hashtags, tags et mots des 50 clips en tendance d'un pays (1 unité de quota, gardé 30 min)
export async function youtubeTrends(regionCode) {
  const vids = await trending({ regionCode, videoCategoryId: '10', max: 50 });
  const hashtags = count(vids.flatMap((v) => F.uniq([...P.extractHashtags(v.title), ...P.extractHashtags(v.description)].map((h) => h.toLowerCase()))));
  const tags = count(vids.flatMap((v) => F.uniq(v.tags || [])));
  return {
    region: regionCode,
    hashtags: hashtags.filter((h) => h.n >= 2 && !/^#(shorts?|music|musique|video|youtube)$/i.test(h.tag)).slice(0, 30),
    tags: tags.filter((t) => t.n >= 2).slice(0, 30),
    words: S.ngrams(vids.map((v) => v.title), { top: 20 }),
    top: vids.sort((a, b) => b.vph - a.vph).slice(0, 8).map((v) => ({ id: v.id, title: v.title, views: v.views, vph: v.vph }))
  };
}

// Ce qui monte en ce moment sur le web pour ce style (Gemini + recherche Google), gardé 12 h
export async function webTrends({ key, model, genre, countries = [], language = 'ar', terms = [], signal }) {
  const ck = `webtrends:${F.norm(genre)}:${countries.join(',')}:${language}:${new Date().toISOString().slice(0, 10)}`;
  const hit = await cacheGet(ck, 12 * 3600000);
  if (hit) return hit;
  const r = await G.generate({
    key, model, signal,
    parts: [{ text: trendsPrompt({ genre, countries, language, terms }) }],
    schema: TRENDS_SCHEMA, // ignoré avec l'outil de recherche : le JSON est extrait du texte
    tools: [{ google_search: {} }],
    temperature: 0.4,
    timeoutMs: 120000
  });
  const j = r.json && typeof r.json === 'object' ? r.json : {};
  const sources = (r.grounding?.groundingChunks || []).map((c) => c.web).filter(Boolean).slice(0, 8).map((w) => ({ title: w.title || '', uri: w.uri || '' }));
  const out = {
    keywords: (j.keywords || []).filter((x) => typeof x === 'string').slice(0, 20),
    hashtags: (j.hashtags || []).map(P.normalizeHashtag).filter(Boolean).slice(0, 20),
    title_patterns: (j.title_patterns || []).filter((x) => typeof x === 'string').slice(0, 8),
    notes: typeof j.notes === 'string' ? j.notes : '',
    sources,
    grounded: sources.length > 0
  };
  await cacheSet(ck, out);
  return out;
}
