// TubePilot — Gemini Pro par votre abonnement (gemini.google.com) : ouvre Gemini dans une petite fenêtre à part,
import { t } from './lang.js';
// y envoie la consigne (et l'audio), récupère la réponse, puis referme la fenêtre. Aucune clé API.
import './jsonparse.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const DEFAULT_URL = 'https://gemini.google.com/app';

export class GeminiWebError extends Error {
  constructor(message, reason = '') {
    super(message);
    this.name = 'GeminiWebError';
    this.reason = reason;
  }
}

async function originTab() {
  try { const t = await chrome.tabs.getCurrent(); if (t) return t; } catch (e) { /* pas un onglet */ }
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return t || null;
}

// mode 'popup' : petite fenêtre dans le coin de l'écran (Gemini reste visible, donc il écrit normalement) ; 'tab' : onglet en arrière-plan
export async function openSession({ url = DEFAULT_URL, mode = 'popup' } = {}) {
  const target = /^https:\/\/gemini\.google\.com\//.test(url || '') ? url : DEFAULT_URL;
  const origin = await originTab();
  if (mode === 'popup') {
    const W = 460, H = 720;
    const sw = (typeof screen !== 'undefined' && screen.availWidth) || 1400;
    const sh = (typeof screen !== 'undefined' && screen.availHeight) || 900;
    const win = await chrome.windows.create({ url: target, type: 'popup', focused: false, width: W, height: H, left: Math.max(0, sw - W - 12), top: Math.max(0, sh - H - 12) });
    return { mode, winId: win.id, tabId: win.tabs[0].id, origin, shown: false };
  }
  const tab = await chrome.tabs.create({ url: target, active: false, windowId: origin?.windowId, index: origin ? origin.index + 1 : undefined });
  return { mode, winId: tab.windowId, tabId: tab.id, origin, shown: false };
}

// Gemini a besoin de vous (connexion, fichier à glisser, clic sur Envoyer) : fenêtre agrandie au premier plan
export async function showSession(s) {
  if (!s) return;
  s.shown = true;
  try {
    if (s.mode === 'popup') await chrome.windows.update(s.winId, { focused: true, drawAttention: true, width: 1000, height: 820 });
    else { await chrome.tabs.update(s.tabId, { active: true }); await chrome.windows.update(s.winId, { focused: true }); }
  } catch (e) { /* fenêtre fermée */ }
}

export async function closeSession(s) {
  if (!s) return;
  try {
    if (s.mode === 'popup') await chrome.windows.remove(s.winId);
    else await chrome.tabs.remove(s.tabId);
  } catch (e) { /* déjà fermée */ }
  // retour à YouTube Studio si Gemini a dû être affiché
  if (s.shown && s.origin) {
    chrome.tabs.update(s.origin.id, { active: true }).catch(() => {});
    chrome.windows.update(s.origin.windowId, { focused: true }).catch(() => {});
  }
}

async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// Envoie une consigne dans la conversation Gemini de la session → { text, obj, cut }
export async function ask(session, { prompt, attachment = null, attachName = '', keys = [], onStatus, signal, timeoutMs = 14 * 60000 } = {}) {
  const id = 'gw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let attachKey = null;
  if (attachment) {
    attachKey = 'gwFile:' + id;
    await chrome.storage.local.set({ [attachKey]: { name: attachName || attachment.name || 'audio.wav', type: attachment.type || 'audio/wav', data: await toBase64(attachment) } });
  }
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(onMsg);
        chrome.windows.onRemoved?.removeListener(onClosed);
        fn(v);
      };
      const onMsg = (m) => {
        if (!m || m.id !== id) return false;
        if (m.type === 'gw:status') onStatus?.(m);
        else if (m.type === 'gw:front') { showSession(session); onStatus?.({ stage: 'front', why: m.why, text: m.why === 'login' ? t('gw.needLogin') : t('gw.needYou') }); }
        else if (m.type === 'gw:error') done(reject, new GeminiWebError(m.error, 'page'));
        else if (m.type === 'gw:done') {
          const { obj, cut } = globalThis.TPJson.parse(m.text, keys);
          const any = obj || globalThis.TPJson.parse(m.text, []).obj;
          done(resolve, { text: m.text, obj: obj || null, cut: cut || !!m.cut, error: any?.error || '' });
        }
        return false;
      };
      const onClosed = (winId) => { if (session.mode === 'popup' && winId === session.winId) done(reject, new GeminiWebError(t('gw.closed'), 'closed')); };
      chrome.runtime.onMessage.addListener(onMsg);
      chrome.windows.onRemoved?.addListener(onClosed);
      const timer = setTimeout(() => done(reject, new GeminiWebError(t('gem.timeout'), 'timeout')), timeoutMs);
      signal?.addEventListener('abort', () => {
        chrome.tabs.sendMessage(session.tabId, { type: 'gw:cancel', id }).catch(() => {});
        done(reject, new GeminiWebError(t('common.cancelled'), 'abort'));
      }, { once: true });
      // la page Gemini peut mettre du temps à charger : on renvoie la demande jusqu'à ce que le script de la page réponde
      (async () => {
        for (let i = 0; i < 120 && !settled; i++) {
          try {
            const r = await chrome.tabs.sendMessage(session.tabId, { type: 'gw:run', job: { id, prompt, attachKey, keys } });
            if (r?.ok) return;
          } catch (e) { /* page pas encore prête */ }
          await sleep(1000);
        }
        if (!settled) { showSession(session); done(reject, new GeminiWebError(t('gw.openFailed'), 'open')); }
      })();
    });
  } finally {
    if (attachKey) chrome.storage.local.remove(attachKey).catch(() => {});
  }
}
