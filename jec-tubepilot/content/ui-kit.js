// JEC TubePilot — petits outils communs aux scripts injectés dans YouTube et YouTube Studio
(function (g) {
  'use strict';
  const F = g.TPF;

  const alive = () => { try { return !!chrome.runtime?.id; } catch (e) { return false; } };

  // Message au service worker → { ok, data } ; rejette avec un message lisible
  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!alive()) return reject(new Error('Extension mise à jour : rechargez la page (F5).'));
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (!res) return reject(new Error('Pas de réponse de l\'extension.'));
          res.ok ? resolve(res.data) : reject(new Error(res.error));
        });
      } catch (e) { reject(e); }
    });
  }

  function isDark() {
    const pick = (el) => el && getComputedStyle(el).backgroundColor;
    const bg = [pick(document.querySelector('ytcp-app')), pick(document.body), pick(document.documentElement)].find((c) => c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c));
    if (document.documentElement.hasAttribute('dark')) return true;
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
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/shadow.css');
    root.appendChild(link);
    const body = document.createElement('div');
    body.className = 'tp-root';
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
  function toast(msg, ms = 3200) {
    if (!toastEl) {
      toastEl = shadow('tp-toast');
      toastEl.host.style.cssText = 'position:fixed;z-index:2147483647;left:50%;bottom:28px;transform:translateX(-50%)';
      document.documentElement.appendChild(toastEl.host);
    }
    toastEl.body.innerHTML = `<div class="tp-toast">${F.esc(msg)}</div>`;
    toastEl.host.style.display = '';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.host.style.display = 'none'; }, ms);
  }

  const badge = (score, label = '') => `<span class="tp-sc tp-${F.scoreClass(score)}" title="${F.esc(label)}">${Math.round(score)}</span>`;

  async function openPanel(intent) {
    try { await send('openPanel', { intent }); } catch (e) { toast('Cliquez sur l\'icône JEC TubePilot dans la barre de Chrome pour ouvrir le panneau.'); }
  }

  const logo = () => `<img class="tp-logo" src="${chrome.runtime.getURL('icons/icon32.png')}" alt="">`;

  g.TPUI = { alive, send, isDark, shadow, copy, toast, badge, openPanel, logo };
})(globalThis);
