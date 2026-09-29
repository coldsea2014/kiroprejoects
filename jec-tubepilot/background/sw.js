// TubePilot — service worker : panneau latéral, messages des pages YouTube, installation
import { t, I18n } from '../lib/lang.js';
import { pruneCache, getCompetitors, setCompetitors, getSettings, setSettings } from '../lib/storage.js';
import * as Radar from '../lib/radar.js';
import { suggest } from '../lib/keywords.js';
import * as YT from '../lib/ytapi.js';

I18n.init();
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.settings) I18n.init(); });

const panelOnClick = () => chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Réinjecte les scripts dans les onglets YouTube déjà ouverts (sinon il faudrait les recharger)
async function injectOpenTabs() {
  const cs = chrome.runtime.getManifest().content_scripts || [];
  for (const def of cs) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: def.matches }); } catch (e) { continue; }
    for (const tab of tabs) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: def.js, world: def.world || 'ISOLATED' }).catch(() => {});
    }
  }
}

// Version personnelle : une clé YouTube fournie dans local-config.json (jamais dans le code ni dans le dépôt)
async function importLocalConfig() {
  try {
    const res = await fetch(chrome.runtime.getURL('local-config.json'));
    if (!res.ok) return;
    const cfg = await res.json();
    const settings = await getSettings();
    if (cfg.ytKey && !settings.ytKey) await setSettings({ ytKey: String(cfg.ytKey).trim() });
  } catch (e) { /* pas de configuration personnelle */ }
}

/* ---------- Radar viral : relevé toutes les 4 heures, alertes et pastille sur l'icône ---------- */
const RADAR_ALARM = 'tp-radar';
function ensureRadarAlarm() {
  chrome.alarms?.get(RADAR_ALARM).then((a) => { if (!a) chrome.alarms.create(RADAR_ALARM, { delayInMinutes: 2, periodInMinutes: 240 }); }).catch(() => {});
}

async function setBadge(n) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#db2777' });
    await chrome.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : '' });
  } catch (e) { /* pas d'icône */ }
}

function notify(url, title, message) {
  if (!chrome.notifications) return;
  chrome.notifications.create('tp|' + url + '|' + Date.now(), { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title, message, priority: 1 }).catch?.(() => {});
}

async function runRadar({ alerts = true } = {}) {
  const r = await Radar.scan();
  if (r.skipped) return r;
  const settings = await getSettings();
  if (alerts && settings.radarAlerts !== false) {
    for (const e of r.hot.slice(0, 3)) {
      notify('https://www.youtube.com/watch?v=' + e.id, t('radar.notifHot', { channel: e.channelTitle, ratio: e.ratio >= 10 ? Math.round(e.ratio) : e.ratio.toFixed(1) }), `${e.title} — ${Math.round(e.vph).toLocaleString(I18n.locale())} ${t('watch.vph')}`);
    }
    if (r.hot.length > 3) notify('https://www.youtube.com/', t('radar.notifMore', { n: r.hot.length - 3 }), '');
    for (const e of r.behind) {
      notify(`https://studio.youtube.com/video/${e.id}/edit`, t('radar.notifBehind', { ratio: e.ratio.toFixed(1) }), `${e.title} — ${t('radar.tryTitle')}`);
    }
  }
  await setBadge(r.radar.unseen || 0);
  return { hot: r.hot.length, behind: r.behind.length, quotaHit: r.quotaHit };
}

chrome.alarms?.onAlarm.addListener((a) => { if (a.name === RADAR_ALARM) runRadar().catch(() => {}); });
chrome.notifications?.onClicked.addListener((id) => {
  const url = String(id).split('|')[1];
  if (/^https:\/\/(www|studio)\.youtube\.com\//.test(url || '')) chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

chrome.runtime.onInstalled.addListener(async (d) => {
  panelOnClick();
  await importLocalConfig();
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
  pruneCache().catch(() => {});
  ensureRadarAlarm();
  injectOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  panelOnClick();
  importLocalConfig();
  pruneCache().catch(() => {});
  ensureRadarAlarm();
});

async function addCompetitor(input) {
  const c = await YT.resolveChannel(input);
  if (!c) throw new Error(t('comp.notFound'));
  const list = await getCompetitors();
  if (!list.some((x) => x.id === c.id)) list.push({ id: c.id, title: c.title, handle: c.handle, thumb: c.thumb, subs: c.subs, uploads: c.uploads, addedAt: Date.now() });
  await setCompetitors(list);
  return c;
}

const handlers = {
  // ouvert depuis un bouton dans YouTube : sidePanel.open doit être appelé tout de suite (geste utilisateur)
  openPanel(m, sender) {
    const p = chrome.sidePanel.open({ tabId: sender.tab.id });
    chrome.storage.session.set({ panelIntent: { ...(m.intent || {}), ts: Date.now() } }).catch(() => {});
    return p.then(() => true);
  },
  openOptions() {
    return chrome.runtime.openOptionsPage();
  },
  suggest(m) {
    return suggest(m.q, { hl: m.hl, gl: m.gl });
  },
  async videoStats(m) {
    if (!(await YT.hasKey())) return null;
    const [video] = await YT.videos([m.id]);
    if (!video) return null;
    const [channel] = await YT.channels([video.channelId]);
    return { video, channel: channel || null };
  },
  addCompetitor(m) {
    return addCompetitor(m.channel);
  },
  // TubePilot a rempli Studio pour cette vidéo : elle est suivie contre la niche après publication
  track(m) {
    return Radar.track({ videoId: m.videoId, title: m.title, packKey: m.packKey });
  },
  radarScan() {
    return runRadar({ alerts: false });
  },
  async radarSeen() {
    await Radar.markSeen();
    await setBadge(0);
    return true;
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  let p;
  try { p = Promise.resolve(h(msg, sender)); } catch (e) { p = Promise.reject(e); }
  p.then((data) => sendResponse({ ok: true, data }), (e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true;
});
