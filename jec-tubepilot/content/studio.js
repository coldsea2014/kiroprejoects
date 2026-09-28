// TubePilot — YouTube Studio : carte sous le titre, pilote automatique à l'import, score en direct, insertion titre / description / tags
(function () {
  'use strict';
  if (window.__tpStudioAlive?.()) return;
  const UI = globalThis.TPUI, F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo;
  const t = (k, v) => globalThis.TPI18n.t(k, v);
  window.__tpStudioAlive = UI.alive;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = F.sleep;
  const esc = F.esc;
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\u00A0/g, ' ').trim();

  let settings = {};
  async function loadSettings() {
    const s = (await chrome.storage.local.get('settings')).settings || {};
    settings = { autopilot: true, autofill: true, replaceExisting: true, studioCard: true, tagSuggest: true, ...s };
    globalThis.TPI18n.setLang(settings.uiLang || 'auto');
  }

  // Profil de la chaîne ouverte (lié par son ID UC…), sinon le profil actif
  function profile() {
    const list = settings.profiles || [];
    const cid = channelId();
    return (cid && list.find((p) => p.channelId === cid)) || list.find((p) => p.id === settings.activeProfile) || list[0] || {};
  }

  /* ---------- Champs de Studio (fenêtre d'import ou page Détails) ---------- */
  function dialog() {
    return qa('ytcp-uploads-dialog').find(visible) || null;
  }

  function els() {
    const dlg = dialog();
    const root = dlg || document;
    const pick = (sels) => sels.map((s) => q(s, root)).find(visible) || sels.map((s) => q(s, root)).find(Boolean) || null;
    return {
      root,
      dlg,
      title: pick(['#title-textarea #textbox', 'ytcp-video-title #textbox', 'ytcp-social-suggestions-textbox[label*="itle" i] #textbox']),
      description: pick(['#description-textarea #textbox', 'ytcp-video-description #textbox']),
      tagsInput: pick(['#tags-container input#text-input', 'ytcp-form-input-container#tags-container input', 'ytcp-free-text-chip-bar input'])
    };
  }

  function videoId() {
    const dlg = dialog();
    const fromLink = (root) => {
      const a = q('a[href*="youtu.be/"], a[href*="youtube.com/shorts/"], a[href*="youtube.com/watch"]', root);
      return a?.href.match(/(?:youtu\.be\/|shorts\/|[?&]v=)([\w-]{11})/)?.[1] || null;
    };
    if (dlg) return fromLink(dlg);
    return location.pathname.match(/\/video\/([\w-]{11})/)?.[1] || null;
  }

  function channelId() {
    const m = location.pathname.match(/\/channel\/(UC[\w-]{22})/);
    if (m) return m[1];
    for (const a of qa('a[href*="/channel/UC"]')) {
      const m2 = (a.getAttribute('href') || '').match(/\/channel\/(UC[\w-]{22})/);
      if (m2) return m2[1];
    }
    return '';
  }

  const CHIP_SEL = '#tags-container ytcp-chip, ytcp-free-text-chip-bar ytcp-chip';
  function currentTags() {
    const root = dialog() || document;
    return F.uniq(qa(CHIP_SEL, root).map((c) => text(c.querySelector('#chip-text, #text') || c)).filter(Boolean));
  }

  const MEDIA_EXT = /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|flac|aac|ogg|wmv|3gp|mpe?g)$/i;
  // « Nom du fichier » affiché par Studio
  function domFileName() {
    const root = dialog() || document;
    for (const info of qa('ytcp-video-info', root)) {
      for (const lab of qa('.label, [class*="label"]', info)) {
        if (!/nom du fichier|file ?name|اسم الملف|nombre del archivo|dateiname/i.test(lab.textContent || '')) continue;
        const v = lab.nextElementSibling || lab.parentElement?.querySelector('.value, [class*="value"]');
        const t = text(v);
        if (t && t.length < 250) return t;
      }
      for (const v of qa('.value, [class*="value"]', info)) {
        const t = text(v);
        if (MEDIA_EXT.test(t) && t.length < 250) return t;
      }
    }
    return '';
  }

  /* ---------- Fichier choisi pour l'import : gardé en mémoire pour que Gemini l'écoute avant publication ---------- */
  const captured = [];
  const isMedia = (f) => f && (/^(video|audio)\//.test(f.type || '') || MEDIA_EXT.test(f.name || ''));
  function capture(list) {
    const fs = [...(list || [])].filter(isMedia);
    fs.forEach((f) => captured.unshift({ file: f, ts: Date.now() }));
    captured.splice(10);
    if (fs.length) schedule();
  }
  document.addEventListener('change', (e) => {
    const t = e.composedPath?.()[0] || e.target;
    if (t instanceof HTMLInputElement && t.type === 'file' && !t.closest?.('#tp-studio-card')) capture(t.files);
  }, true);
  document.addEventListener('drop', (e) => capture(e.dataTransfer?.files), true);
  function hookFileInputs() {
    for (const input of qa('input[type=file]')) {
      if (input.__tpHooked) continue;
      input.__tpHooked = true;
      input.addEventListener('change', () => capture(input.files));
    }
  }

  const nfile = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function currentFile() {
    const fresh = captured.filter((c) => Date.now() - c.ts < 12 * 3600000);
    const shown = domFileName();
    if (shown) return fresh.find((c) => nfile(c.file.name) === nfile(shown))?.file || null;
    return dialog() && fresh[0] ? fresh[0].file : null;
  }

  function keys() {
    const file = currentFile();
    const vid = videoId();
    return { file, vid, key: file ? `file:${file.name}:${file.size}` : vid ? 'vid:' + vid : '' };
  }

  /* ---------- Écriture dans les champs ---------- */
  const flatText = (s) => String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  function selectIn(el, collapseToEnd = false) {
    const range = document.createRange();
    range.selectNodeContents(el);
    if (collapseToEnd) range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Petite frappe réelle à la fin du champ (espace puis retour arrière) : Studio met à jour sa valeur interne
  // et recalcule la hauteur du champ et de la page (sinon le texte peut déborder sur les blocs suivants)
  function nudge(el) {
    try {
      el.focus();
      selectIn(el, true);
      if (document.execCommand('insertText', false, ' ')) document.execCommand('delete', false);
    } catch (e) { /* champ non modifiable */ }
  }

  // Écrit un texte dans un champ de Studio comme une vraie saisie (Studio garde sa mise en page et sa valeur)
  function setEditable(el, value) {
    value = String(value ?? '');
    const want = flatText(value);
    const good = () => { const got = flatText(text(el)); return got === want || (got.length >= want.length * 0.97 && got.startsWith(want.slice(0, 30))); };
    el.focus();
    selectIn(el);
    let ok = false;
    try { ok = document.execCommand('insertText', false, value); } catch (e) { ok = false; }
    if (!ok || !good()) {
      // 2e essai : un collage, que Studio traite comme une saisie
      selectIn(el);
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', value);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }));
      } catch (e) { /* collage refusé */ }
    }
    if (!good()) {
      // dernier recours : texte écrit directement, puis signalé à Studio
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: value }));
    }
    nudge(el);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  /* ---------- Mise en page de Studio : jamais de texte qui déborde sur les blocs suivants ---------- */
  // vrai si le champ description dépasse sur le bloc qui le suit (hauteur calculée par Studio pas mise à jour)
  function overlapping() {
    const d = els().description;
    if (!visible(d)) return false;
    const bottom = d.getBoundingClientRect().bottom;
    let a = d;
    for (let depth = 0; a && a !== document.body && depth < 10; depth++, a = a.parentElement) {
      let n = a.nextElementSibling;
      while (n && (n === card?.host || !visible(n) || getComputedStyle(n).position === 'fixed' || getComputedStyle(n).position === 'absolute')) n = n.nextElementSibling;
      if (n) return n.getBoundingClientRect().top < bottom - 4;
    }
    return false;
  }

  let floating = false;
  async function healLayout({ touchField = true } = {}) {
    if (!overlapping()) return;
    const d = els().description;
    // après une écriture de TubePilot : petite frappe réelle dans la description pour que Studio se remette à jour
    if (touchField) { nudge(d); d.blur(); }
    window.dispatchEvent(new Event('resize'));
    await sleep(350);
    if (!overlapping() || floating || !card) return;
    // toujours cassé : la carte sort de la page de Studio et devient un panneau flottant
    floating = true;
    placeCard();
    window.dispatchEvent(new Event('resize'));
  }

  async function ensureTagsInput() {
    let input = els().tagsInput;
    if (visible(input)) return input;
    const root = els().root;
    const toggle = q('#toggle-button', root) || q('ytcp-video-metadata-editor #toggle-button');
    if (toggle) { toggle.click(); await sleep(800); }
    input = els().tagsInput;
    input?.scrollIntoView({ block: 'center' });
    return input;
  }

  const chipCount = () => qa(CHIP_SEL, dialog() || document).length;
  const key = (el, k, code, kc) => ['keydown', 'keypress', 'keyup'].forEach((type) => el.dispatchEvent(new KeyboardEvent(type, { key: k, code, keyCode: kc, which: kc, bubbles: true, cancelable: true })));

  async function clearTags() {
    if (!chipCount()) return true;
    const root = dialog() || document;
    const clear = q('#tags-container #clear-button', root) || q('ytcp-free-text-chip-bar #clear-button', root);
    if (clear) { clear.click(); await sleep(350); if (!chipCount()) return true; }
    for (const chip of qa(CHIP_SEL, root)) {
      const del = chip.querySelector('#delete-icon, [id*="delete" i], [aria-label*="delete" i], [aria-label*="supprimer" i], ytcp-icon-button, yt-icon');
      if (del) { del.click(); await sleep(25); }
    }
    await sleep(250);
    const input = els().tagsInput;
    if (input && chipCount()) {
      const before = chipCount();
      for (let k = 0; k < before + 3 && chipCount(); k++) {
        input.focus();
        key(input, 'Backspace', 'Backspace', 8);
        await sleep(35);
        if (k === 2 && chipCount() === before) break;
      }
    }
    return !chipCount();
  }

  let autoTyping = false;
  async function addOneTag(input, t) {
    input.focus();
    document.execCommand('insertText', false, t);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    key(input, 'Enter', 'Enter', 13);
    await sleep(40);
    if (input.value.trim().endsWith(t)) {
      document.execCommand('insertText', false, ',');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);
    }
  }

  async function setTags(tags, replace = true) {
    const input = await ensureTagsInput();
    if (!input) throw new Error(t('studio.noTagsField'));
    if (replace) await clearTags();
    const have = new Set(currentTags().map((t) => F.norm(t)));
    autoTyping = true;
    try {
      for (const t of P.fitTags(tags)) {
        if (have.has(F.norm(t))) continue;
        await addOneTag(input, t);
      }
    } finally { autoTyping = false; }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(120);
    input.blur();
    return currentTags().length;
  }

  // Applique les champs demandés ; renvoie ce qui a été écrit
  async function apply({ title, description, tags, replaceTags = true } = {}) {
    const e = els();
    const done = [];
    if (title != null) {
      if (!e.title) throw new Error(t('studio.noTitleField'));
      setEditable(e.title, P.sanitizeTitle(title));
      done.push(t('field.title'));
    }
    if (description != null) {
      if (!e.description) throw new Error(t('studio.noDescField'));
      setEditable(e.description, P.sanitizeDescription(description));
      done.push(t('field.description'));
    }
    if (tags) {
      await setTags(tags, replaceTags);
      done.push(t('field.tags'));
    }
    await healLayout();
    schedule();
    return done;
  }

  /* ---------- Fiche SEO de la vidéo affichée ---------- */
  let pack = null, packFor = '';
  async function loadPack() {
    const { key: k, vid } = keys();
    const list = F.uniq([k, vid ? 'vid:' + vid : ''].filter(Boolean)).map((x) => 'pack:' + x);
    packFor = k;
    if (!list.length) { pack = null; return; }
    const r = await chrome.storage.local.get(list);
    pack = list.map((x) => r[x]).find(Boolean) || null;
  }

  async function aliasPack(p, vid) {
    const alias = 'vid:' + vid;
    if (!vid || !p || (p.aliases || []).includes(alias)) return;
    p.aliases = F.uniq([...(p.aliases || [p.key]), alias]);
    p.source = { ...(p.source || {}), videoId: vid };
    const { packIndex = [] } = await chrome.storage.local.get('packIndex');
    const it = packIndex.find((x) => x.key === p.key);
    if (it) { it.aliases = F.uniq([...(it.aliases || [p.key]), alias]); it.videoId = vid; }
    const set = { packIndex };
    p.aliases.forEach((a) => { set['pack:' + a] = p; });
    await chrome.storage.local.set(set);
  }

  /* ---------- Moteur (page de l'extension invisible) ---------- */
  let engine = null;
  function getEngine() {
    if (engine && engine.iframe.isConnected) return engine;
    const nonce = crypto.randomUUID();
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('engine/engine.html') + '#' + nonce;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-20px;top:-20px;border:0;opacity:0;pointer-events:none';
    let resolveReady;
    const ready = new Promise((r) => { resolveReady = r; });
    engine = { iframe, nonce, ready, resolveReady };
    document.documentElement.appendChild(iframe);
    return engine;
  }

  window.addEventListener('message', (e) => {
    if (!engine || e.source !== engine.iframe.contentWindow || e.origin !== EXT_ORIGIN) return;
    const m = e.data;
    if (!m || m.tp !== 'tp-engine-out' || m.nonce !== engine.nonce) return;
    if (m.type === 'ready') engine.resolveReady();
    else onEngine(m);
  });

  let job = null, lastError = '', note = '';
  const processed = new Set();

  async function start({ file = null, youtubeUrl = '', mode = 'full', reanalyze = false, auto = false, extra = {}, runOptions = {} } = {}) {
    if (job) { UI.toast(t('studio.busy')); return { started: false }; }
    await loadSettings();
    lastError = '';
    note = '';
    const k = keys();
    const e = els();
    const packKey = file ? `file:${file.name}:${file.size}` : (mode !== 'full' && packFor) || k.key || (youtubeUrl ? 'url:' + (youtubeUrl.match(/[\w-]{11}/)?.[0] || '') : 'manual:' + Date.now());
    const ctx = {
      fileName: file?.name || domFileName() || '',
      fileSize: file?.size || 0,
      videoId: k.vid || '',
      channelId: channelId(),
      currentTitle: text(e.title),
      currentDescription: text(e.description),
      currentTags: currentTags(),
      packKey,
      // régénération seulement : la fiche affichée est reprise ; une nouvelle écoute ne réutilise jamais une autre vidéo
      aliases: mode !== 'full' && pack?.key && pack.key !== packKey ? [pack.key] : [],
      ...extra
    };
    job = { id: crypto.randomUUID(), key: packKey, auto, upload: !!dialog(), step: 'prepare', pct: null, detail: '', warn: '', initial: { title: ctx.currentTitle, description: ctx.currentDescription, tags: ctx.currentTags }, fileName: ctx.fileName };
    processed.add(packKey);
    collapsed = false;
    render();
    const eng = getEngine();
    const ok = await Promise.race([eng.ready.then(() => true), sleep(15000).then(() => false)]);
    if (!ok) { job = null; lastError = t('studio.engineDown'); render(); return { started: false, error: lastError }; }
    eng.iframe.contentWindow.postMessage({ tp: 'tp-engine', nonce: eng.nonce, type: 'run', jobId: job.id, file, youtubeUrl, ctx, options: { ...runOptions, mode: mode === 'express' ? 'express' : 'full', reanalyze } }, EXT_ORIGIN);
    return { started: true, key: packKey };
  }

  function cancel() {
    if (!job || !engine) return;
    engine.iframe.contentWindow.postMessage({ tp: 'tp-engine', nonce: engine.nonce, type: 'cancel', jobId: job.id }, EXT_ORIGIN);
    job = null;
    note = t('studio.cancelled');
    render();
  }

  async function onEngine(m) {
    if (!job || m.jobId !== job.id) return;
    if (m.type === 'progress') {
      const p = m.progress || {};
      Object.assign(job, { step: p.step, pct: p.pct ?? null, detail: p.detail || '', warn: p.warn || job.warn });
      renderProgress();
    } else if (m.type === 'done') {
      const j = job;
      job = null;
      pack = m.pack;
      packFor = j.key;
      const vid = videoId();
      if (vid) aliasPack(pack, vid).catch(() => {});
      render();
      if (settings.autofill) await autofill(j, pack);
    } else if (m.type === 'error') {
      job = null;
      lastError = m.error || t('common.unknownError');
      render();
    }
  }

  const sameTags = (a, b) => a.length === b.length && a.every((x, i) => F.norm(x) === F.norm(b[i]));

  // Fin de l'analyse : le meilleur titre, la description (avec timeline) et les tags sont écrits dans Studio.
  // Réglage « remplacer » (par défaut) : l'ancienne description et les anciens tags sont supprimés et remplacés, ainsi que
  // l'ancien titre d'une vidéo déjà en ligne ; pendant un import, le titre n'est remplacé que s'il est resté au nom du fichier.
  // Sinon, seuls les champs vides (ou le titre resté au nom du fichier) sont remplis.
  // Dans tous les cas, un champ que vous avez modifié PENDANT l'analyse n'est jamais écrasé.
  async function autofill(j, p) {
    const e = els();
    if (!e.title || !p?.seo) return;
    const replace = settings.replaceExisting !== false;
    const cur = { title: text(e.title), description: text(e.description), tags: currentTags() };
    const base = String(j.fileName || '').replace(/\.[^.]+$/, '');
    const untouched = { title: cur.title === j.initial.title, description: cur.description === j.initial.description, tags: sameTags(cur.tags, j.initial.tags) };
    const filled = [];
    let typed = false;
    const titleDefault = !j.initial.title || F.norm(j.initial.title) === F.norm(base);
    if (p.seo.titles[0]) {
      if (!untouched.title) typed = true;
      else if (titleDefault || (replace && !j.upload)) { setEditable(e.title, p.seo.titles[0].text); filled.push(t('field.title1')); }
    }
    if (e.description && p.seo.description) {
      if (!untouched.description) typed = true;
      else if (replace || !cur.description) { setEditable(e.description, p.seo.description); filled.push(t('field.description')); }
    }
    if (p.seo.tags.length) {
      if (!untouched.tags) typed = true;
      else if (replace || !cur.tags.length) {
        try { await setTags(p.seo.tags, true); filled.push(t('field.tags')); } catch (err) { /* champ tags absent */ }
      }
    }
    const replaced = replace && (j.initial.description || j.initial.tags.length);
    note = [
      filled.length ? t(replaced ? 'studio.replaced' : 'studio.autofilled', { fields: filled.join(', ') }) : '',
      typed ? t('studio.keptTyped') : '',
      !filled.length && !typed ? t('studio.notReplaced') : '',
      filled.length && !dialog() ? t('studio.saveHint') : ''
    ].filter(Boolean).join(' ');
    render();
    await healLayout();
  }

  /* ---------- Carte entre le bloc Titre et le bloc Description ---------- */
  let card = null, collapsed = false, showAll = false, fileInput = null, tab = 'titles';
  const I = globalThis.TPIcons;
  const ic = (n, s) => I.icon(n, s);

  // Emplacement de la carte : en haut de l'éditeur de Studio, AU-DESSUS du bloc titre + description
  // (jamais à l'intérieur d'un bloc dont Studio calcule la hauteur, sinon la description déborde sur la suite de la page)
  function anchorFor(e) {
    const t = e.title;
    if (!t) return null;
    const editor = t.closest('ytcp-video-metadata-editor');
    if (editor && editor.firstElementChild) return { el: editor, where: 'afterbegin' };
    if (e.description) {
      let a = t, depth = 0;
      while (a.parentElement && !a.parentElement.contains(e.description) && depth < 14) { a = a.parentElement; depth++; }
      if (a.parentElement && a.parentElement.contains(e.description) && a !== document.body) return { el: a, where: 'beforebegin' };
    }
    const block = t.closest('ytcp-video-title') || t.closest('ytcp-form-input-container') || t.closest('#title-textarea') || t.parentElement;
    return block ? { el: block, where: 'beforebegin' } : null;
  }

  const INLINE_CSS = 'display:block;width:100%;flex:0 0 auto;margin:4px 0 16px;position:relative;z-index:1;clear:both';
  const FLOAT_CSS = 'display:block;position:fixed;right:16px;bottom:16px;width:min(460px,calc(100vw - 32px));max-height:78vh;overflow:auto;z-index:2200;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.28)';
  function placeCard(anchor = anchorFor(els())) {
    if (!card) return;
    if (floating) {
      card.host.style.cssText = FLOAT_CSS;
      if (card.host.parentElement !== document.documentElement) document.documentElement.appendChild(card.host);
      return;
    }
    if (!anchor) return;
    card.host.style.cssText = INLINE_CSS;
    const placed = anchor.where === 'afterbegin' ? anchor.el.firstElementChild === card.host : anchor.el.previousElementSibling === card.host;
    if (!card.host.isConnected || !placed) {
      anchor.el.insertAdjacentElement(anchor.where, card.host);
      // la carte a changé la hauteur de la page : Studio doit l'avoir pris en compte, sinon panneau flottant
      clearTimeout(placeCard.h);
      placeCard.h = setTimeout(() => healLayout({ touchField: false }), 900);
    }
  }

  function ensureCard() {
    const e = els();
    if (!settings.studioCard || !visible(e.title)) { if (card?.host.isConnected) card.host.remove(); return false; }
    const anchor = anchorFor(e);
    if (!anchor) return false;
    if (!card) {
      card = UI.shadow('tp-studio-card');
      card.body.addEventListener('click', onClick);
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'video/*,audio/*';
      fileInput.hidden = true;
      fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; fileInput.value = ''; if (f) start({ file: f }); });
      card.root.appendChild(fileInput);
      render();
    }
    placeCard(anchor);
    card.host.classList.toggle('dark', UI.isDark());
    card.body.dir = TPI18n.dir();
    return true;
  }

  function liveScore() {
    const e = els();
    return S.scoreAll({ title: text(e.title), description: text(e.description), tags: currentTags() }, {
      keyword: pack?.seo?.mainKeyword || '',
      keywords: pack?.seo?.secondaryKeywords || [],
      duration: pack?.ctx?.duration || 0,
      isMusic: /music/.test(pack?.analysis?.content_type || '')
    });
  }

  const STEPS = ['prepare', 'gemini', 'analyze', 'keywords', 'trends', 'competition', 'seo'];

  function progressHtml() {
    if (!job) return '';
    const order = STEPS;
    const idx = Math.max(0, order.indexOf(job.step));
    const pct = job.pct != null ? Math.round(job.pct * 100) : null;
    return `<div class="tp-progress" data-part="progress">
      <div class="tp-row tp-row--nowrap"><span class="tp-spinner"></span><b>${esc(t('step.' + job.step))}</b>${pct != null ? `<span class="tp-faint">${pct}%</span>` : ''}
        <span class="tp-grow tp-ellipsis tp-small tp-muted">${esc(job.detail || '')}</span>
        <button class="tp-btn tp-btn--ghost tp-btn--sm" data-act="cancel">${ic('x', 14)} ${esc(t('common.cancel'))}</button></div>
      <div class="tp-bar ${pct == null ? 'tp-bar--indet' : ''}"><i style="width:${pct ?? 30}%"></i></div>
      <div class="tp-steps">${order.map((s, i) => `<span class="tp-step ${i < idx ? 'tp-step--done' : i === idx ? 'tp-step--on' : ''}">${i < idx ? ic('check', 12) : ''}${esc(t('step.' + s))}</span>`).join('')}</div>
      ${job.warn ? `<div class="tp-alert tp-alert--warn">${ic('alert', 14)}<span>${esc(job.warn)}</span></div>` : ''}
    </div>`;
  }

  function renderProgress() {
    const el = card?.body.querySelector('[data-part="progress"]');
    if (el) el.outerHTML = progressHtml();
    else render();
  }

  // puces de l'écoute : style, tempo, tonalité, ambiance, langue, meilleur moment
  function insightChips(a) {
    if (!a) return '';
    const m = a.music || {};
    const hot = (a.highlights || [])[0];
    const chips = [
      m.primary_genre && `<span class="tp-chip tp-chip--accent">${ic('music', 13)}<b class="tp-bidi">${esc(m.primary_genre)}</b>${m.fusion ? ` × ${esc(m.fusion)}` : ''}</span>`,
      (m.bpm || pack?.ctx?.localBpm) && `<span class="tp-chip">${ic('clock', 13)}${Math.round(m.bpm || pack.ctx.localBpm)} BPM${m.time_signature ? ' · ' + esc(m.time_signature) : ''}</span>`,
      (m.key || m.scale_or_maqam) && `<span class="tp-chip">${esc([m.key, m.scale_or_maqam].filter(Boolean).join(' · '))}</span>`,
      m.mood?.length && `<span class="tp-chip">${esc(m.mood.slice(0, 2).join(', '))}</span>`,
      a.dialect || a.language ? `<span class="tp-chip">${ic('globe', 13)}${esc(a.dialect || a.language)}</span>` : '',
      hot && `<span class="tp-chip tp-chip--hot">${ic('flame', 13)}${F.ts(hot.start)} <span class="tp-bidi">${esc(hot.label)}</span></span>`
    ].filter(Boolean);
    return chips.length ? `<div class="tp-chips">${chips.join('')}</div>` : '';
  }

  function issuesHtml(list) {
    if (!list.length) return `<div class="tp-alert tp-alert--good">${ic('shield', 14)}<span>${esc(t('policy.allGood'))}</span></div>`;
    const icon = { error: 'alert', warn: 'alert', info: 'info' };
    return `<ul class="tp-issues">${list.map((i) => `<li class="${i.level}">${ic(icon[i.level], 14)}<span>${esc(i.msg)}${i.ref ? ` <a href="${esc(i.ref)}" target="_blank" rel="noopener">${esc(t('policy.help'))}</a>` : ''}</span></li>`).join('')}</ul>`;
  }

  function tabBody(s, issues, curTitle) {
    if (tab === 'titles') {
      const titles = showAll ? s.titles : s.titles.slice(0, 5);
      return `<div class="tp-list">${titles.map((x) => {
        const i = s.titles.indexOf(x);
        const on = F.norm(x.text) === F.norm(curTitle);
        return `<div class="tp-item tp-item--click ${on ? 'tp-item--on' : ''}" data-act="title" data-i="${i}" title="${esc(x.angle || t('studio.clickToApply'))}">
          ${I.pill(x.score, t('score.title'))}
          <div class="tp-item__main"><div class="tp-item__title tp-bidi">${esc(x.text)}</div>${x.hook ? `<div class="tp-item__meta">${esc(x.hook)}</div>` : ''}</div>
          <div class="tp-item__act">${on ? `<span class="tp-chip tp-chip--good">${ic('check', 12)}${esc(t('studio.applied'))}</span>` : `<span class="tp-btn tp-btn--sm">${esc(t('studio.apply'))}</span>`}</div>
        </div>`;
      }).join('')}</div>
      ${s.titles.length > 5 ? `<button class="tp-btn tp-btn--ghost tp-btn--sm" data-act="more">${esc(showAll ? t('studio.fewerTitles') : t('studio.moreTitles', { n: s.titles.length - 5 }))}</button>` : ''}
      ${s.abTitles?.length ? `<details class="tp-small"><summary class="tp-muted">${ic('layers', 13)} ${esc(t('studio.abTitles'))}</summary><div class="tp-list" style="margin-top:6px">${s.abTitles.map((x) => `<div class="tp-item">${I.pill(x.score)}<div class="tp-item__main tp-bidi">${esc(x.text)}</div></div>`).join('')}</div></details>` : ''}`;
    }
    if (tab === 'description') {
      return `<div class="tp-pre">${esc(s.description)}</div>
        <div class="tp-row"><button class="tp-btn tp-btn--primary tp-btn--sm" data-act="desc">${ic('upload', 14)} ${esc(t('studio.insertDescription'))}</button>
        <button class="tp-btn tp-btn--sm" data-act="copy" data-what="description">${ic('copy', 14)} ${esc(t('common.copy'))}</button>
        <span class="tp-grow"></span><span class="tp-counter">${s.description.length}/5000</span></div>`;
    }
    if (tab === 'tags') {
      const len = P.tagsLength(s.tags);
      return `<div class="tp-chips">${s.tags.map((x) => `<span class="tp-chip tp-bidi">${esc(x)}</span>`).join('')}</div>
        <div class="tp-row"><span class="tp-small tp-muted">${ic('hash', 13)} ${s.hashtags.map(esc).join(' ')}</span></div>
        <div class="tp-row"><button class="tp-btn tp-btn--primary tp-btn--sm" data-act="tags">${ic('upload', 14)} ${esc(t('studio.insertTags'))}</button>
        <button class="tp-btn tp-btn--sm" data-act="copy" data-what="tags">${ic('copy', 14)} ${esc(t('common.copy'))}</button>
        <button class="tp-btn tp-btn--sm" data-act="copy" data-what="hashtags">${ic('hash', 14)} ${esc(t('studio.copyHashtags'))}</button>
        <span class="tp-grow"></span><span class="tp-counter ${len > 500 ? 'tp-counter--over' : ''}">${len}/500</span></div>`;
    }
    if (tab === 'insights') {
      const a = pack.analysis;
      const c = pack.competition;
      return `${a?.summary ? `<div class="tp-small tp-muted">${esc(a.summary)}</div>` : ''}
        ${a?.music?.hook_line ? `<div class="tp-row tp-small">${ic('mic', 14)}<span>${esc(t('insight.hook'))} « <b class="tp-bidi">${esc(a.music.hook_line)}</b> »${a.music.hook_start != null ? ` · ${F.ts(a.music.hook_start)}` : ''}</span></div>` : ''}
        ${a?.highlights?.length ? `<div class="tp-list">${a.highlights.map((h) => `<div class="tp-item"><span class="tp-chip tp-chip--hot">${ic('flame', 12)}${F.ts(h.start)}</span><div class="tp-item__main"><div class="tp-item__title tp-bidi">${esc(h.label)}</div><div class="tp-item__meta">${esc(h.why || h.kind || '')}</div></div></div>`).join('')}</div>` : ''}
        ${s.mainKeyword ? `<div class="tp-row tp-small">${ic('key', 14)}<span>${esc(t('insight.mainKeyword'))} <b class="tp-bidi">${esc(s.mainKeyword)}</b></span>${c ? `<span class="tp-faint">${esc(t('insight.demand'))} ${c.demand}/100 · ${esc(t('insight.competition'))} ${c.competition}/100</span>` : ''}</div>` : ''}
        ${s.chapters?.length ? `<details class="tp-small"><summary class="tp-muted">${ic('clock', 13)} ${esc(t('studio.timeline', { n: s.chapters.length }))}</summary><div class="tp-pre" style="margin-top:6px">${s.chapters.map((x) => `${F.ts(x.t)} ${esc(x.label)}`).join('\n')}</div></details>` : ''}`;
    }
    if (tab === 'comment') {
      const vid = keys().vid;
      if (!s.pinnedComment) return `<div class="tp-small tp-muted">${esc(t('studio.noComment'))}</div>`;
      return `<div class="tp-pre tp-bidi">${esc(s.pinnedComment)}</div>
        <div class="tp-row"><button class="tp-btn tp-btn--primary tp-btn--sm" data-act="copy" data-what="pinned">${ic('copy', 14)} ${esc(t('studio.copyComment'))}</button>
        ${vid ? `<a class="tp-btn tp-btn--sm" href="https://www.youtube.com/watch?v=${esc(vid)}" target="_blank" rel="noopener">${ic('external', 14)} ${esc(t('studio.openVideo'))}</a>` : ''}</div>
        <div class="tp-help">${ic('info', 13)} ${esc(t('studio.pinHint'))}</div>`;
    }
    return issuesHtml(issues);
  }

  function render() {
    if (!card) return;
    const k = keys();
    const live = liveScore();
    const f = k.file;
    const s = pack?.seo;
    const e = els();
    const curTitle = text(e.title);
    const issues = P.checkAll({ title: curTitle, description: text(e.description), tags: currentTags() }, { duration: pack?.ctx?.duration, aiGenerated: !!profile().aiGenerated, officialArtist: !!profile().officialArtist, isCover: !!pack?.analysis?.is_cover });
    const important = issues.filter((i) => i.level !== 'info').length;
    const source = f ? `${ic('file', 13)} ${esc(t('studio.fileCaptured', { name: f.name, mb: (f.size / 1048576).toFixed(1) }))}`
      : k.vid ? `${ic('video', 13)} ${esc(t('studio.videoNoFile', { id: k.vid }))}` : '';
    let body;
    if (job) body = progressHtml();
    else if (!s) {
      body = `<div class="tp-row tp-row--nowrap" style="align-items:flex-start">
          <div class="tp-acc__icon" style="width:36px;height:36px">${ic('sparkles', 18)}</div>
          <div class="tp-grow tp-stack tp-stack--sm">
            <div><b>${esc(t('studio.heroTitle'))}</b><div class="tp-small tp-muted">${esc(t('studio.heroWeb'))}</div></div>
            ${source ? `<div class="tp-small tp-faint tp-ellipsis">${source}</div>` : ''}
            <div class="tp-row">
              ${f ? `<button class="tp-btn tp-btn--primary" data-act="run">${ic('sparkles', 15)} ${esc(t('studio.analyze'))}</button>`
                : k.vid ? `<button class="tp-btn tp-btn--primary" data-act="auto" title="${esc(t('studio.analyzeLinkHint'))}">${ic('sparkles', 15)} ${esc(t('studio.analyze'))}</button><button class="tp-btn" data-act="pick">${ic('upload', 15)} ${esc(t('studio.pickFile'))}</button>`
                  : `<button class="tp-btn tp-btn--primary" data-act="pick">${ic('upload', 15)} ${esc(t('studio.pickFile'))}</button>`}
              <button class="tp-btn tp-btn--ghost" data-act="express" title="${esc(t('studio.quickHint'))}">${ic('zap', 15)} ${esc(t('studio.quick'))}</button>
            </div>
          </div>
        </div>`;
    } else {
      const tabs = [
        ['titles', 'sparkles', t('tab.titles'), s.titles.length],
        ['description', 'file', t('tab.description')],
        ['tags', 'tag', t('tab.tags'), s.tags.length],
        ['comment', 'message', t('tab.comment')],
        ['insights', 'music', t('tab.insights')],
        ['policy', 'shield', t('tab.policy'), important || '']
      ];
      body = `${insightChips(pack.analysis)}
        <div class="tp-tabs" role="tablist">${tabs.map(([id, icon, label, n]) => `<button class="tp-tab" role="tab" aria-selected="${tab === id}" data-act="tab" data-tab="${id}">${ic(icon, 14)}${esc(label)}${n !== undefined && n !== '' ? `<span class="tp-count">${n}</span>` : ''}</button>`).join('')}</div>
        <div class="tp-stack">${tabBody(s, issues, curTitle)}</div>
        <div class="tp-row" style="border-top:1px solid var(--tp-border);padding-top:10px">
          <button class="tp-btn tp-btn--primary" data-act="all">${ic('check', 15)} ${esc(t('studio.applyAll'))}</button>
          <button class="tp-btn" data-act="regen" title="${esc(t('studio.regenHint'))}">${ic('refresh', 15)} ${esc(t('studio.regen'))}</button>
          ${f ? `<button class="tp-btn tp-btn--ghost" data-act="reanalyze">${ic('mic', 15)} ${esc(t('studio.relisten'))}</button>` : ''}
          <span class="tp-grow"></span>
          ${source ? `<span class="tp-tiny tp-faint tp-ellipsis" style="max-width:40%">${source}</span>` : ''}
        </div>`;
    }
    card.body.innerHTML = `<div class="tp-card tp-studio">
      <div class="tp-card__head">
        ${I.logo(22)}<b class="tp-brand">TubePilot</b>
        ${I.ring(live.score, 34, t('score.overall'))}
        <div class="tp-subscores"><span>${esc(t('score.titleShort'))} <b>${live.title.score}</b></span><span>${esc(t('score.descShort'))} <b>${live.description.score}</b></span><span>${esc(t('score.tagsShort'))} <b>${live.tags.score}</b></span></div>
        <span class="tp-grow"></span>
        <button class="tp-btn tp-btn--ghost tp-btn--sm" data-act="panel" title="${esc(t('studio.openPanel'))}">${ic('panel', 14)}<span class="tp-hide-narrow">${esc(t('studio.openPanel'))}</span></button>
        <button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-act="collapse" title="${esc(collapsed ? t('common.expand') : t('common.collapse'))}">${ic(collapsed ? 'down' : 'x', 14)}</button>
      </div>
      <div class="tp-card__body ${collapsed ? 'tp-hidden' : ''}">
        ${lastError ? `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(lastError)}</span></div>` : ''}
        ${note ? `<div class="tp-alert tp-alert--good">${ic('check', 14)}<span>${esc(note)}</span></div>` : ''}
        ${body}
      </div>
    </div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const s = pack?.seo;
    try {
      if (act === 'collapse') { collapsed = !collapsed; render(); return; }
      if (act === 'tab') { tab = b.dataset.tab; render(); return; }
      if (act === 'panel') { UI.openPanel({ tab: 'video' }); return; }
      if (act === 'options') { UI.send('openOptions').catch(() => {}); return; }
      if (act === 'run') start({ file: keys().file });
      else if (act === 'reanalyze') start({ file: keys().file, reanalyze: true });
      else if (act === 'pick') fileInput.click();
      else if (act === 'auto') start({});
      else if (act === 'express' || act === 'regen') start({ mode: 'express' });
      else if (act === 'cancel') cancel();
      else if (act === 'more') { showAll = !showAll; }
      else if (act === 'title' && s) { await apply({ title: s.titles[+b.dataset.i].text }); UI.toast(t('toast.titleApplied')); }
      else if (act === 'desc' && s) { await apply({ description: s.description }); UI.toast(t('toast.descInserted')); }
      else if (act === 'tags' && s) { await apply({ tags: s.tags }); UI.toast(t('toast.tagsInserted')); }
      else if (act === 'all' && s) { const d = await apply({ title: s.titles[0].text, description: s.description, tags: s.tags }); UI.toast(t('toast.inserted', { fields: d.join(', ') })); }
      else if (act === 'copy' && s) {
        const v = { hashtags: s.hashtags.join(' '), pinned: s.pinnedComment, description: s.description, tags: s.tags.join(', ') }[b.dataset.what] || '';
        await UI.copy(v);
        UI.toast(t('toast.copied'));
      }
    } catch (e) {
      UI.toast(e.message, 5000, 'alert');
    }
    render();
  }

  /* ---------- Suggestions de tags pendant la saisie (vraies recherches YouTube) ---------- */
  let sug = null, sugTimer = 0, sugReq = 0;
  const tagsField = (el) => el instanceof HTMLInputElement && !!el.closest('#tags-container, ytcp-free-text-chip-bar');
  function hideSug() { if (sug) sug.host.style.display = 'none'; }
  async function showSug(input) {
    const q0 = input.value.replace(/,+$/, '').trim();
    if (q0.length < 2 || autoTyping) return hideSug();
    const my = ++sugReq;
    let list = [];
    const prof = profile();
    const hl = F.script(q0) === 'arabic' ? 'ar' : String(prof.languages || 'fr').split(/[,\s]+/)[0] || 'fr';
    try { list = await UI.send('suggest', { q: q0, hl, gl: prof.country || '' }); } catch (e) { return; }
    if (my !== sugReq || document.activeElement !== input || autoTyping) return;
    const have = new Set(currentTags().map((t) => F.norm(t)));
    list = (list || []).filter((x) => !have.has(F.norm(x))).slice(0, 8);
    if (!list.length) return hideSug();
    if (!sug) {
      sug = UI.shadow('tp-tag-sug');
      sug.host.style.cssText = 'position:fixed;z-index:2147483646';
      document.documentElement.appendChild(sug.host);
      sug.body.addEventListener('mousedown', (e) => e.preventDefault());
    }
    sug.host.classList.toggle('dark', UI.isDark());
    sug.body.innerHTML = `<div class="tp-card tp-sug"><div class="tp-sug-h">${globalThis.TPIcons.logo(16)}<span>${esc(t('sug.head'))}</span></div>${list.map((x, i) => `<button data-t="${esc(x)}">${globalThis.TPIcons.pill(Math.max(20, 95 - i * 9), t('sug.popularity'))}<span class="tp-bidi">${esc(x)}</span></button>`).join('')}</div>`;
    sug.body.onclick = async (e) => {
      const btn = e.target.closest('button[data-t]');
      if (!btn) return;
      input.select?.();
      document.execCommand('delete');
      input.value = '';
      hideSug();
      autoTyping = true;
      try { await addOneTag(input, btn.dataset.t); } finally { autoTyping = false; }
      input.focus();
    };
    const r = input.getBoundingClientRect();
    sug.host.style.left = Math.max(8, r.left) + 'px';
    sug.host.style.top = r.bottom + 4 + 'px';
    sug.host.style.display = '';
  }
  document.addEventListener('input', (e) => {
    if (tagsField(e.target) && settings.tagSuggest && !autoTyping) {
      clearTimeout(sugTimer);
      sugTimer = setTimeout(() => showSug(e.target), 300);
    }
    if (card && (e.target.id === 'textbox' || tagsField(e.target))) schedule();
  }, true);
  document.addEventListener('focusout', (e) => { if (tagsField(e.target)) setTimeout(hideSug, 150); }, true);

  /* ---------- Pilote automatique : l'import d'une vidéo lance l'analyse ---------- */
  async function autopilot() {
    if (!settings.autopilot || job) return;
    if (!dialog()) return;
    const k = keys();
    if (!k.file || processed.has(k.key) || !visible(els().title)) return;
    processed.add(k.key);
    const r = await chrome.storage.local.get('pack:' + k.key);
    if (r['pack:' + k.key]) { await loadPack(); render(); return; }
    start({ file: k.file, auto: true });
  }

  /* ---------- Boucle : Studio est une application qui redessine souvent la page ---------- */
  let timer = 0, lastSig = '', observer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, 250);
  }

  async function tick() {
    if (!UI.alive()) { teardown(); return; }
    hookFileInputs();
    const shown = ensureCard();
    if (!shown) return;
    const k = keys();
    if (k.key !== packFor) { await loadPack(); lastError = ''; note = ''; }
    const e = els();
    const sig = [packFor, text(e.title), text(e.description).length, currentTags().join('|'), !!pack, !!job].join('¦');
    if (sig !== lastSig) { lastSig = sig; if (!job) render(); }
    autopilot();
  }

  function teardown() {
    observer?.disconnect();
    clearInterval(interval);
    card?.host.remove();
    sug?.host.remove();
  }

  chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m?.type === 'studio:context') {
      const k = keys();
      const e = els();
      sendResponse({ ok: true, data: {
        page: 'studio', uploading: !!dialog(), editing: !!e.title, videoId: k.vid || '', channelId: channelId(),
        fileName: k.file?.name || domFileName() || '', fileSize: k.file?.size || 0, hasFile: !!k.file, packKey: packFor || k.key,
        title: text(e.title), description: text(e.description), tags: currentTags(),
        job: job ? { step: job.step, pct: job.pct, detail: job.detail } : null, error: lastError
      } });
      return false;
    }
    if (m?.type === 'studio:apply') {
      apply(m.fields || {}).then((d) => sendResponse({ ok: true, data: d }), (e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    if (m?.type === 'studio:run') {
      const k = keys();
      const o = m.options || {};
      if (o.mode !== 'express' && !k.file && !o.youtubeUrl && !k.vid) { sendResponse({ ok: false, error: t('studio.noFileCaptured') }); return false; }
      start({ file: o.mode === 'express' ? null : k.file, youtubeUrl: o.youtubeUrl || '', mode: o.mode, reanalyze: !!o.reanalyze, extra: o.extra || {}, runOptions: o.runOptions || {} })
        .then((r) => sendResponse(r.started ? { ok: true, data: r } : { ok: false, error: r.error || t('studio.busy') }));
      return true;
    }
    if (m?.type === 'studio:cancel') { cancel(); sendResponse({ ok: true, data: true }); return false; }
    return false;
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !UI.alive()) return;
    if (ch.settings) loadSettings().then(() => { lastSig = ''; schedule(); });
    const k = keys();
    const mine = [packFor, k.key, k.vid ? 'vid:' + k.vid : ''].filter(Boolean).map((x) => 'pack:' + x);
    if (!job && mine.some((x) => ch[x])) loadPack().then(render);
  });

  const interval = setInterval(tick, 1500);
  loadSettings().then(() => {
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    tick();
  });
})();
