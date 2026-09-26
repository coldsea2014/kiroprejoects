// JEC TubePilot — YouTube Data API v3 (source officielle : vues, abonnés, tags publics, tendances), avec cache et compteur de quota
import { cacheGet, cacheSet, addQuota, getSettings } from './storage.js';
import './format.js';

const F = globalThis.TPF;
const BASE = 'https://www.googleapis.com/youtube/v3/';

export class YtError extends Error {}

async function yt(endpoint, params, { units = 1, cacheMs = 6 * 3600000 } = {}) {
  const { ytKey } = await getSettings();
  if (!ytKey) throw new YtError('Ajoutez une clé YouTube Data API v3 dans Réglages (gratuite) pour les données concurrents et tendances.');
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
  const ck = 'yt:' + endpoint + '?' + qs.toString();
  if (cacheMs) {
    const hit = await cacheGet(ck, cacheMs);
    if (hit) return hit;
  }
  qs.set('key', ytKey);
  let res;
  try { res = await fetch(BASE + endpoint + '?' + qs.toString()); } catch (e) { throw new YtError('Réseau : YouTube Data API injoignable.'); }
  await addQuota(units);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.error?.errors?.[0]?.reason || '';
    if (reason === 'quotaExceeded') throw new YtError('Quota YouTube Data API épuisé pour aujourd\'hui (10 000 unités). Il revient à 9 h (heure de Paris).');
    if (reason === 'keyInvalid' || res.status === 400 && /key/i.test(body.error?.message || '')) throw new YtError('Clé YouTube invalide : vérifiez-la dans Réglages.');
    if (res.status === 403) throw new YtError('Clé YouTube refusée : activez « YouTube Data API v3 » dans Google Cloud et vérifiez les restrictions de la clé.');
    throw new YtError(`YouTube Data API : ${body.error?.message || res.status}`);
  }
  if (cacheMs) await cacheSet(ck, body);
  return body;
}

export async function hasKey() {
  return !!(await getSettings()).ytKey;
}

// Vidéo de l'API → objet simple avec indicateurs (VPH, âge, engagement)
function shapeVideo(v) {
  const s = v.statistics || {};
  const views = +s.viewCount || 0;
  const likes = +s.likeCount || 0;
  const comments = +s.commentCount || 0;
  const publishedAt = v.snippet?.publishedAt || '';
  return {
    id: v.id,
    title: v.snippet?.title || '',
    description: v.snippet?.description || '',
    channelId: v.snippet?.channelId || '',
    channelTitle: v.snippet?.channelTitle || '',
    publishedAt,
    tags: v.snippet?.tags || [],
    categoryId: v.snippet?.categoryId || '',
    lang: v.snippet?.defaultAudioLanguage || v.snippet?.defaultLanguage || '',
    thumb: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
    views, likes, comments,
    duration: F.isoDur(v.contentDetails?.duration),
    vph: F.vph(views, publishedAt),
    ageDays: Math.max(0, (Date.now() - Date.parse(publishedAt)) / 86400000),
    engagement: views ? ((likes + comments) / views) * 100 : 0
  };
}

export async function videos(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt('videos', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, { units: 1, cacheMs: 3 * 3600000 });
    (r.items || []).forEach((v) => out.push(shapeVideo(v)));
  }
  return out;
}

export async function channels(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt('channels', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, { units: 1, cacheMs: 12 * 3600000 });
    (r.items || []).forEach((c) => out.push(shapeChannel(c)));
  }
  return out;
}

function shapeChannel(c) {
  return {
    id: c.id,
    title: c.snippet?.title || '',
    handle: c.snippet?.customUrl || '',
    thumb: c.snippet?.thumbnails?.default?.url || '',
    country: c.snippet?.country || '',
    subs: +c.statistics?.subscriberCount || 0,
    views: +c.statistics?.viewCount || 0,
    videos: +c.statistics?.videoCount || 0,
    hiddenSubs: !!c.statistics?.hiddenSubscriberCount,
    uploads: c.contentDetails?.relatedPlaylists?.uploads || ''
  };
}

