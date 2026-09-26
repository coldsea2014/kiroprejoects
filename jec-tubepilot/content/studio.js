// JEC TubePilot — YouTube Studio : carte sous le titre, pilote automatique à l'import, score en direct, insertion titre / description / tags
(function () {
  'use strict';
  if (window.__tpStudioAlive?.()) return;
  const UI = globalThis.TPUI, F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo;
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
    settings = { autopilot: true, autofill: true, studioCard: true, tagSuggest: true, ...s };
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
  function setEditable(el, value) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, value);
    if (!ok || text(el) !== String(value).trim()) el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
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
    if (!input) throw new Error('Champ « Tags » introuvable : ouvrez les détails de la vidéo et cliquez « Afficher plus ».');
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
      if (!e.title) throw new Error('Champ « Titre » introuvable : ouvrez la page Détails de la vidéo dans Studio.');
      setEditable(e.title, P.sanitizeTitle(title));
      done.push('titre');
    }
    if (description != null) {
      if (!e.description) throw new Error('Champ « Description » introuvable.');
      setEditable(e.description, P.sanitizeDescription(description));
      done.push('description');
    }
    if (tags) {
      await setTags(tags, replaceTags);
      done.push('tags');
    }
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
    if (job) { UI.toast('Une analyse est déjà en cours.'); return { started: false }; }
    await loadSettings();
    lastError = '';
    note = '';
    if (!settings.geminiKey) {
      lastError = 'Ajoutez votre clé Gemini (gratuite) dans les réglages de JEC TubePilot pour que Gemini écoute et analyse la vidéo.';
      render();
      return { started: false, error: lastError };
    }
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
      aliases: pack?.key && pack.key !== packKey ? [pack.key] : [],
      ...extra
    };
    job = { id: crypto.randomUUID(), key: packKey, auto, step: 'prepare', pct: null, detail: '', warn: '', initial: { title: ctx.currentTitle, description: ctx.currentDescription, tags: ctx.currentTags }, fileName: ctx.fileName };
    processed.add(packKey);
    collapsed = false;
    render();
    const eng = getEngine();
    const ok = await Promise.race([eng.ready.then(() => true), sleep(15000).then(() => false)]);
    if (!ok) { job = null; lastError = 'Le moteur TubePilot ne démarre pas : rechargez la page Studio (F5).'; render(); return { started: false, error: lastError }; }
    eng.iframe.contentWindow.postMessage({ tp: 'tp-engine', nonce: eng.nonce, type: 'run', jobId: job.id, file, youtubeUrl, ctx, options: { ...runOptions, mode: mode === 'express' ? 'express' : 'full', reanalyze } }, EXT_ORIGIN);
    return { started: true, key: packKey };
  }

  function cancel() {
    if (!job || !engine) return;
    engine.iframe.contentWindow.postMessage({ tp: 'tp-engine', nonce: engine.nonce, type: 'cancel', jobId: job.id }, EXT_ORIGIN);
    job = null;
    note = 'Analyse annulée.';
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
      lastError = m.error || 'Erreur inconnue.';
      render();
    }
  }

  const sameTags = (a, b) => a.length === b.length && a.every((x, i) => F.norm(x) === F.norm(b[i]));

  // Remplit seulement les champs vides ou restés au nom du fichier — ce que vous avez tapé n'est jamais remplacé
  async function autofill(j, p) {
    const e = els();
    if (!e.title || !p?.seo) return;
    const cur = { title: text(e.title), description: text(e.description), tags: currentTags() };
    const base = String(j.fileName || '').replace(/\.[^.]+$/, '');
    const filled = [];
    const titleDefault = !j.initial.title || F.norm(j.initial.title) === F.norm(base);
    if (cur.title === j.initial.title && titleDefault && p.seo.titles[0]) { setEditable(e.title, p.seo.titles[0].text); filled.push('titre n°1'); }
    if (e.description && cur.description === j.initial.description && !cur.description) { setEditable(e.description, p.seo.description); filled.push('description'); }
    if (sameTags(cur.tags, j.initial.tags) && !cur.tags.length && p.seo.tags.length) {
      try { await setTags(p.seo.tags, false); filled.push('tags'); } catch (err) { /* champ tags absent */ }
    }
    note = filled.length
      ? `✅ Rempli automatiquement : ${filled.join(', ')}. Vérifiez, puis « Suivant » / « Enregistrer ».`
      : 'Vos champs contiennent déjà du texte : rien n\'a été remplacé. Cliquez sur un titre ou sur « Tout insérer ».';
    render();
  }

  /* ---------- Carte sous le champ Titre ---------- */
  let card = null, collapsed = false, showAll = false, fileInput = null;

  function ensureCard() {
    const e = els();
    if (!settings.studioCard || !visible(e.title)) { if (card?.host.isConnected) card.host.remove(); return false; }
    const anchor = e.title.closest('ytcp-video-title') || e.title.closest('#title-textarea') || e.title.closest('ytcp-social-suggestions-textbox') || e.title.parentElement;
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
    if (!card.host.isConnected || card.host.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', card.host);
    card.host.classList.toggle('dark', UI.isDark());
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

  const STEP_LABELS = { prepare: 'Préparation', upload: 'Envoi à Gemini', processing: 'Traitement Google', analyze: 'Écoute & analyse', keywords: 'Recherches YouTube', trends: 'Tendances', competition: 'Concurrents', seo: 'Rédaction SEO' };

  function progressHtml() {
    if (!job) return '';
    const order = Object.keys(STEP_LABELS);
    const idx = order.indexOf(job.step);
    const pct = job.pct != null ? Math.round(job.pct * 100) : null;
    return `<div class="tp-progress" data-part="progress">
      <div class="tp-row"><b>${esc(STEP_LABELS[job.step] || job.step || '…')}</b>${pct != null ? `<span class="tp-muted">${pct} %</span>` : ''}<span class="tp-muted tp-small">${esc(job.detail || '')}</span><span class="tp-sp"></span><button class="tp-ghost" data-act="cancel">✕ Annuler</button></div>
      <div class="tp-bar ${pct == null ? 'tp-indet' : ''}"><i style="width:${pct ?? 30}%"></i></div>
      <div class="tp-steps">${order.map((s, i) => `<span class="${i < idx ? 'ok' : i === idx ? 'on' : ''}">${i < idx ? '✓ ' : ''}${esc(STEP_LABELS[s])}</span>`).join('')}</div>
      ${job.warn ? `<div class="tp-muted tp-small">⚠️ ${esc(job.warn)}</div>` : ''}
    </div>`;
  }

  function renderProgress() {
    const el = card?.body.querySelector('[data-part="progress"]');
    if (el) el.outerHTML = progressHtml();
    else render();
  }

  function analysisLine(a) {
    if (!a) return '';
    const m = a.music || {};
    const bits = [
      m.primary_genre && `🎵 <b>${esc(m.primary_genre)}</b>${m.fusion ? ` × ${esc(m.fusion)}` : ''}${m.regional_style ? ` (${esc(m.regional_style)})` : ''}`,
      m.rhythm_pattern && `🥁 ${esc(m.rhythm_pattern)}`,
      (m.bpm || pack?.ctx?.localBpm) && `⏱ ${Math.round(m.bpm || pack.ctx.localBpm)} BPM`,
      m.time_signature && esc(m.time_signature),
      (m.key || m.scale_or_maqam) && `🎼 ${esc([m.key, m.scale_or_maqam].filter(Boolean).join(' · '))}`,
      m.mood?.length && `💫 ${esc(m.mood.slice(0, 3).join(', '))}`,
      m.vocals && `🎤 ${esc(m.vocals.slice(0, 60))}`,
      a.language && `🗣 ${esc(a.language)}`
    ].filter(Boolean);
    return bits.length ? `<div class="tp-row tp-small">${bits.join(' <span class="tp-muted">·</span> ')}</div>` : '';
  }

  function issuesHtml(list) {
    if (!list?.length) return '';
    const important = list.filter((i) => i.level !== 'info').length;
    return `<details><summary>🛡️ Règlement YouTube : ${important ? `${important} point(s) à corriger` : 'conforme'} ${list.length - important ? `· ${list.length - important} conseil(s)` : ''}</summary>
      <ul class="tp-issues">${list.map((i) => `<li class="${i.level}">${esc(i.msg)}${i.ref ? ` <a href="${esc(i.ref)}" target="_blank" rel="noopener">Aide YouTube</a>` : ''}</li>`).join('')}</ul></details>`;
  }

  function render() {
    if (!card) return;
    const k = keys();
    const live = liveScore();
    const hasKey = !!settings.geminiKey;
    const f = k.file;
    const src = f ? `🎬 Fichier capté : <b>${esc(f.name)}</b> <span class="tp-muted">(${(f.size / 1048576).toFixed(1)} Mo)</span>`
      : k.vid ? `🎬 Vidéo <b>${esc(k.vid)}</b> <span class="tp-muted">— fichier non capté</span>` : '';
    const s = pack?.seo;
    const titles = s ? (showAll ? s.titles : s.titles.slice(0, 5)) : [];
    const curTitle = text(els().title);
    const issues = P.checkAll({ title: curTitle, description: text(els().description), tags: currentTags() }, { duration: pack?.ctx?.duration, aiGenerated: !!profile().aiGenerated, officialArtist: !!profile().officialArtist, isCover: !!pack?.analysis?.is_cover });
    card.body.innerHTML = `<div class="tp-card">
      <div class="tp-head">
        ${UI.logo()}<b>JEC TubePilot</b>
        ${UI.badge(live.score, 'Score d\'optimisation actuel')}
        <span class="tp-sub"><span>Titre <b>${live.title.score}</b></span><span>Description <b>${live.description.score}</b></span><span>Tags <b>${live.tags.score}</b></span></span>
        <span class="tp-sp"></span>
        <button class="tp-ghost" data-act="panel" title="Ouvrir le panneau complet">⧉ Panneau</button>
        <button class="tp-ghost" data-act="collapse" title="Réduire">${collapsed ? '▸' : '▾'}</button>
      </div>
      <div class="tp-body ${collapsed ? 'tp-hidden' : ''}">
        ${src ? `<div class="tp-small">${src}</div>` : ''}
        ${!hasKey ? `<div class="tp-note">🔑 Ajoutez votre <b>clé Gemini gratuite</b> pour que Gemini écoute et regarde vos vidéos (même privées). <button class="tp-link" data-act="options">Ouvrir les réglages</button></div>` : ''}
        ${job ? progressHtml() : `<div class="tp-row">
          ${f ? '<button class="tp-primary" data-act="run">🎧 Analyser la vidéo & générer</button>' : '<button class="tp-primary" data-act="pick">📁 Choisir le fichier de cette vidéo</button>'}
          ${!f && k.vid ? '<button data-act="url" title="Seulement pour une vidéo PUBLIQUE">🔗 Via le lien public</button>' : ''}
          ${pack ? '<button data-act="regen" title="Nouveaux titres et description, sans réécouter">🔁 Régénérer le SEO</button>' : '<button data-act="express" title="Sans écoute : à partir du nom du fichier et de vos notes">⚡ Express</button>'}
          ${pack?.analysis && f ? '<button class="tp-ghost" data-act="reanalyze">↻ Réécouter</button>' : ''}
        </div>`}
        ${lastError ? `<div class="tp-alert">⚠️ ${esc(lastError)}</div>` : ''}
        ${note ? `<div class="tp-note">${esc(note)}</div>` : ''}
        ${s ? `
          ${analysisLine(pack.analysis)}
          ${pack.analysis?.music?.hook_line ? `<div class="tp-small">🎤 Refrain : « <b>${esc(pack.analysis.music.hook_line)}</b> »${pack.analysis.music.hook_start != null ? ` à ${F.ts(pack.analysis.music.hook_start)}` : ''}</div>` : ''}
          ${pack.analysis?.highlights?.length ? `<div class="tp-small">🔥 Meilleurs moments : ${pack.analysis.highlights.map((h) => `<b>${F.ts(h.start)}</b> ${esc(h.label)}`).join(' · ')}</div>` : ''}
          ${s.mainKeyword ? `<div class="tp-small">🔑 Mot-clé principal : « <b>${esc(s.mainKeyword)}</b> »${pack.competition ? ` <span class="tp-muted">· demande ${pack.competition.demand}/100 · concurrence ${pack.competition.competition}/100</span>` : ''}</div>` : ''}
          <div class="tp-titles">${titles.map((t, i) => `<div class="tp-title ${F.norm(t.text) === F.norm(curTitle) ? 'tp-applied' : ''}" data-act="title" data-i="${s.titles.indexOf(t)}" title="${esc(t.angle || 'Cliquer pour appliquer')}">
            ${UI.badge(t.score, 'Score SEO du titre')}<span class="tp-t">${esc(t.text)}</span><span class="tp-hook">${esc(t.hook || '')}</span></div>`).join('')}
            ${s.titles.length > 5 ? `<button class="tp-link" data-act="more">${showAll ? 'Moins de titres' : `+ ${s.titles.length - 5} autres titres`}</button>` : ''}
          </div>
          <div class="tp-row">
            <button class="tp-primary" data-act="all">✅ Tout insérer</button>
            <button data-act="desc">📝 Description</button>
            <button data-act="tags">🏷️ Tags (${s.tags.length} · ${P.tagsLength(s.tags)}/500)</button>
            <button data-act="copy" data-what="hashtags" title="${esc(s.hashtags.join(' '))}"># Hashtags</button>
            ${s.pinnedComment ? '<button data-act="copy" data-what="pinned">💬 Commentaire épinglé</button>' : ''}
          </div>
          ${s.chapters?.length ? `<details><summary>⏱️ Timeline / chapitres (${s.chapters.length}) — déjà dans la description</summary><div class="tp-small">${s.chapters.map((c) => `${F.ts(c.t)} ${esc(c.label)}`).join('<br>')}</div></details>` : ''}
          ${s.abTitles?.length ? `<details><summary>🧪 Titres pour « Tester et comparer »</summary><div class="tp-small">${s.abTitles.map((t) => `${UI.badge(t.score)} ${esc(t.text)}`).join('<br>')}</div></details>` : ''}
        ` : ''}
        ${issuesHtml(issues)}
      </div>
    </div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const s = pack?.seo;
    try {
      if (act === 'collapse') { collapsed = !collapsed; render(); }
      else if (act === 'panel') UI.openPanel({ tab: 'video' });
      else if (act === 'options') UI.send('openOptions').catch(() => {});
      else if (act === 'run') start({ file: keys().file });
      else if (act === 'reanalyze') start({ file: keys().file, reanalyze: true });
      else if (act === 'pick') fileInput.click();
      else if (act === 'url') start({ youtubeUrl: 'https://www.youtube.com/watch?v=' + keys().vid });
      else if (act === 'express' || act === 'regen') start({ mode: 'express' });
      else if (act === 'cancel') cancel();
      else if (act === 'more') { showAll = !showAll; render(); }
      else if (act === 'title' && s) { await apply({ title: s.titles[+b.dataset.i].text }); UI.toast('Titre appliqué ✓'); }
      else if (act === 'desc' && s) { await apply({ description: s.description }); UI.toast('Description insérée ✓'); }
      else if (act === 'tags' && s) { await apply({ tags: s.tags }); UI.toast('Tags insérés ✓'); }
      else if (act === 'all' && s) { const d = await apply({ title: s.titles[0].text, description: s.description, tags: s.tags }); UI.toast('Inséré : ' + d.join(', ') + ' ✓'); }
      else if (act === 'copy' && s) {
        const v = b.dataset.what === 'hashtags' ? s.hashtags.join(' ') : s.pinnedComment;
        await UI.copy(v);
        UI.toast('Copié ✓');
      }
    } catch (e) {
      UI.toast('⚠️ ' + e.message, 5000);
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
    sug.body.innerHTML = `<div class="tp-sug"><div class="tp-sug-h">${UI.logo()} Recherches YouTube réelles — cliquez pour ajouter</div>${list.map((t, i) => `<button data-t="${esc(t)}">${UI.badge(Math.max(20, 95 - i * 9), 'Popularité estimée (rang dans les suggestions)')}<span>${esc(t)}</span></button>`).join('')}</div>`;
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
    if (!settings.autopilot || !settings.geminiKey || job) return;
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
      if (o.mode !== 'express' && !k.file && !o.youtubeUrl) { sendResponse({ ok: false, error: 'Aucun fichier capté dans cet onglet Studio. Importez la vidéo dans Studio, ou choisissez le fichier dans le panneau.' }); return false; }
      start({ file: o.mode === 'express' ? null : k.file, youtubeUrl: o.youtubeUrl || '', mode: o.mode, reanalyze: !!o.reanalyze, extra: o.extra || {}, runOptions: o.runOptions || {} })
        .then((r) => sendResponse(r.started ? { ok: true, data: r } : { ok: false, error: r.error || 'Déjà en cours.' }));
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
