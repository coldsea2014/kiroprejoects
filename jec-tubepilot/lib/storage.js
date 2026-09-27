// TubePilot — réglages, profils de chaînes, cache et fiches SEO (chrome.storage.local)

export const DEFAULT_PROFILE = {
  id: 'default',
  name: 'My channel',
  channelId: '',
  handle: '',
  artistName: '',
  niche: 'World music',
  genre: '',
  languages: '',
  country: '',
  audience: '',
  tone: '',
  aiGenerated: false,
  officialArtist: false,
  signature: '',
  defaultTags: '',
  defaultHashtags: '',
  notes: ''
};

export const DEFAULTS = {
  aiEngine: 'web',          // web = gemini.google.com (votre abonnement Gemini Pro) ; api = clé AI Studio
  geminiUrl: 'https://gemini.google.com/app', // 2e compte Google : https://gemini.google.com/u/1/app
  geminiSteps: 2,           // 2 = écoute puis SEO avec les vraies recherches YouTube ; 1 = une seule demande (plus rapide)
  geminiWindow: 'popup',    // popup = petite fenêtre dans le coin ; tab = onglet en arrière-plan
  geminiClose: true,        // fermer Gemini dès que le JSON est récupéré
  geminiKey: '',
  ytKey: '',
  modelMain: '',
  modelFast: '',
  models: [],
  mediaMode: 'auto',        // auto | audio | video
  deleteFiles: true,        // supprimer le fichier chez Google après l'analyse
  transcribeLyrics: true,
  competitorLookup: true,   // recherche YouTube des concurrents (API, ~102 unités par mot-clé comparé)
  webTrends: true,          // tendances du moment via Gemini + recherche Google
  autopilot: true,          // analyse automatique dès l'import dans Studio
  autofill: true,           // remplir les champs non modifiés
  studioCard: true,
  watchCard: true,
  tagSuggest: true,
  titleCount: 8,
  profiles: [DEFAULT_PROFILE],
  activeProfile: 'default'
};

const area = () => chrome.storage.local;

export async function getSettings() {
  const { settings } = await area().get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  if (!Array.isArray(s.profiles) || !s.profiles.length) s.profiles = [DEFAULT_PROFILE];
  s.profiles = s.profiles.map((p) => ({ ...DEFAULT_PROFILE, ...p }));
  return s;
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await area().set({ settings: next });
  return next;
}

// Profil de la chaîne ouverte dans Studio (id UC…), sinon profil actif
export function pickProfile(settings, channelId) {
  const list = settings.profiles || [];
  if (channelId) {
    const p = list.find((x) => x.channelId && x.channelId === channelId);
    if (p) return p;
  }
  return list.find((x) => x.id === settings.activeProfile) || list[0] || DEFAULT_PROFILE;
}

export const profileLanguages = (p) => String(p?.languages || globalThis.TPI18n?.lang?.() || 'en').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/* ---------- Cache ---------- */
export async function cacheGet(key, maxAgeMs) {
  const k = 'c:' + key;
  const r = (await area().get(k))[k];
  if (!r || Date.now() - r.ts > maxAgeMs) return undefined;
  return r.v;
}

export async function cacheSet(key, value) {
  await area().set({ ['c:' + key]: { ts: Date.now(), v: value } });
}

// YouTube API data is never kept more than 30 days (YouTube API Services developer policies)
export const YT_DATA_MAX_AGE = 30 * 86400000;

export async function pruneCache(maxAgeMs = 7 * 86400000) {
  const all = await area().get(null);
  const now = Date.now();
  const old = Object.keys(all).filter((k) => k.startsWith('c:') && now - (all[k]?.ts || 0) > maxAgeMs);
  if (all.compCache && now - (all.compCache.ts || 0) > YT_DATA_MAX_AGE) old.push('compCache');
  if (old.length) await area().remove(old);
  // old analyses keep their SEO text but lose the YouTube statistics (competitor videos, views, subscribers)
  const stale = {};
  for (const [k, p] of Object.entries(all)) {
    if (!k.startsWith('pack:') || !p || now - (p.createdAt || 0) <= YT_DATA_MAX_AGE) continue;
    if (!p.competition && !p.keywords?.compared?.length) continue;
    stale[k] = { ...p, competition: null, keywords: p.keywords ? { ...p.keywords, compared: [] } : null };
  }
  if (Object.keys(stale).length) await area().set(stale);
  return old.length + Object.keys(stale).length;
}

/* ---------- Quota YouTube Data API (10 000 unités/jour, remis à zéro à minuit heure du Pacifique) ---------- */
const quotaDay = () => new Date(Date.now() - 8 * 3600000).toISOString().slice(0, 10);

export async function addQuota(units) {
  const k = 'quota:' + quotaDay();
  const cur = (await area().get(k))[k] || 0;
  await area().set({ [k]: cur + units });
  return cur + units;
}

export async function getQuota() {
  const k = 'quota:' + quotaDay();
  return (await area().get(k))[k] || 0;
}

/* ---------- Fiches SEO (une par vidéo / fichier) ---------- */
export async function savePack(pack) {
  const keys = [...new Set([pack.key, ...(pack.aliases || [])].filter(Boolean))];
  const entries = Object.fromEntries(keys.map((k) => ['pack:' + k, pack]));
  const { packIndex = [] } = await area().get('packIndex');
  const idx = [{ key: pack.key, aliases: keys, title: pack.seo?.titles?.[0]?.text || pack.source?.fileName || pack.key, fileName: pack.source?.fileName || '', videoId: pack.source?.videoId || '', createdAt: pack.createdAt, score: pack.seo?.titles?.[0]?.score || 0 },
    ...packIndex.filter((x) => x.key !== pack.key)];
  const drop = idx.slice(60);
  await area().set({ ...entries, packIndex: idx.slice(0, 60) });
  if (drop.length) await area().remove(drop.flatMap((x) => (x.aliases || [x.key]).map((k) => 'pack:' + k)));
  return pack;
}

export async function getPack(...keys) {
  for (const k of keys.filter(Boolean)) {
    const p = (await area().get('pack:' + k))['pack:' + k];
    if (p) return p;
  }
  return null;
}

export async function listPacks() {
  return (await area().get('packIndex')).packIndex || [];
}

export async function deletePack(key) {
  const { packIndex = [] } = await area().get('packIndex');
  const item = packIndex.find((x) => x.key === key);
  await area().set({ packIndex: packIndex.filter((x) => x.key !== key) });
  await area().remove((item?.aliases || [key]).map((k) => 'pack:' + k));
}

/* ---------- Concurrents suivis ---------- */
export async function getCompetitors() {
  return (await area().get('competitors')).competitors || [];
}

export async function setCompetitors(list) {
  await area().set({ competitors: list });
}
