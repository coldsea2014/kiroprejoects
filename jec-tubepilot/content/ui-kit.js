// TubePilot — outils communs aux scripts injectés dans YouTube et YouTube Studio (messages, Shadow DOM, copie, notifications)
(function (g) {
  'use strict';
  const t = (k, v) => g.TPI18n.t(k, v);

  const alive = () => { try { return !!chrome.runtime?.id; } catch (e) { return false; } };

  // Message au service worker → { ok, data } ; rejette avec un message lisible
  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!alive()) return reject(new Error(t('common.reload')));
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (!res) return reject(new Error(t('common.noResponse')));
          res.ok ? resolve(res.data) : reject(new Error(res.error));
        });
      } catch (e) { reject(e); }
    });
  }

  function isDark() {
    if (document.documentElement.hasAttribute('dark')) return true;
    const pick = (el) => el && getComputedStyle(el).backgroundColor;
    const bg = [pick(document.querySelector('ytcp-app')), pick(document.body), pick(document.documentElement)].find((c) => c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c));
    const m = String(bg || '').match(/\d+(\.\d+)?/g);
    if (!m) return false;
    const [r, gg, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255 < 0.5;
  }

  // Hôte isolé (Shadow DOM) : le style de YouTube n'abîme pas le nôtre et inversement
  function shadow(id, tag = 'div') {
    const host = document.createElement(tag);
    host.id = id;
    const root = host.attachShadow({ mode: 'open' });
    for (const href of ['lib/tp.css', 'content/shadow.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(href);
      root.appendChild(link);
    }
    const body = document.createElement('div');
    body.className = 'tp-root';
    body.dir = g.TPI18n.dir();
    root.appendChild(body);
    host.classList.toggle('dark', isDark());
    return { host, root, body };
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  let toastEl = null, toastT = 0;
  function toast(msg, ms = 3200, icon = 'check') {
    if (!toastEl) {
      toastEl = shadow('tp-toast');
      toastEl.host.style.cssText = 'position:fixed;z-index:2147483647;left:50%;bottom:28px;transform:translateX(-50%)';
      document.documentElement.appendChild(toastEl.host);
    }
    toastEl.body.innerHTML = `<div class="tp-toast">${g.TPIcons.icon(icon, 16)}<span></span></div>`;
    toastEl.body.querySelector('span').textContent = msg;
    toastEl.host.style.display = '';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.host.style.display = 'none'; }, ms);
  }

  async function openPanel(intent) {
    try { await send('openPanel', { intent }); } catch (e) { toast(t('common.openPanelHint'), 5000, 'info'); }
  }

  g.TPUI = { alive, send, isDark, shadow, copy, toast, openPanel };
})(globalThis);
