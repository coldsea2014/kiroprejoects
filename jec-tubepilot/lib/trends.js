// TubePilot — tendances du moment : YouTube Tendances Musique (API officielle). Les tendances web sont cherchées par Gemini dans la conversation.
import { trending } from './ytapi.js';
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
