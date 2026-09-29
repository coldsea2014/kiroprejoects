// TubePilot — radar viral : vitesse réelle des nouvelles vidéos des chaînes suivies (vues gagnées entre deux relevés)
// comparée au rythme habituel de chaque chaîne, et suivi de mes vidéos publiées contre le rythme de la niche.
// Coût : ~2 unités de quota YouTube par chaîne suivie et par relevé, 1 unité pour mes vidéos.
import { getCompetitors, getSettings } from './storage.js';
import * as YT from './ytapi.js';
import './format.js';

const F = globalThis.TPF;
const KEY = 'radar';
export const HOT_RATIO = 3;          // ×3 le rythme habituel de la chaîne = « ça explose »
export const MIN_VIEWS = 1000;       // en dessous, trop peu de vues pour conclure
const WINDOW_DAYS = 7;               // les vidéos concurrentes sont suivies 7 jours
const MINE_DAYS = 7;                 // mes vidéos sont suivies 7 jours après publication
export const BEHIND_RATIO = 0.5;     // moitié du rythme de la niche = en retard

const empty = () => ({ ts: 0, channels: {}, videos: {}, mine: {} });
export async function loadRadar() {
  const r = (await chrome.storage.local.get(KEY))[KEY];
  return r ? { ...empty(), ...r } : empty();
}
const saveRadar = (s) => chrome.storage.local.set({ [KEY]: s });

// Vitesse actuelle : vues gagnées entre les deux derniers relevés espacés d'au moins 20 min ; sinon moyenne depuis la publication
export function velocity(snaps, publishedAt) {
  const last = snaps[snaps.length - 1];
  for (let i = snaps.length - 2; i >= 0; i--) {
    const [t0, v0] = snaps[i];
    if (last[0] - t0 >= 20 * 60000) return { vph: Math.max(0, (last[1] - v0) / ((last[0] - t0) / 3600000)), measured: true };
  }
  const hours = Math.max(1, (last[0] - Date.parse(publishedAt)) / 3600000);
  return { vph: last[1] / hours, measured: false };
}

// Rythme habituel d'une chaîne : vues médianes de ses vidéos (d'au moins 3 jours) réparties sur une semaine
export function typicalVph(uploads) {
  const settled = uploads.filter((v) => v.ageDays >= 3).map((v) => v.views);
  const base = settled.length >= 3 ? settled : uploads.map((v) => v.views);
  return Math.max(1, (F.median(base) || 0) / 168);
}

// Rythme de la niche : médiane des rythmes habituels des chaînes suivies
export function nicheVph(radar) {
  const list = Object.values(radar.channels || {}).map((c) => c.typicalVph).filter((x) => x > 0);
  return list.length ? F.median(list) : 0;
}

const pushSnap = (e, now, views) => {
  e.snaps = [...(e.snaps || []), [now, views]].slice(-12);
};

// Mes vidéos à suivre après publication (appelé quand TubePilot a rempli Studio)
export async function track({ videoId, title = '', packKey = '' }) {
  if (!/^[\w-]{11}$/.test(videoId || '')) return false;
  const r = await loadRadar();
  r.mine[videoId] = { ...(r.mine[videoId] || { id: videoId, snaps: [], addedAt: Date.now() }), title: title || r.mine[videoId]?.title || '', packKey: packKey || r.mine[videoId]?.packKey || '' };
  await saveRadar(r);
  return true;
}

export async function untrack(videoId) {
  const r = await loadRadar();
  delete r.mine[videoId];
  await saveRadar(r);
}

// Un relevé : chaînes suivies + mes vidéos. Renvoie les nouvelles alertes (vidéos qui explosent, mes vidéos en retard).
export async function scan({ now = Date.now() } = {}) {
  const settings = await getSettings();
  if (!settings.ytKey) return { skipped: 'key', hot: [], behind: [] };
  const r = await loadRadar();
  const comps = await getCompetitors();
  let quotaHit = false;
  for (const c of comps) {
    let ups;
    try { ups = await YT.recentUploads(c, 15, { fresh: true }); } catch (e) { if (/quota/i.test(e.message)) { quotaHit = true; break; } continue; }
    const typ = typicalVph(ups);
    r.channels[c.id] = { id: c.id, title: c.title, thumb: c.thumb, typicalVph: typ, at: now };
    for (const v of ups) {
      if (v.ageDays > WINDOW_DAYS) continue;
      const e = r.videos[v.id] || { id: v.id, snaps: [] };
      Object.assign(e, { title: v.title, channelId: c.id, channelTitle: c.title, thumb: v.thumb, publishedAt: v.publishedAt, views: v.views, duration: v.duration, tags: (v.tags || []).slice(0, 20) });
      pushSnap(e, now, v.views);
      const vel = velocity(e.snaps, v.publishedAt);
      e.vph = vel.vph;
      e.measured = vel.measured;
      e.ratio = vel.vph / typ;
      e.hot = e.ratio >= HOT_RATIO && v.views >= MIN_VIEWS;
      r.videos[v.id] = e;
    }
  }
  const followed = new Set(comps.map((c) => c.id));
  for (const [id, e] of Object.entries(r.videos)) {
    if (now - Date.parse(e.publishedAt) > WINDOW_DAYS * 86400000 || !followed.has(e.channelId)) delete r.videos[id];
  }
  for (const id of Object.keys(r.channels)) if (!followed.has(id)) delete r.channels[id];

  // mes vidéos contre le rythme de la niche
  const niche = nicheVph(r);
  const mineIds = Object.keys(r.mine);
  if (mineIds.length && !quotaHit) {
    let vids = [];
    try { vids = await YT.videos(mineIds, { fresh: true }); } catch (e) { vids = []; }
    for (const v of vids) {
      const e = r.mine[v.id];
      Object.assign(e, { title: v.title || e.title, publishedAt: v.publishedAt, views: v.views, thumb: v.thumb });
      pushSnap(e, now, v.views);
      const vel = velocity(e.snaps, v.publishedAt);
      e.vph = vel.vph;
      e.measured = vel.measured;
      e.nicheVph = niche;
      e.ratio = niche ? vel.vph / niche : null;
    }
  }
  for (const [id, e] of Object.entries(r.mine)) {
    const since = e.publishedAt ? now - Date.parse(e.publishedAt) : now - e.addedAt;
    if (since > MINE_DAYS * 86400000) delete r.mine[id];
  }

  // alertes : une seule fois par vidéo
  const hot = Object.values(r.videos).filter((e) => e.hot && !e.alertedAt);
  hot.forEach((e) => { e.alertedAt = now; });
  const behind = Object.values(r.mine).filter((e) => {
    if (e.ratio == null || e.alertedAt || !e.publishedAt) return false;
    const h = (now - Date.parse(e.publishedAt)) / 3600000;
    return h >= 3 && h <= 48 && e.ratio < BEHIND_RATIO;
  });
  behind.forEach((e) => { e.alertedAt = now; });
  r.ts = now;
  r.unseen = (r.unseen || 0) + hot.length + behind.length;
  await saveRadar(r);
  return { hot, behind, quotaHit, radar: r };
}

export async function markSeen() {
  const r = await loadRadar();
  if (r.unseen) { r.unseen = 0; await saveRadar(r); }
  return r;
}

// Liste triée pour l'affichage : d'abord ce qui explose, puis les plus rapides
export function hotList(radar, max = 30) {
  return Object.values(radar.videos || {}).sort((a, b) => (b.hot - a.hot) || b.ratio - a.ratio).slice(0, max);
}
