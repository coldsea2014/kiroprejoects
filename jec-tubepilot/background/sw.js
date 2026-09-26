// JEC TubePilot — service worker : panneau latéral, messages des pages YouTube, installation
import { pruneCache, getCompetitors, setCompetitors } from '../lib/storage.js';
import { suggest } from '../lib/keywords.js';
import * as YT from '../lib/ytapi.js';

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

chrome.runtime.onInstalled.addListener(async (d) => {
  panelOnClick();
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
  injectOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  panelOnClick();
  pruneCache().catch(() => {});
});

async function addCompetitor(input) {
  const c = await YT.resolveChannel(input);
  if (!c) throw new Error('Chaîne introuvable.');
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