// @handle, URL de chaîne ou ID UC… → chaîne
export async function resolveChannel(input) {
  const s = String(input || '').trim();
  const id = s.match(/(UC[\w-]{22})/)?.[1];
  if (id) return (await channels([id]))[0] || null;
  const handle = s.match(/@([\w.\-\u0600-\u06FF]+)/)?.[1] || (/^[\w.\-]+$/.test(s) ? s : '');
  if (handle) {
    const r = await yt('channels', { part: 'snippet,statistics,contentDetails', forHandle: '@' + handle }, { units: 1, cacheMs: 24 * 3600000 });
    if (r.items?.[0]) return shapeChannel(r.items[0]);
  }
  // dernier recours : recherche (100 unités)
  const r = await yt('search', { part: 'snippet', type: 'channel', q: s, maxResults: 1 }, { units: 100, cacheMs: 24 * 3600000 });
  const cid = r.items?.[0]?.snippet?.channelId || r.items?.[0]?.id?.channelId;
  return cid ? (await channels([cid]))[0] || null : null;
}

// Top vidéos d'une recherche + chaînes (abonnés) : ~102 unités, gardé 12 h
export async function searchTop(q, { regionCode, relevanceLanguage, max = 15, order = 'relevance', videoCategoryId } = {}) {
  const r = await yt('search', { part: 'snippet', type: 'video', q, maxResults: max, order, regionCode, relevanceLanguage, videoCategoryId }, { units: 100, cacheMs: 12 * 3600000 });
  const ids = (r.items || []).map((x) => x.id?.videoId).filter(Boolean);
  if (!ids.length) return { videos: [], total: r.pageInfo?.totalResults || 0 };
  const vids = await videos(ids);
  const chans = await channels(F.uniq(vids.map((v) => v.channelId)));
  const byId = Object.fromEntries(chans.map((c) => [c.id, c]));
  vids.forEach((v) => {
    const c = byId[v.channelId];
    v.subs = c?.subs || 0;
    v.outlier = c?.subs ? v.views / c.subs : 0;
  });
  const order2 = Object.fromEntries(ids.map((id, i) => [id, i]));
  vids.sort((a, b) => order2[a.id] - order2[b.id]);
  return { videos: vids, total: r.pageInfo?.totalResults || 0 };
}

// Dernières vidéos d'une chaîne (3 unités)
export async function recentUploads(channel, max = 15) {
  const uploads = channel.uploads || (await channels([channel.id]))[0]?.uploads;
  if (!uploads) return [];
  const r = await yt('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: max }, { units: 1, cacheMs: 2 * 3600000 });
  const ids = (r.items || []).map((x) => x.contentDetails?.videoId).filter(Boolean);
  return ids.length ? videos(ids) : [];
}

// Tendances d'un pays (1 unité)
export async function trending({ regionCode = 'MA', videoCategoryId = '10', max = 50 } = {}) {
  const r = await yt('videos', { part: 'snippet,statistics,contentDetails', chart: 'mostPopular', regionCode, videoCategoryId: videoCategoryId === '0' ? '' : videoCategoryId, maxResults: max }, { units: 1, cacheMs: 30 * 60000 });
  return (r.items || []).map(shapeVideo);
}

export async function testKey(key) {
  const res = await fetch(BASE + 'videos?part=id&chart=mostPopular&maxResults=1&regionCode=US&key=' + encodeURIComponent(key));
  if (res.ok) return true;
  const body = await res.json().catch(() => ({}));
  throw new YtError(body.error?.message || 'Clé refusée (' + res.status + ')');
}

// Vidéo accessible par lien (publique ou non répertoriée) ? oEmbed répond 401/404 pour une vidéo privée. Sans clé.
export async function isPublic(videoId) {
  try {
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId));
    return res.ok;
  } catch (e) { return false; }
}
