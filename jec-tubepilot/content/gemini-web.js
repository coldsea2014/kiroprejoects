// JEC TubePilot — pilote de gemini.google.com (votre abonnement Gemini Pro) : insère la consigne, joint l'audio,
// envoie, attend la réponse finale (jamais le raisonnement), récupère le JSON et le renvoie à l'extension.
(function () {
  'use strict';
  if (window.__tpGwAlive?.()) return;
  const alive = () => { try { return !!chrome.runtime?.id; } catch (e) { return false; } };
  window.__tpGwAlive = alive;
  const J = globalThis.TPJson;
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
      bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;max-width:360px;background:#fff;color:#111;border:1px solid #d8c8ff;border-radius:12px;box-shadow:0 8px 28px rgba(124,58,237,.25);font:13px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:9px 12px';
      document.documentElement.appendChild(bar);
    }
    bar.innerHTML = '';
    const h = document.createElement('b');
    h.textContent = '🚀 JEC TubePilot';
    h.style.color = '#7c3aed';
    const p = document.createElement('div');
    p.textContent = text;
    if (cls === 'warn') p.style.color = '#b45309';
    if (cls === 'ok') p.style.color = '#15803d';
    bar.append(h, p);
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

  /* ---------- Une demande ---------- */
  let job = null;

  async function run(j) {
    job = { ...j, retries: 0, done: false };
    const me = job;
    try {
      status('Préparation de Gemini…');
      send({ type: 'gw:status', id: me.id, stage: 'open', text: 'Ouverture de Gemini' });
      let ed = await waitFor(editor, 40000);
      if (!ed) {
        status('⚠️ Connectez-vous à votre compte Google dans cette fenêtre : TubePilot continue ensuite tout seul.', 'warn');
        send({ type: 'gw:front', id: me.id, why: 'login' });
        ed = await waitFor(editor, 5 * 60000, 1000);
        if (!ed) throw new Error('Gemini n\'est pas prêt (compte non connecté ?). Ouvrez gemini.google.com, connectez-vous, puis relancez.');
      }
      if (me !== job) return;
      const baseline = responses().length;
      let file = null;
      if (me.attachKey) {
        file = await loadAttachment(me.attachKey);
        if (file) {
          status(`📎 Ajout de « ${file.name} »…`);
          send({ type: 'gw:status', id: me.id, stage: 'attach', text: 'Ajout de l\'audio dans Gemini' });
          const ok = await attach(file);
          if (!ok) {
            status('👉 Glissez ici le fichier de votre vidéo (ou son MP3) : TubePilot continue dès qu\'il est joint.', 'warn');
            send({ type: 'gw:front', id: me.id, why: 'attach', fileName: file.name });
            const later = await waitFor(() => !!document.querySelector(PREVIEW) || attachedVisible(file.name), 3 * 60000, 1000);
            if (!later) throw new Error('Impossible de joindre l\'audio dans Gemini. Glissez le fichier dans Gemini ou utilisez le lien d\'une vidéo publique.');
          }
        }
      }
      await typeInto(editor() || ed, me.prompt);
      status(file ? '📎 Audio joint ✓ — envoi dès la fin de l\'import…' : '➤ Envoi de la consigne à Gemini…');
      let sent = await clickSend(file ? 180000 : 20000);
      if (!sent) {
        send({ type: 'gw:front', id: me.id, why: 'send' });
        status('👉 Cliquez sur Envoyer ➤ : la réponse sera récupérée automatiquement.', 'warn');
        sent = !!(await waitFor(() => responses().length > baseline, 3 * 60000, 1000));
        if (!sent) throw new Error('La consigne n\'a pas été envoyée dans Gemini.');
      }
      send({ type: 'gw:status', id: me.id, stage: 'thinking', text: 'Gemini écoute et rédige…' });
      status('⏳ Gemini travaille… la réponse sera récupérée automatiquement (rien à copier).');
      await watch(me, baseline);
    } catch (e) {
      if (me === job) send({ type: 'gw:error', id: me.id, error: e.message || String(e) });
      status('⚠️ ' + (e.message || e), 'warn');
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
        if (now - t0 > 12 * 60000) return finish(reject, new Error('Gemini ne répond pas (plus de 12 min).'));
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
        if (anyObj && anyObj.error && !obj) { status('Gemini n\'a pas pu accéder au média.', 'warn'); return finish(resolve, send({ type: 'gw:done', id: me.id, text })); }
        if (obj && !cut && still > 1200) {
          status('✔ Réponse récupérée : TubePilot remplit YouTube Studio.', 'ok');
          return finish(resolve, send({ type: 'gw:done', id: me.id, text }));
        }
        // terminé sans JSON complet : on redemande le JSON complet (JSON commencé : 6 s de calme ; aucun : 25 s)
        if (!gen && still > (text.includes('{') ? 6000 : 25000)) {
          if (me.retries < 2) {
            busy = true;
            me.retries++;
            status(`🔁 Réponse incomplète : TubePilot redemande le JSON complet (${me.retries}/2)…`);
            const ed = editor();
            if (ed) {
              await typeInto(ed, `Ta réponse est incomplète ou n'est pas un JSON valide. Renvoie UNIQUEMENT le JSON complet demandé${me.keys?.length ? ` (avec ${me.keys.map((k) => `« ${k} »`).join(', ')})` : ''}, dans un seul bloc de code, sans texte avant ni après. Si c'est trop long, raccourcis la description, mais le JSON doit être complet et valide.`);
              baseline = responses().length;
              await clickSend(20000);
              lastText = '';
              stableSince = Date.now();
            }
            busy = false;
          } else {
            status('⚠️ JSON incomplet : TubePilot récupère ce qui est lisible.', 'warn');
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
    if (m?.type === 'gw:cancel' && job && (!m.id || m.id === job.id)) { job = null; status('Annulé.'); sendResponse({ ok: true }); return false; }
    return false;
  });
})();
