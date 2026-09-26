// JEC TubePilot — recherche de mots-clés : suggestions réelles de la recherche YouTube + concurrence (API officielle)
import { cacheGet, cacheSet } from './storage.js';
import { searchTop } from './ytapi.js';
import './format.js';
import './policy.js';
import './seo.js';

const F = globalThis.TPF, S = globalThis.TPSeo;

// Suggestions de la barre de recherche YouTube (ce que les gens tapent vraiment), gardées 24 h
export async function suggest(q, { hl = 'fr', gl = '' } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const ck = `sug:${hl}:${gl}:${query.toLowerCase()}`;
  const hit = await cacheGet(ck, 24 * 3600000);
  if (hit) return hit;
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&ie=utf-8&oe=utf-8&hl=${encodeURIComponent(hl)}${gl ? '&gl=' + encodeURIComponent(gl) : ''}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Suggestions YouTube indisponibles (' + res.status + ')');
  const data = JSON.parse(await res.text());
  const list = (Array.isArray(data?.[1]) ? data[1] : []).map((x) => (Array.isArray(x) ? x[0] : x)).filter((x) => typeof x === 'string');
  await cacheSet(ck, list);
  return list;
}

const LETTERS = {
  latin: 'a b c d e f g h i j k l m n o p q r s t u v w x y z'.split(' '),
  arabic: 'ا ب ت ج ح خ د ر ز س ش ص ط ع غ ف ق ك ل م ن ه و ي'.split(' ')
};
const PREFIXES = {
  fr: ['meilleur', 'nouvelle', 'musique'],
  en: ['best', 'new', 'how to'],
  ar: ['اجمل', 'اغاني', 'جديد'],
  es: ['mejor', 'nueva', 'musica']
};

// Popularité (indice 0-100) : rang dans les suggestions directes, nombre d'apparitions, longueur de l'expression
function popularity(e) {
  const words = e.kw.split(/\s+/).length;
  const direct = e.directRank >= 0 ? (10 - e.directRank) / 10 : 0;
  const breadth = Math.min(1, e.rankSum / 3);
  const short = words <= 2 ? 1 : words === 3 ? 0.6 : words === 4 ? 0.35 : 0.2;
  return F.clamp(Math.round(100 * (0.55 * direct + 0.3 * breadth + 0.15 * short)), 1, 100);
}

// Recherche « alphabet » autour d'une graine : jusqu'à ~35 requêtes de suggestions (en parallèle limité)
export async function research(seed, { hl = 'fr', gl = '', deep = true, onProgress } = {}) {
  seed = String(seed || '').trim();
  if (!seed) return { seed, items: [] };
  const letters = deep ? LETTERS[F.script(seed) === 'arabic' ? 'arabic' : 'latin'] : [];
  const year = new Date().getFullYear();
  const queries = F.uniq([seed, ...letters.map((l) => `${seed} ${l}`), ...(deep ? (PREFIXES[hl] || []).map((w) => `${w} ${seed}`) : []), `${seed} ${year}`]);
  let done = 0;
  const lists = await F.pool(queries, 5, async (q) => {
    const r = await suggest(q, { hl, gl });
    onProgress?.(++done / queries.length);
    return r;
  });
  const map = new Map();
  lists.forEach((list, qi) => {
    (list || []).forEach((kw, rank) => {
      const k = F.norm(kw);
      if (!k) return;
      const e = map.get(k) || { kw, hits: 0, rankSum: 0, bestRank: 99, directRank: -1 };
      e.hits++;
      e.rankSum += (10 - Math.min(9, rank)) / 10;
      e.bestRank = Math.min(e.bestRank, rank);
      if (qi === 0 && e.directRank < 0) e.directRank = rank;
      map.set(k, e);
    });
  });
  const seedKey = F.norm(seed);
  if (!map.has(seedKey)) {
    const n = (lists[0] || []).length;
    map.set(seedKey, { kw: seed, hits: 1, rankSum: n / 10, bestRank: 0, directRank: n >= 8 ? 0 : n >= 4 ? 3 : n ? 6 : -1 });
  }
  const items = [...map.values()].map((e) => ({ kw: e.kw, popularity: popularity(e), hits: e.hits, direct: e.directRank >= 0, words: e.kw.split(/\s+/).length }));
  items.sort((a, b) => b.popularity - a.popularity || a.words - b.words);
  return { seed, hl, gl, items, fetchedAt: Date.now() };
}

// Concurrence d'un mot-clé sur YouTube (API officielle, ~102 unités) → demande, concurrence, score global, motifs des titres, tags
export async function competition(kw, { regionCode, relevanceLanguage, videoCategoryId } = {}) {
  const { videos, total } = await searchTop(kw, { regionCode, relevanceLanguage, videoCategoryId, max: 15 });
  const top = videos.slice(0, 15);
  const titles = top.map((v) => v.title);
  const medianViews = F.median(top.map((v) => v.views));
  const medianSubs = F.median(top.map((v) => v.subs || 0));
  const titleMatch = top.length ? top.filter((v) => S.keywordMatch(v.title, kw).match >= 0.7).length / top.length : 0;
  const recent = top.length ? top.filter((v) => v.ageDays <= 90).length / top.length : 0;
  const demand = F.clamp(Math.round((Math.log10(medianViews + 1) / 6) * 100), 0, 100);
  const compet = F.clamp(Math.round(45 * titleMatch + 40 * Math.min(1, Math.log10(medianSubs + 1) / 6.3) + 15 * (1 - recent)), 0, 100);
  const overall = F.clamp(Math.round(0.6 * demand + 0.4 * (100 - compet)), 0, 100);
  const tagFreq = new Map();
  top.forEach((v) => F.uniq((v.tags || []).map((t) => t.trim())).forEach((t) => {
    const k = F.norm(t);
    if (!k) return;
    const e = tagFreq.get(k) || { tag: t, n: 0 };
    e.n++;
    tagFreq.set(k, e);
  }));
  const tags = [...tagFreq.values()].sort((a, b) => b.n - a.n).slice(0, 40);
  const outliers = top.filter((v) => v.outlier >= 2).sort((a, b) => b.outlier - a.outlier).slice(0, 5);
  return { kw, total, videos: top, medianViews, medianSubs, titleMatch, recent, demand, competition: compet, overall, patterns: S.titlePatterns(titles), tags, outliers, fetchedAt: Date.now() };
}

// Langue de recherche (hl) et pays (gl) pour chaque langue d'un profil
export function localesFor(languages, country) {
  const gl = String(country || '').toUpperCase();
  return (languages || ['fr']).slice(0, 3).map((l) => ({ hl: l.slice(0, 2), gl }));
}
