// TubePilot — pilote de gemini.google.com (votre abonnement Gemini Pro) : insère la consigne, joint l'audio,
// envoie, attend la réponse finale (jamais le raisonnement), récupère le JSON et le renvoie à l'extension.
(function () {
  'use strict';
  if (window.__tpGwAlive?.()) return;
  const alive = () => { try { return !!chrome.runtime?.id; } catch (e) { return false; } };
  window.__tpGwAlive = alive;
  const J = globalThis.TPJson;
  const t = (k, v) => globalThis.TPI18n.t(k, v);
  chrome.storage.local.get('settings').then(({ settings }) => globalThis.TPI18n.setLang(settings?.uiLang || 'auto')).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  /* ---------- Éléments de la page (plusieurs sélecteurs : l'interface de Gemini change souvent) ---------- */
  const EDITOR = ['rich-textarea .ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', 'main textarea'];
  const SEND = ['button.send-button', 'button[aria-label*="Send" i]', 'button[aria-label*="Envoyer" i]', 'button[aria-label*="إرسال"]', 'button[data-test-id="send-button"]', 'button[mattooltip*="Send" i]'];
  const STOP = ['button[aria-label*="Stop" i]', 'button[aria-label*="Arrêter" i]', 'button[aria-label*="Interrompre" i]', 'button[aria-label*="إيقاف"]', 'button[data-test-id="stop-button"]', 'button.stop'];
  const RESP = ['model-response', '[data-test-id="model-response"]', '.model-response-text', 'message-content'];
  const THOUGHTS = 'model-thoughts, .model-thoughts, .thoughts-container, .thoughts-content, [data-test-id="model-thoughts"]';
  const PREVIEW = 'uploader-file-preview, .file-preview-container, [data-test-id="file-preview"], .attachment-preview, uploader-file-preview-container';
  const UPLOAD_BTN = /upload|importer|ajouter des fichiers|add files|téléverser|charger|fichier|إضافة|تحميل/i;

  const pick = (list, root = document) => { for (const s of list) { const el = root.querySelector(s); if (el) return el; } return null; };
  const editor = () => pick(EDITOR);
  const generating = () => !!pick(STOP);
  const responses = () => {
    for (const s of RESP) {
      const els = [...document.querySelectorAll(s)].filter((e) => !e.closest('#tp-gw') && !e.parentElement?.closest(s));
      if (els.length) return els;
    }
    return [];
  };

  // texte de la réponse finale (sans le raisonnement « Afficher le raisonnement »)
  function answerText(el) {
    const parts = [...el.querySelectorAll('message-content, .model-response-text')].filter((x) => !x.closest(THOUGHTS) && !x.parentElement?.closest('message-content, .model-response-text'));
    const roots = parts.length ? parts : [el];
    return roots.map((r) => {
      const c = r.cloneNode(true);
      c.querySelectorAll(THOUGHTS).forEach((t) => t.remove());
      // les blocs de code d'abord (JSON), sinon tout le texte
      const code = [...c.querySelectorAll('pre, code')].filter((x) => !(x.tagName === 'CODE' && x.closest('pre'))).map((x) => x.innerText || x.textContent || '').filter((t) => t.includes('{'));
      return code.length ? code.join('\n\n') + '\n\n' + (c.innerText || c.textContent || '') : (c.innerText || c.textContent || '');
    }).join('\n\n').trim();
  }

  /* ---------- Petite barre d'état en haut à droite ---------- */
  let bar = null;
  function status(text, cls = '') {
    if (!bar || !bar.isConnected) {
      bar = document.createElement('div');
      bar.id = 'tp-gw';
      bar.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;display:flex;gap:10px;align-items:flex-start;max-width:380px;background:#fff;color:#0f172a;border:1px solid #e3e6ee;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.18);font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:11px 13px';
      bar.innerHTML = '<div style="flex:none;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#db2777);display:grid;place-items:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M7 4v16l13-8z"/></svg></div><div style="display:grid;gap:2px;min-width:0"><b style="font-weight:700">TubePilot</b><div data-tp-msg></div></div>';
      document.documentElement.appendChild(bar);
    }
    const p = bar.querySelector('[data-tp-msg]');
    p.textContent = text;
    p.style.color = cls === 'warn' ? '#b45309' : cls === 'ok' ? '#15803d' : '#475569';
  }

  const send = (msg) => { try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) { /* extension rechargée */ } };

  /* ---------- Saisie ---------- */
  async function waitFor(fn, ms, step = 400) {
    const t0 = Date.now();
    let v = fn();
    while (!v && Date.now() - t0 < ms) { await sleep(step); v = fn(); }
    return v;
  }

  async function typeInto(ed, text) {
    ed.focus();
    if (ed.tagName === 'TEXTAREA') {
      ed.value = text;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ed);
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    const has = () => flat(ed.innerText).includes(flat(text).slice(0, 60));
    if (!ok || !has()) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch (e) { /* suivant */ }
    }
    await sleep(200);
    if (!has()) { ed.textContent = text; ed.dispatchEvent(new InputEvent('input', { bubbles: true })); }
  }

  async function clickSend(ms) {
    await sleep(400);
    const b = await waitFor(() => {
      const x = pick(SEND);
      return x && !x.disabled && x.getAttribute('aria-disabled') !== 'true' ? x : null;
    }, ms, 500);
    if (!b) return false;
    b.click();
    return true;
  }

  /* ---------- Fichier joint (audio de la vidéo) : collage, glisser-déposer, puis bouton « Importer » intercepté ---------- */
  function attachedVisible(name) {
    if (document.querySelector(PREVIEW)) return true;
    const base = String(name || '').replace(/\.[^.]+$/, '').slice(0, 14).toLowerCase();
    if (!base) return false;
    const ed = editor();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (!p || (ed && ed.contains(p)) || p.closest('#tp-gw, model-response, user-query')) continue;
      if (n.textContent.toLowerCase().includes(base)) return true;
    }
    return false;
  }

  async function attach(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const ed = editor();
    ed?.focus();
    try { ed?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) { /* suivant */ }
    if (await waitFor(() => attachedVisible(file.name), 2500, 250)) return true;
    const zone = ed?.closest('rich-textarea')?.parentElement || ed || document.body;
    try { ['dragenter', 'dragover', 'drop'].forEach((type) => zone.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))); } catch (e) { /* suivant */ }
    if (await waitFor(() => attachedVisible(file.name), 3500, 250)) return true;
    // dernier essai : le bouton « + / Importer des fichiers » de Gemini, le sélecteur de fichiers étant intercepté (content/gemini-main.js)
    window.postMessage({ tp: 'tp-gw-arm', file }, location.origin);
    const clickMatching = () => {
      const btn = [...document.querySelectorAll('button, [role="menuitem"]')].find((b) => b.offsetParent !== null && UPLOAD_BTN.test(`${b.getAttribute('aria-label') || ''} ${b.getAttribute('mattooltip') || ''} ${b.textContent || ''}`));
      btn?.click();
      return !!btn;
    };
    for (let i = 0; i < 3 && !attachedVisible(file.name); i++) {
      clickMatching();
      await sleep(700);
    }
    return !!(await waitFor(() => attachedVisible(file.name), 4000, 250));
  }

  async function loadAttachment(key) {
    const rec = (await chrome.storage.local.get(key))[key];
    if (!rec?.data) return null;
    const bin = atob(rec.data);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], rec.name, { type: rec.type || 'audio/wav' });
  }

  /* ---------- Modèle : « Pro » choisi dans le sélecteur de Gemini (une fois par fenêtre) ---------- */
  const shown = (el) => !!el && el.getClientRects().length > 0 && !el.closest('#tp-gw');
  const isPro = (s) => /\bpro\b/i.test(flat(s)) && !/\bflash\b/i.test(flat(s));
  const MODEL_BTN = ['[data-test-id="bard-mode-menu-button"]', '[data-test-id*="mode-switcher"] button', 'bard-mode-switcher button', 'button[aria-label*="mode" i]', 'button[aria-label*="model" i]', 'button[aria-label*="modèle" i]', 'button[aria-label*="النموذج"]'];
  const MODEL_ITEM = '[role="menuitem"], [role="menuitemradio"], [role="option"], .mat-mdc-menu-item, bard-mode-list-button, [data-test-id*="mode-item"]';
  function modelButton() {
    for (const s of MODEL_BTN) { const b = [...document.querySelectorAll(s)].find(shown); if (b) return b; }
    // repli : bouton court « Flash », « Pro », « 2.5 Flash », « Thinking »… (à côté de la zone de saisie)
    return [...document.querySelectorAll('button, [role="button"]')].filter(shown).find((b) => /^(\d(\.\d)?\s*)?(flash|pro|thinking|fast|rapide)\b[^]{0,12}$/i.test(flat(b.textContent))) || null;
  }
  let modelTried = false;
  async function pickModel(want) {
    if (want !== 'pro' || modelTried) return;
    modelTried = true;
    try {
      const btn = modelButton();
      if (!btn || isPro(btn.textContent)) return;
      btn.click();
      const item = await waitFor(() => [...document.querySelectorAll(MODEL_ITEM)].find((el) => shown(el) && isPro(el.textContent) && !el.matches('[aria-disabled="true"], [disabled]')), 4000, 150);
      if (item) { item.click(); status(t('gw.modelPro')); await sleep(700); }
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    } catch (e) { /* sélecteur introuvable : le modèle actuel est gardé */ }
  }

  /* ---------- Une demande ---------- */
  let job = null;

  async function run(j) {
    job = { ...j, retries: 0, done: false };
    const me = job;
    try {
      status(t('gw.preparing'));
      send({ type: 'gw:status', id: me.id, stage: 'open', text: t('gw.opening') });
      let ed = await waitFor(editor, 40000);
      if (!ed) {
        status(t('gw.login'), 'warn');
        send({ type: 'gw:front', id: me.id, why: 'login' });
        ed = await waitFor(editor, 5 * 60000, 1000);
        if (!ed) throw new Error(t('gw.notReady'));
      }
      if (me !== job) return;
      await pickModel(me.model);
      const baseline = responses().length;
      let file = null;
      if (me.attachKey) {
        file = await loadAttachment(me.attachKey);
        if (file) {
          status(t('gw.attaching', { name: file.name }));
          send({ type: 'gw:status', id: me.id, stage: 'attach', text: t('gw.attachingShort') });
          const ok = await attach(file);
          if (!ok) {
            status(t('gw.dropFile'), 'warn');
            send({ type: 'gw:front', id: me.id, why: 'attach', fileName: file.name });
            const later = await waitFor(() => !!document.querySelector(PREVIEW) || attachedVisible(file.name), 3 * 60000, 1000);
            if (!later) throw new Error(t('gw.attachFailed'));
          }
        }
      }
      await typeInto(editor() || ed, me.prompt);
      status(file ? t('gw.attached') : t('gw.sending'));
      let sent = await clickSend(file ? 180000 : 20000);
      if (!sent) {
        send({ type: 'gw:front', id: me.id, why: 'send' });
        status(t('gw.clickSend'), 'warn');
        sent = !!(await waitFor(() => responses().length > baseline, 3 * 60000, 1000));
        if (!sent) throw new Error(t('gw.notSent'));
      }
      send({ type: 'gw:status', id: me.id, stage: 'thinking', text: t('gw.thinkingShort') });
      status(t('gw.thinking'));
      await watch(me, baseline);
    } catch (e) {
      if (me === job) send({ type: 'gw:error', id: me.id, error: e.message || String(e) });
      status(e.message || String(e), 'warn');
    }
  }

  // Attend la fin de la réponse ; JSON incomplet → redemande (2 fois au plus)
  function watch(me, baseline) {
    return new Promise((resolve, reject) => {
      let lastText = '', stableSince = Date.now(), lastProgress = Date.now(), frontAsked = false, busy = false;
      const t0 = Date.now();
      const finish = (fn, v) => { clearInterval(timer); obs.disconnect(); fn(v); };
      const tick = async () => {
        if (busy || me !== job || !alive()) return;
        const now = Date.now();
        const gen = generating();
        if (gen) lastProgress = now;
        if (now - t0 > 12 * 60000) return finish(reject, new Error(t('gw.timeout')));
        const rs = responses();
        if (rs.length <= baseline) {
          if (!frontAsked && now - lastProgress > 60000) { frontAsked = true; send({ type: 'gw:front', id: me.id, why: 'stall' }); }
          return;
        }
        const text = answerText(rs[rs.length - 1]);
        if (!text) return;
        if (text !== lastText) { lastText = text; stableSince = now; lastProgress = now; return; }
        const still = now - stableSince;
        if (!frontAsked && document.hidden && now - lastProgress > 60000) { frontAsked = true; send({ type: 'gw:front', id: me.id, why: 'stall' }); }
        if (gen && still < 8000) return;
        const { obj, cut } = J.parse(text, me.keys || []);
        const anyObj = obj || J.parse(text, []).obj;
        if (anyObj && anyObj.error && !obj) { status(t('gw.noAccess'), 'warn'); return finish(resolve, send({ type: 'gw:done', id: me.id, text })); }
        if (obj && !cut && still > 1200) {
          status(t('gw.done'), 'ok');
          return finish(resolve, send({ type: 'gw:done', id: me.id, text }));
        }
        // terminé sans JSON complet : on redemande le JSON complet (JSON commencé : 6 s de calme ; aucun : 25 s)
        if (!gen && still > (text.includes('{') ? 6000 : 25000)) {
          if (me.retries < 2) {
            busy = true;
            me.retries++;
            status(t('gw.retry', { n: me.retries }));
            const ed = editor();
            if (ed) {
              await typeInto(ed, `Your previous answer is incomplete or not valid JSON. Send ONLY the complete JSON that was requested${me.keys?.length ? ` (with ${me.keys.map((k) => `"${k}"`).join(', ')})` : ''}, in a single code block, with no text before or after. If it is too long, shorten the description, but the JSON must be complete and valid.`);
              baseline = responses().length;
              await clickSend(20000);
              lastText = '';
              stableSince = Date.now();
            }
            busy = false;
          } else {
            status(t('gw.partial'), 'warn');
            finish(resolve, send({ type: 'gw:done', id: me.id, text, cut: true }));
          }
        }
      };
      const timer = setInterval(tick, 1000);
      const obs = new MutationObserver(() => { clearTimeout(obs.t); obs.t = setTimeout(tick, 300); });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }

  chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m?.type === 'gw:ping') { sendResponse({ ok: true, ready: !!editor() }); return false; }
    if (m?.type === 'gw:run' && m.job?.id) {
      if (job && job.id === m.job.id) { sendResponse({ ok: true, dup: true }); return false; }
      sendResponse({ ok: true });
      run(m.job);
      return false;
    }
    if (m?.type === 'gw:cancel' && job && (!m.id || m.id === job.id)) { job = null; status(t('common.cancelled')); sendResponse({ ok: true }); return false; }
    return false;
  });
})();
