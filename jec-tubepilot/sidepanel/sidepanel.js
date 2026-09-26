// JEC TubePilot — panneau latéral : vidéo (écoute + SEO), mots-clés, concurrents, tendances, historique
import { getSettings, setSettings, getPack, savePack, listPacks, deletePack, getCompetitors, setCompetitors, getQuota } from '../lib/storage.js';
import { run, fromManual, analyzeHooks, STEPS } from '../lib/pipeline.js';
import { research, competition } from '../lib/keywords.js';
import * as YT from '../lib/ytapi.js';
import { manualPrompt } from '../lib/prompts.js';
import '../lib/format.js';
import '../lib/policy.js';
import '../lib/seo.js';
import '../lib/postprocess.js';

const F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo, Post = globalThis.TPPost;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = F.esc;
const badge = (s, cls = '') => `<span class="sc ${F.scoreClass(s)} ${cls}">${Math.round(s)}</span>`;
const bar = (pct) => `<div class="bar"><i style="width:${F.clamp(Math.round(pct), 0, 100)}%"></i></div>`;
const show = (el, on = true) => el.classList.toggle('hidden', !on);
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const COUNTRIES = [['MA', 'Maroc'], ['DZ', 'Algérie'], ['TN', 'Tunisie'], ['EG', 'Égypte'], ['SA', 'Arabie saoudite'], ['AE', 'Émirats'], ['KW', 'Koweït'], ['QA', 'Qatar'], ['IQ', 'Irak'], ['JO', 'Jordanie'], ['LB', 'Liban'], ['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['CA', 'Canada'], ['US', 'États-Unis'], ['GB', 'Royaume-Uni'], ['ES', 'Espagne'], ['DE', 'Allemagne'], ['IT', 'Italie'], ['NL', 'Pays-Bas'], ['TR', 'Turquie'], ['IN', 'Inde'], ['BR', 'Brésil'], ['MX', 'Mexique'], ['SN', 'Sénégal'], ['CI', 'Côte d\'Ivoire']];
const LANGS = [['ar', 'Arabe'], ['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt', 'Portugais'], ['tr', 'Turc'], ['hi', 'Hindi']];

let settings = null;
let ctx = null;
let pack = null;
let edit = null;
let job = null;
let studioJob = null;
let srcTouched = false;

/* =============== Général =============== */
function showTab(name) {
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
  if (name === 'history') renderHistory();
  if (name === 'competitors') renderCompetitors();
}

async function copy(text, msg = 'Copié ✓') {
  try { await navigator.clipboard.writeText(text); flash(msg); } catch (e) { flash('Copie impossible : ' + e.message); }
}

function flash(msg) {
  const el = $('#status');
  const prev = el.dataset.base || el.innerHTML;
  el.dataset.base = prev;
  el.innerHTML = `<b>${esc(msg)}</b>`;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { el.innerHTML = el.dataset.base; delete el.dataset.base; }, 2500);
}

function fillSelect(sel, list, value) {
  sel.innerHTML = list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  if (value && list.some(([v]) => v === value)) sel.value = value;
}

function profile() {
  return settings.profiles.find((p) => p.id === $('#profile').value) || settings.profiles[0];
}

async function loadSettings() {
  settings = await getSettings();
  const sel = $('#profile');
  const cur = sel.value || settings.activeProfile;
  sel.innerHTML = settings.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = settings.profiles.some((p) => p.id === cur) ? cur : settings.profiles[0].id;
  show($('#keyWarn'), !settings.geminiKey);
  $('#mediaMode').value = settings.mediaMode || 'auto';
  $('#lyricsChk').checked = !!settings.transcribeLyrics;
  $('#compChk').checked = !!settings.competitorLookup && !!settings.ytKey;
  $('#compChk').disabled = !settings.ytKey;
  const p = profile();
  const lang = String(p.languages || 'fr').split(/[,\s]+/)[0];
  fillSelect($('#kwHl'), LANGS, $('#kwHl').value || lang);
  fillSelect($('#kwGl'), COUNTRIES, $('#kwGl').value || p.country);
  fillSelect($('#trGl'), COUNTRIES, $('#trGl').value || p.country);
  renderFooter();
}

async function renderFooter() {
  const q = await getQuota();
  const el = $('#status');
  const html = `<span>🤖 ${esc(settings.modelMain || 'modèle auto')}</span><span>📊 YouTube API : ${settings.ytKey ? `${q.toLocaleString('fr')} / 10 000 unités aujourd'hui` : 'pas de clé'}</span>`;
  if (el.dataset.base) el.dataset.base = html; else el.innerHTML = html;
}

/* =============== Contexte : onglet actif =============== */
async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function refreshContext() {
  const t = await activeTab();
  const url = t?.url || '';
  let next = null;
  if (url.startsWith('https://studio.youtube.com')) {
    try {
      const r = await chrome.tabs.sendMessage(t.id, { type: 'studio:context' });
      next = r?.ok ? { ...r.data, tabId: t.id } : { page: 'studio', stale: true };
    } catch (e) { next = { page: 'studio', stale: true }; }
  } else if (/^https:\/\/www\.youtube\.com\/watch/.test(url)) {
    next = { page: 'watch', videoId: new URL(url).searchParams.get('v') || '', tabId: t.id };
  }
  ctx = next;
  renderCtx();
  if (!job && !studioJob && (ctx?.packKey || ctx?.videoId)) {
    const p = await getPack(ctx.packKey, ctx.videoId ? 'vid:' + ctx.videoId : '');
    if (p && p.key !== pack?.key) showPack(p);
  }
}

function renderCtx() {
  const box = $('#ctxBox');
  let html;
  if (ctx?.page === 'studio' && ctx.stale) html = '🔄 Rechargez l\'onglet YouTube Studio (F5) pour activer TubePilot.';
  else if (ctx?.page === 'studio') {
    html = `🎬 <b>YouTube Studio</b> · ${ctx.uploading ? 'import en cours' : ctx.editing ? 'page Détails' : 'ouvrez une vidéo'}`;
    if (ctx.hasFile) html += `<br>📁 Fichier capté : <b>${esc(ctx.fileName)}</b> (${(ctx.fileSize / 1048576).toFixed(1)} Mo) — Gemini peut l'écouter même si la vidéo est privée.`;
    else if (ctx.editing) html += '<br>Fichier non capté (vidéo déjà en ligne ou page rechargée) : choisissez le fichier, ou « Lien YouTube public » si elle est publique.';
    if (ctx.job) html += `<br>⏳ Analyse en cours dans Studio : ${esc(STEPS.find((s) => s.id === ctx.job.step)?.label || ctx.job.step)}…`;
  } else if (ctx?.page === 'watch') {
    html = `▶️ <b>Page vidéo YouTube</b> — pour l'analyser, choisissez « Lien YouTube public » (vidéos publiques seulement).`;
    if (!$('#urlIn').value) $('#urlIn').value = 'https://www.youtube.com/watch?v=' + ctx.videoId;
  } else html = 'Ouvrez <b>YouTube Studio</b> et importez une vidéo : TubePilot l\'analyse automatiquement. Ou choisissez un fichier ci-dessous.';
  box.innerHTML = html;
  if (!srcTouched) {
    const v = ctx?.page === 'studio' && ctx.hasFile ? 'studio' : ctx?.page === 'watch' ? 'url' : 'file';
    $(`input[name=src][value=${v}]`).checked = true;
    syncSrc();
  }
}

function syncSrc() {
  const v = $('input[name=src]:checked').value;
  show($('#srcFile'), v === 'file');
  show($('#srcUrl'), v === 'url');
  $('#runBtn').textContent = v === 'express' ? '⚡ Générer le SEO (sans écoute)' : '🚀 Analyser la vidéo & générer le SEO';
}

/* =============== Lancement =============== */
function showError(msg) {
  const el = $('#runErr');
  el.innerHTML = msg ? '⚠️ ' + esc(msg) : '';
  show(el, !!msg);
}

function showProgress(p) {
  const el = $('#progress');
  if (!p) { show(el, false); return; }
  show(el, true);
  const order = STEPS.filter((s) => s.id !== 'done');
  const idx = order.findIndex((s) => s.id === p.step);
  const pct = p.pct != null ? Math.round(p.pct * 100) : null;
  el.innerHTML = `<div class="row"><b>${esc(order[idx]?.label || p.step)}</b>${pct != null ? `<span class="muted">${pct} %</span>` : ''}<span class="muted small clamp">${esc(p.detail || '')}</span><span class="sp"></span><button class="small ghost" id="cancelBtn">✕ Annuler</button></div>
    <div class="bar ${pct == null ? 'indet' : ''}"><i style="width:${pct ?? 30}%"></i></div>
    <div class="steps">${order.map((s, i) => `<span class="${i < idx ? 'done' : i === idx ? 'on' : ''}">${i < idx ? '✓ ' : ''}${esc(s.label)}</span>`).join('')}</div>
    ${p.warn ? `<div class="small muted">⚠️ ${esc(p.warn)}</div>` : ''}`;
  $('#cancelBtn').onclick = cancelRun;
}

function cancelRun() {
  if (job) job.ctrl.abort();
  if (studioJob && ctx?.tabId) chrome.tabs.sendMessage(ctx.tabId, { type: 'studio:cancel' }).catch(() => {});
  studioJob = null;
  showProgress(null);
  $('#runBtn').disabled = false;
}

async function runNow() {
  showError('');
  if (!settings.geminiKey && $('input[name=src]:checked').value !== 'express') {
    showError('Ajoutez votre clé Gemini dans les réglages (⚙️), ou utilisez « Mon abonnement Gemini Pro » plus bas.');
    return;
  }
  const src = $('input[name=src]:checked').value;
  // la chaîne ouverte dans Studio choisit son profil ; sinon celui du menu
  const channelMatch = ctx?.channelId && settings.profiles.some((p) => p.channelId === ctx.channelId);
  const extra = { keyword: $('#kwIn').value.trim(), notes: $('#notesIn').value.trim(), lyrics: $('#lyricsIn').value.trim(), profileId: channelMatch ? undefined : profile().id };
  const options = { mediaMode: $('#mediaMode').value, transcribeLyrics: $('#lyricsChk').checked, competitors: $('#compChk').checked, reanalyze: $('#reChk').checked };

  if (src === 'studio') {
    if (ctx?.page !== 'studio' || ctx.stale) return showError('Ouvrez l\'onglet YouTube Studio où vous importez la vidéo (ou rechargez-le), ou choisissez « Fichier de l\'ordinateur ».');
    let r;
    try { r = await chrome.tabs.sendMessage(ctx.tabId, { type: 'studio:run', options: { mode: 'full', reanalyze: options.reanalyze, extra, runOptions: options } }); } catch (e) { r = { ok: false, error: 'Studio ne répond pas : rechargez l\'onglet (F5).' }; }
    if (!r?.ok) return showError(r?.error || 'Impossible de lancer l\'analyse dans Studio.');
    studioJob = { key: r.data.key };
    $('#runBtn').disabled = true;
    showProgress({ step: 'prepare' });
    return;
  }

  const file = src === 'file' ? $('#fileIn').files[0] : null;
  if (src === 'file' && !file) return showError('Choisissez un fichier vidéo ou audio.');
  const youtubeUrl = src === 'url' ? $('#urlIn').value.trim() : '';
  const urlId = youtubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] || '';
  if (src === 'url' && !urlId) return showError('Lien YouTube invalide.');
  const studio = ctx?.page === 'studio' ? ctx : null;
  const baseCtx = {
    ...extra,
    fileName: file?.name || studio?.fileName || '',
    fileSize: file?.size || studio?.fileSize || 0,
    videoId: urlId || (studio?.editing ? studio.videoId : '') || '',
    channelId: studio?.channelId || '',
    currentTitle: studio?.title || '',
    currentDescription: studio?.description || '',
    currentTags: studio?.tags || []
  };
  if (src === 'express') baseCtx.packKey = pack?.key || studio?.packKey || undefined;
  if (src === 'url') baseCtx.packKey = 'vid:' + urlId;
  job = { ctrl: new AbortController() };
  $('#runBtn').disabled = true;
  showProgress({ step: src === 'express' ? 'keywords' : 'prepare' });
  try {
    const p = await run({ file, youtubeUrl, ctx: baseCtx, options: { ...options, mode: src === 'express' ? 'express' : 'full' }, signal: job.ctrl.signal, onProgress: showProgress });
    showPack(p);
  } catch (e) {
    if (e.reason !== 'abort') showError(e.message);
  } finally {
    job = null;
    showProgress(null);
    $('#runBtn').disabled = false;
    renderFooter();
  }
}

/* =============== Résultat =============== */
function showPack(p) {
  pack = p;
  const chosen = p.seo.chosenTitle && p.seo.titles.find((t) => t.text === p.seo.chosenTitle);
  edit = { title: chosen?.text || p.seo.titles[0]?.text || '', description: p.seo.description, tags: [...p.seo.tags] };
  renderResult();
}

const persist = debounce(async () => {
  if (!pack) return;
  pack.seo.description = edit.description;
  pack.seo.tags = edit.tags;
  pack.seo.chosenTitle = edit.title;
  await savePack(pack);
}, 800);

function scoreHead() {
  const r = Post.rescore(pack, edit);
  const important = r.issues.filter((i) => i.level !== 'info');
  return {
    html: `<div class="score-head">${badge(r.score.overall, 'big')}<div><b>Score d'optimisation</b><div class="parts"><span>Titre <b>${r.score.title}</b></span><span>Description <b>${r.score.description}</b></span><span>Tags <b>${r.score.tags}</b></span></div></div></div>`,
    issues: r.issues,
    important,
    detail: r.detail
  };
}

function issuesHtml(list, notes = []) {
  return `<ul class="issues small">${list.map((i) => `<li class="${i.level}">${esc(i.msg)}${i.ref ? ` <a href="${esc(i.ref)}" target="_blank" rel="noopener">Aide YouTube</a>` : ''}</li>`).join('')}
    ${notes.map((n) => `<li>🤖 ${esc(n)}</li>`).join('')}</ul>`;
}

function analysisHtml(a, p) {
  if (!a) return `<div class="box small muted">Mode express : pas d'écoute. Lancez l'analyse avec le fichier pour obtenir style, tempo, refrain et timeline.</div>`;
  const m = a.music || {};
  const local = p.ctx?.localBpm;
  const kv = [
    ['Contenu', esc(a.content_type)],
    ['Style', m.primary_genre ? `<b>${esc(m.primary_genre)}</b>${m.subgenres?.length ? ' · ' + esc(m.subgenres.join(', ')) : ''}${m.regional_style ? ` <span class="muted">(${esc(m.regional_style)})</span>` : ''}${m.genre_confidence ? ` <span class="muted">${Math.round(m.genre_confidence * 100)} %</span>` : ''}` : ''],
    ['Tempo', m.bpm || local ? `${m.bpm ? `${Math.round(m.bpm)} BPM (Gemini)` : ''}${m.bpm && local ? ' · ' : ''}${local ? `${local} BPM (mesuré${p.media?.bpm?.alt ? ` ou ${p.media.bpm.alt}` : ''})` : ''}${m.time_signature ? ' · ' + esc(m.time_signature) : ''}` : ''],
    ['Rythme', esc(m.rhythm_pattern || '')],
    ['Tonalité', esc([m.key, m.scale_or_maqam].filter(Boolean).join(' · '))],
    ['Énergie', m.energy ? `${m.energy}/10` : ''],
    ['Ambiance', m.mood?.length ? m.mood.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ') : ''],
    ['Instruments', m.instruments?.length ? esc(m.instruments.join(', ')) : ''],
    ['Voix', esc(m.vocals || '')],
    ['Langue', a.language ? `${esc(a.language)}${a.language_evidence ? ` <span class="muted">— ${esc(a.language_evidence)}</span>` : ''}` : ''],
    ['Refrain', m.hook_line ? `« <b>${esc(m.hook_line)}</b> »${m.hook_start != null ? ` à ${F.dur(m.hook_start)}` : ''}` : ''],
    ['Thème', esc(m.lyrics_theme || '')],
    ['Moments', m.listening_moments?.length ? esc(m.listening_moments.join(', ')) : ''],
    ['Reprise', a.is_cover ? `oui — ${esc(a.cover_original || '?')}` : ''],
    ['Public', esc(a.audience || '')],
    ['Short idéal', a.best_short?.end ? `${F.dur(a.best_short.start)} → ${F.dur(a.best_short.end)} <span class="muted">${esc(a.best_short.reason || '')}</span>` : ''],
    ['Confiance', a.confidence != null ? `${Math.round(a.confidence * 100)} %` : '']
  ].filter(([, v]) => v);
  return `<details class="box" open><summary>🎧 Ce que Gemini a entendu et vu</summary>
    <div class="small">${esc(a.summary || '')}</div>
    <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${a.timeline?.length ? `<details><summary class="small">⏱️ Structure (${a.timeline.length} repères)</summary><table><tr><th>Début</th><th>Partie</th><th>Type</th></tr>${a.timeline.map((t) => `<tr><td>${F.dur(t.start)}</td><td>${esc(t.label)}</td><td class="muted">${esc(t.kind || '')}</td></tr>`).join('')}</table></details>` : ''}
    ${m.lyrics ? `<details><summary class="small">🎤 Paroles transcrites</summary><div class="lyrics">${esc(m.lyrics)}</div><button class="small" data-act="copyLyrics">Copier les paroles</button></details>` : ''}
    ${a.uncertain?.length ? `<div class="small muted">❔ Incertain : ${esc(a.uncertain.join(' · '))}</div>` : ''}
  </details>`;
}

function keywordsHtml(p) {
  const kw = p.keywords;
  const c = p.competition;
  if (!kw?.items?.length && !c) return '';
  return `<details class="box"><summary>🔑 Mots-clés réels — principal : « ${esc(p.seo.mainKeyword)} »</summary>
    ${c ? `<div class="row small"><span>Demande ${badge(c.demand)}</span><span>Concurrence ${badge(100 - c.competition)}</span><span>Score ${badge(c.overall)}</span><span class="muted">vues médianes ${F.num(c.medianViews)} · abonnés médians ${F.num(c.medianSubs)}</span></div>` : ''}
    <table><tr><th>Recherche YouTube</th><th style="width:90px">Popularité</th><th></th></tr>
    ${(kw?.items || []).slice(0, 20).map((k) => `<tr><td>${esc(k.kw)}</td><td>${bar(k.popularity)}</td><td class="num"><button class="small" data-act="addTag" data-kw="${esc(k.kw)}" title="Ajouter aux tags">+ tag</button></td></tr>`).join('')}</table>
    ${c?.videos?.length ? `<details><summary class="small">🥊 Top vidéos sur « ${esc(c.kw)} »</summary>${c.videos.map((v) => `<div class="item vid small"><div class="grow"><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank">${esc(v.title)}</a><div class="muted tiny">${esc(v.channelTitle)} · ${F.num(v.views)} vues · ${F.num(v.subs)} abonnés · ${Math.round(v.ageDays)} j</div></div></div>`).join('')}</details>` : ''}
  </details>`;
}

function renderResult() {
  const box = $('#result');
  if (!pack) { box.innerHTML = ''; return; }
  const s = pack.seo;
  const head = scoreHead();
  const tagLen = P.tagsLength(edit.tags);
  const src = pack.source?.fileName || pack.source?.youtubeUrl || pack.key;
  box.innerHTML = `
    <div class="box">
      <div class="row small muted"><span>📄 ${esc(src)}</span><span class="sp"></span><span>${esc(F.ago(pack.createdAt))}</span></div>
      <div id="scoreHead">${head.html}</div>
      ${s.audienceInsight ? `<div class="small">🧠 <b>Psychologie du public :</b> ${esc(s.audienceInsight)}</div>` : ''}
    </div>
    ${analysisHtml(pack.analysis, pack)}
    ${keywordsHtml(pack)}
    <div class="box">
      <div class="row"><h2>🏆 Titres</h2><span class="sp"></span><span class="muted tiny">cliquez pour choisir</span></div>
      <div id="titles">${s.titles.map((t, i) => `<div class="item tt" data-act="pickTitle" data-i="${i}" ${t.text === edit.title ? 'style="outline:2px solid var(--good)"' : ''}>
        ${badge(t.score)}<div class="grow"><div>${esc(t.text)}</div><div class="hook">${esc(t.hook || '')}${t.angle ? ' — ' + esc(t.angle) : ''}</div></div>
        <button class="small ghost" data-act="copyTitle" data-i="${i}" title="Copier">📋</button></div>`).join('')}</div>
      <label>Tester mon propre titre<input id="customTitle" placeholder="Tapez un titre pour voir son score"></label>
      <div id="customScore" class="small muted"></div>
      ${s.abTitles?.length ? `<details><summary class="small">🧪 3 titres pour « Tester et comparer » (A/B)</summary>${s.abTitles.map((t) => `<div class="item small">${badge(t.score)}<div class="grow">${esc(t.text)}</div></div>`).join('')}<button class="small" data-act="copyAB">Copier les 3</button></details>` : ''}
    </div>
    <div class="box">
      <div class="row"><h2>📝 Description</h2><span class="sp"></span><span class="counter" id="descCount"></span></div>
      <textarea id="descEdit" rows="12">${esc(edit.description)}</textarea>
      <div class="row"><button class="small" data-act="insDesc">➡ Insérer dans Studio</button><button class="small" data-act="copyDesc">📋 Copier</button></div>
    </div>
    <div class="box">
      <div class="row"><h2>🏷️ Tags</h2><span class="sp"></span><span class="counter ${tagLen > 500 ? 'over' : ''}" id="tagCount">${edit.tags.length} tags · ${tagLen}/500</span></div>
      <div class="chips" id="tagChips">${edit.tags.map((t, i) => `<span class="chip">${esc(t)}<button data-act="rmTag" data-i="${i}" title="Retirer">×</button></span>`).join('')}</div>
      <div class="row"><input id="tagAdd" placeholder="Ajouter un tag + Entrée"><button class="small" data-act="insTags">➡ Insérer (remplace)</button><button class="small" data-act="copyTags">📋</button></div>
    </div>
    <div class="box">
      <div class="row"><h3># Hashtags</h3><span class="chips">${s.hashtags.map((h) => `<span class="chip">${esc(h)}</span>`).join('')}</span><span class="sp"></span><button class="small" data-act="copyHashtags">📋</button></div>
      ${s.chapters?.length ? `<details><summary class="small">⏱️ Timeline / chapitres (${s.chapters.length}) — incluse dans la description</summary><div class="small">${s.chapters.map((c) => `${F.dur(c.t)} ${esc(c.label)}`).join('<br>')}</div></details>` : '<div class="small muted">⏱️ Pas de chapitres (vidéo trop courte ou moins de 3 parties de 10 s).</div>'}
      ${s.pinnedComment ? `<div class="small"><b>💬 Commentaire à épingler :</b> ${esc(s.pinnedComment)} <button class="small ghost" data-act="copyPinned">📋</button></div>` : ''}
      ${s.thumbnail ? `<details><summary class="small">🖼️ Miniature</summary><div class="small">${(s.thumbnail.texts || []).map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}<p>${esc(s.thumbnail.concept || '')}</p>${s.thumbnail.prompt ? `<div class="lyrics">${esc(s.thumbnail.prompt)}</div><button class="small" data-act="copyThumb">Copier le prompt d'image</button>` : ''}</div></details>` : ''}
      ${s.short?.title ? `<details><summary class="small">📱 Short tiré de la vidéo</summary><div class="small"><b>${esc(s.short.title)}</b><p>${esc(s.short.description || '')}</p></div></details>` : ''}
    </div>
    <div class="box" id="issuesBox">
      <h3>🛡️ Règlement YouTube / Google</h3>
      ${head.issues.length || s.complianceNotes?.length ? issuesHtml(head.issues, s.complianceNotes) : '<div class="small ok">✓ Aucun problème détecté.</div>'}
    </div>
    <div class="sticky-actions">
      <button class="primary" data-act="insAll">✅ Tout insérer dans Studio</button>
      <button data-act="regen" title="Nouveaux titres et description sans réécouter">🔁 Régénérer</button>
    </div>`;
  updateCounters();
  $('#descEdit').addEventListener('input', (e) => { edit.description = e.target.value; updateCounters(); rescoreSoon(); persist(); });
  $('#tagAdd').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.target.value.split(',').forEach((t) => addTag(t));
    e.target.value = '';
  });
  $('#customTitle').addEventListener('input', (e) => {
    const t = e.target.value.trim();
    if (!t) { $('#customScore').innerHTML = ''; return; }
    const r = S.scoreTitle(t, { keyword: pack.seo.mainKeyword, competitorTitles: (pack.competition?.videos || []).map((v) => v.title) });
    $('#customScore').innerHTML = `${badge(r.score)} ${r.parts.map((p) => `${esc(p.label)} ${Math.round(p.pts)}/${p.max}`).join(' · ')}<br>${r.parts.filter((p) => p.pts < p.max).map((p) => '• ' + esc(p.tip)).join('<br>')} <button class="small" data-act="useCustom">Utiliser ce titre</button>`;
  });
}

function updateCounters() {
  const n = edit.description.length;
  const dc = $('#descCount');
  if (dc) { dc.textContent = `${n}/5000`; dc.classList.toggle('over', n > 5000); }
  const tc = $('#tagCount');
  if (tc) { const l = P.tagsLength(edit.tags); tc.textContent = `${edit.tags.length} tags · ${l}/500`; tc.classList.toggle('over', l > 500); }
}

const rescoreSoon = debounce(() => {
  if (!pack) return;
  const head = scoreHead();
  $('#scoreHead').innerHTML = head.html;
  $('#issuesBox').innerHTML = `<h3>🛡️ Règlement YouTube / Google</h3>${head.issues.length || pack.seo.complianceNotes?.length ? issuesHtml(head.issues, pack.seo.complianceNotes) : '<div class="small ok">✓ Aucun problème détecté.</div>'}`;
}, 350);

function renderTags() {
  $('#tagChips').innerHTML = edit.tags.map((t, i) => `<span class="chip">${esc(t)}<button data-act="rmTag" data-i="${i}" title="Retirer">×</button></span>`).join('');
  updateCounters();
  rescoreSoon();
  persist();
}

function addTag(t) {
  const tag = P.cleanTag(t);
  if (!tag || edit.tags.some((x) => F.norm(x) === F.norm(tag))) return;
  if (P.tagsLength([...edit.tags, tag]) > 500) { flash('Limite de 500 caractères atteinte'); return; }
  edit.tags.push(tag);
  renderTags();
}

async function studioApply(fields) {
  const t = await activeTab();
  if (!t?.url?.startsWith('https://studio.youtube.com')) throw new Error('Ouvrez la vidéo dans YouTube Studio (page Détails ou fenêtre d\'import), puis réessayez.');
  let r;
  try { r = await chrome.tabs.sendMessage(t.id, { type: 'studio:apply', fields }); } catch (e) { throw new Error('Studio ne répond pas : rechargez l\'onglet (F5).'); }
  if (!r?.ok) throw new Error(r?.error || 'Insertion impossible.');
  return r.data;
}

async function onResultClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !pack) return;
  const s = pack.seo;
  const act = b.dataset.act;
  try {
    if (act === 'pickTitle') {
      edit.title = s.titles[+b.dataset.i].text;
      $$('#titles .tt').forEach((el) => { el.style.outline = el === b ? '2px solid var(--good)' : ''; });
      rescoreSoon();
      persist();
    } else if (act === 'copyTitle') { e.stopPropagation(); copy(s.titles[+b.dataset.i].text); }
    else if (act === 'useCustom') { edit.title = P.sanitizeTitle($('#customTitle').value); rescoreSoon(); persist(); flash('Titre choisi ✓'); }
    else if (act === 'copyAB') copy(s.abTitles.map((t) => t.text).join('\n'));
    else if (act === 'copyDesc') copy(edit.description);
    else if (act === 'copyTags') copy(edit.tags.join(', '));
    else if (act === 'copyHashtags') copy(s.hashtags.join(' '));
    else if (act === 'copyPinned') copy(s.pinnedComment);
    else if (act === 'copyThumb') copy(s.thumbnail?.prompt || '');
    else if (act === 'copyLyrics') copy(pack.analysis?.music?.lyrics || '');
    else if (act === 'rmTag') { edit.tags.splice(+b.dataset.i, 1); renderTags(); }
    else if (act === 'addTag') addTag(b.dataset.kw);
    else if (act === 'insDesc') { await studioApply({ description: edit.description }); flash('Description insérée ✓'); }
    else if (act === 'insTags') { await studioApply({ tags: edit.tags, replaceTags: true }); flash('Tags insérés ✓'); }
    else if (act === 'insAll') { const d = await studioApply({ title: edit.title, description: edit.description, tags: edit.tags, replaceTags: true }); flash('Inséré : ' + d.join(', ') + ' ✓'); }
    else if (act === 'regen') {
      $('input[name=src][value=express]').checked = true;
      srcTouched = true;
      syncSrc();
      runNow();
    }
  } catch (err) {
    showError(err.message);
    $('#runErr').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* =============== Mode abonnement (gemini.google.com) =============== */
async function copyManualPrompt() {
  const p = profile();
  const studio = ctx?.page === 'studio' ? ctx : {};
  const text = manualPrompt({
    profile: p,
    fileName: studio.fileName || $('#fileIn').files[0]?.name || '',
    cleanTitle: F.cleanFileName(studio.fileName || $('#fileIn').files[0]?.name || ''),
    keyword: $('#kwIn').value.trim(),
    notes: $('#notesIn').value.trim(),
    lyrics: $('#lyricsIn').value.trim(),
    transcribeLyrics: $('#lyricsChk').checked,
    titleCount: settings.titleCount,
    currentTitle: studio.title || ''
  });
  copy(text, 'Prompt copié ✓ — collez-le dans Gemini avec votre vidéo jointe');
}

async function applyManual() {
  showError('');
  const studio = ctx?.page === 'studio' ? ctx : {};
  try {
    const p = await fromManual({ text: $('#manualIn').value, ctx: { fileName: studio.fileName || '', fileSize: studio.fileSize || 0, videoId: studio.videoId || '', channelId: studio.channelId || '', profileId: profile().id, packKey: studio.packKey || undefined } });
    $('#manualIn').value = '';
    showPack(p);
    flash('Réponse de Gemini importée ✓');
  } catch (e) { showError(e.message); }
}

/* =============== Mots-clés =============== */
let kwData = null, basket = [];

async function loadBasket() {
  basket = (await chrome.storage.local.get('basket')).basket || [];
  renderBasket();
}

function renderBasket() {
  $('#basketChips').innerHTML = basket.map((t, i) => `<span class="chip">${esc(t)}<button data-bi="${i}">×</button></span>`).join('') || '<span class="muted small">Cliquez « + » sur un mot-clé pour l\'ajouter.</span>';
  $('#basketInfo').textContent = `${basket.length} · ${P.tagsLength(basket)}/500`;
  chrome.storage.local.set({ basket });
}

function toBasket(kw) {
  if (basket.some((x) => F.norm(x) === F.norm(kw))) return;
  basket.push(P.cleanTag(kw));
  renderBasket();
}

async function kwSearch(seedArg) {
  const seed = (seedArg ?? $('#kwSeed').value).trim();
  if (!seed) return;
  $('#kwSeed').value = seed;
  $('#kwDetail').innerHTML = '';
  $('#kwResults').innerHTML = '';
  $('#kwProgress').innerHTML = `<div class="box small">Recherche des suggestions YouTube…${bar(5)}</div>`;
  try {
    kwData = await research(seed, { hl: $('#kwHl').value, gl: $('#kwGl').value, deep: $('#kwDeep').checked, onProgress: (p) => { $('#kwProgress').innerHTML = `<div class="box small">Recherche des suggestions YouTube… ${Math.round(p * 100)} %${bar(p * 100)}</div>`; } });
    renderKw();
  } catch (e) {
    $('#kwResults').innerHTML = `<div class="alert small">⚠️ ${esc(e.message)}</div>`;
  } finally {
    $('#kwProgress').innerHTML = '';
  }
}

function renderKw(filter = '') {
  if (!kwData) return;
  const f = F.norm(filter);
  const items = kwData.items.filter((k) => !f || F.norm(k.kw).includes(f));
  $('#kwResults').innerHTML = `<div class="box">
    <div class="row"><b>${kwData.items.length} recherches réelles</b><span class="sp"></span><input id="kwFilter" placeholder="Filtrer…" value="${esc(filter)}" style="max-width:140px"></div>
    <table><tr><th>Mot-clé</th><th style="width:80px">Popularité</th><th class="num"></th></tr>
    ${items.slice(0, 80).map((k) => `<tr><td>${esc(k.kw)} ${k.direct ? '<span class="chip" title="Suggestion directe de la recherche">top</span>' : ''} ${k.words >= 4 ? '<span class="chip" title="Longue traîne : moins de concurrence">traîne</span>' : ''}</td>
      <td>${bar(k.popularity)}<span class="tiny muted">${k.popularity}</span></td>
      <td class="num"><button class="small" data-kwadd="${esc(k.kw)}" title="Ajouter au panier de tags">+</button> <button class="small" data-kwan="${esc(k.kw)}" title="Concurrence (clé YouTube)">📊</button></td></tr>`).join('')}</table></div>`;
  const inp = $('#kwFilter');
  inp.addEventListener('input', debounce(() => { renderKw(inp.value); $('#kwFilter').focus(); const v = $('#kwFilter'); v.setSelectionRange(v.value.length, v.value.length); }, 250));
}

async function kwAnalyze(kw) {
  const box = $('#kwDetail');
  if (!settings.ytKey) { box.innerHTML = '<div class="alert small">Ajoutez une clé YouTube Data API v3 (gratuite) dans les réglages pour analyser la concurrence.</div>'; return; }
  box.innerHTML = `<div class="box small">Analyse de « ${esc(kw)} » sur YouTube…${bar(40)}</div>`;
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  try {
    const c = await competition(kw, { regionCode: $('#kwGl').value, relevanceLanguage: $('#kwHl').value });
    const pat = c.patterns;
    box.innerHTML = `<div class="box">
      <div class="row"><h2>📊 « ${esc(kw)} »</h2><span class="sp"></span>${badge(c.overall, 'big')}</div>
      <div class="row small"><span>Demande ${badge(c.demand)}</span><span>Facilité ${badge(100 - c.competition)}</span><span class="muted">vues médianes ${F.num(c.medianViews)} · abonnés médians ${F.num(c.medianSubs)} · titre exact ${Math.round(c.titleMatch * 100)} % · récentes ${Math.round(c.recent * 100)} %</span></div>
      <div class="muted tiny">Score = 60 % demande (vues du top 15) + 40 % facilité (taille des chaînes, titres exacts, fraîcheur). Données : YouTube Data API.</div>
      <details open><summary class="small">🧠 Ce qui marche dans les titres</summary>
        ${pat.hooks.slice(0, 6).map((h) => `<div class="hbar"><span>${esc(h.k)}</span>${bar(h.pct)}<span>${h.pct} %</span></div>`).join('')}
        <div class="small muted">Longueur moyenne ${pat.avgLength} car. · emoji ${pat.traits.emoji} % · MAJUSCULES ${pat.traits.caps} % · année ${pat.traits.year} % · [crochets] ${pat.traits.brackets} % · séparateur | ${pat.traits.pipe} %</div>
        <div class="chips">${pat.words.map((w) => `<span class="chip click" data-kwseed="${esc(w.k)}" title="${w.c} titres">${esc(w.k)} ×${w.c}</span>`).join('')}</div>
      </details>
      ${c.tags.length ? `<details><summary class="small">🏷️ Tags des concurrents (cliquez pour les ajouter au panier)</summary><div class="chips">${c.tags.map((t) => `<span class="chip click" data-kwadd="${esc(t.tag)}">${esc(t.tag)} ×${t.n}</span>`).join('')}</div></details>` : ''}
      <details open><summary class="small">🥊 Top 15 vidéos</summary>${c.videos.map((v) => `<div class="item vid small"><div class="grow"><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank">${esc(v.title)}</a>
        <div class="muted tiny">${esc(v.channelTitle)} · ${F.num(v.views)} vues · ${F.num(v.vph)} /h · ${F.num(v.subs)} abonnés · ${F.ago(v.publishedAt)}${v.outlier >= 2 ? ` · 🔥 ×${v.outlier.toFixed(1)}` : ''}</div></div></div>`).join('')}</details>
      <button id="hooksBtn" class="primary">🧠 Formules d'accroche + titres originaux (Gemini)</button>
      <div id="hooksOut"></div>
    </div>`;
    $('#hooksBtn').onclick = () => runHooks(c.videos.map((v) => ({ title: v.title, views: v.views })), kw, $('#hooksOut'));
  } catch (e) {
    box.innerHTML = `<div class="alert small">⚠️ ${esc(e.message)}</div>`;
  }
}

async function runHooks(titles, topic, out) {
  if (!settings.geminiKey) { out.innerHTML = '<div class="alert small">Ajoutez votre clé Gemini dans les réglages.</div>'; return; }
  out.innerHTML = `<div class="small muted">Gemini analyse ${titles.length} titres…</div>${bar(50).replace('class="bar"', 'class="bar indet"')}`;
  try {
    const r = await analyzeHooks(titles, { topic, profileId: profile().id });
    out.innerHTML = `
      ${r.formulas.map((f) => `<div class="item small"><div class="grow"><b>${esc(f.name)}</b> — <code>${esc(f.template)}</code>${f.example ? `<div class="muted">ex. ${esc(f.example)}</div>` : ''}<div class="tiny">${esc(f.why)}</div></div></div>`).join('')}
      ${r.power_words?.length ? `<div class="small"><b>Mots puissants :</b> ${r.power_words.map((w) => `<span class="chip">${esc(w)}</span>`).join(' ')}</div>` : ''}
      <div class="small muted">${esc(r.emoji_usage || '')} ${esc(r.ideal_length || '')}</div>
      ${r.recommendations?.length ? `<ul class="small">${r.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <h3>💡 Idées de titres originales</h3>
      ${r.title_ideas.map((t) => `<div class="item small">${badge(t.score)}<div class="grow">${esc(t.text)}<div class="tiny muted">${esc(t.hook_type)}</div></div><button class="small ghost" data-copy="${esc(t.text)}">📋</button></div>`).join('')}`;
  } catch (e) {
    out.innerHTML = `<div class="alert small">⚠️ ${esc(e.message)}</div>`;
  }
}

/* =============== Concurrents =============== */
async function renderCompetitors() {
  const list = await getCompetitors();
  $('#compList').innerHTML = list.length ? list.map((c) => `<div class="item small"><img src="${esc(c.thumb || '')}" width="28" height="28" style="border-radius:50%" alt=""><div class="grow"><b>${esc(c.title)}</b><div class="tiny muted">${esc(c.handle || c.id)} · ${F.num(c.subs)} abonnés</div></div><button class="small ghost" data-rmcomp="${esc(c.id)}" title="Retirer">🗑️</button></div>`).join('')
    : '<div class="small muted">Aucune chaîne suivie. Astuce : sur une page vidéo YouTube, bouton « ➕ Suivre la chaîne » de la carte TubePilot.</div>';
  const cache = (await chrome.storage.local.get('compCache')).compCache;
  if (cache?.videos?.length && !$('#compVideos').dataset.filled) renderCompVideos(cache.videos, cache.ts);
}

async function addCompetitor() {
  const v = $('#compIn').value.trim();
  if (!v) return;
  try {
    const c = await YT.resolveChannel(v);
    if (!c) throw new Error('Chaîne introuvable.');
    const list = await getCompetitors();
    if (!list.some((x) => x.id === c.id)) list.push({ id: c.id, title: c.title, handle: c.handle, thumb: c.thumb, subs: c.subs, uploads: c.uploads, addedAt: Date.now() });
    await setCompetitors(list);
    $('#compIn').value = '';
    renderCompetitors();
  } catch (e) { flash('⚠️ ' + e.message); }
}

async function refreshCompetitors() {
  const list = await getCompetitors();
  if (!list.length) return;
  if (!settings.ytKey) { $('#compVideos').innerHTML = '<div class="alert small">Clé YouTube Data API requise (Réglages).</div>'; return; }
  $('#compVideos').innerHTML = `<div class="small muted">Lecture des dernières vidéos de ${list.length} chaîne(s)…</div>`;
  const all = [];
  await F.pool(list.slice(0, 25), 4, async (c) => {
    const vids = await YT.recentUploads(c, 15);
    const med = F.median(vids.map((v) => v.views)) || 1;
    vids.forEach((v) => all.push({ ...v, channelTitle: c.title, outlier: v.views / med }));
  });
  all.sort((a, b) => b.outlier - a.outlier || b.vph - a.vph);
  await chrome.storage.local.set({ compCache: { ts: Date.now(), videos: all.slice(0, 120) } });
  renderCompVideos(all, Date.now());
  renderFooter();
}

function renderCompVideos(videos, ts) {
  const top = videos.slice(0, 30);
  const box = $('#compVideos');
  box.dataset.filled = '1';
  box.innerHTML = `<div class="tiny muted">Mis à jour ${esc(F.ago(ts))} · ×N = vues comparées à la médiane de la chaîne</div>` + top.map((v) => `<div class="item vid small"><span class="sc ${v.outlier >= 3 ? 'good' : v.outlier >= 1.5 ? 'mid' : 'bad'}" title="Vues / médiane de la chaîne">×${v.outlier >= 10 ? Math.round(v.outlier) : v.outlier.toFixed(1)}</span>
    <div class="grow"><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank">${esc(v.title)}</a><div class="tiny muted">${esc(v.channelTitle)} · ${F.num(v.views)} vues · ${F.num(v.vph)} /h · ${F.ago(v.publishedAt)}</div>
    <div class="chips">${S.detectHooks(v.title).map((h) => `<span class="chip">${esc(h)}</span>`).join('')}</div></div></div>`).join('');
  // enseignements : accroches, jours / heures de publication, tags
  const winners = videos.filter((v) => v.outlier >= 1.5).slice(0, 40);
  const base = winners.length >= 5 ? winners : videos.slice(0, 20);
  const pat = S.titlePatterns(base.map((v) => v.title));
  const days = Array(7).fill(0), hours = Array(24).fill(0);
  base.forEach((v) => { const d = new Date(v.publishedAt); days[d.getDay()]++; hours[d.getHours()]++; });
  const dayNames = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const maxD = Math.max(1, ...days), maxH = Math.max(1, ...hours);
  const bestHours = hours.map((n, h) => ({ h, n })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
  const tagFreq = {};
  base.forEach((v) => (v.tags || []).forEach((t) => { const k = t.trim(); tagFreq[k] = (tagFreq[k] || 0) + 1; }));
  const tags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 30);
  $('#compInsights').innerHTML = `<div class="box">
    <h2>🧠 Ce qui marche chez vos concurrents</h2>
    <div class="small muted">Basé sur ${base.length} vidéos ${winners.length >= 5 ? 'qui surperforment (×1,5 et plus)' : 'récentes'}.</div>
    ${pat.hooks.slice(0, 6).map((h) => `<div class="hbar"><span>${esc(h.k)}</span>${bar(h.pct)}<span>${h.pct} %</span></div>`).join('')}
    <div class="small muted">Longueur moyenne ${pat.avgLength} car. · emoji ${pat.traits.emoji} % · année ${pat.traits.year} % · MAJUSCULES ${pat.traits.caps} %</div>
    <div class="chips">${pat.words.map((w) => `<span class="chip click" data-kwseed="${esc(w.k)}">${esc(w.k)} ×${w.c}</span>`).join('')}</div>
    <h3>📅 Jours et heures de publication (heure locale)</h3>
    ${days.map((n, i) => `<div class="hbar"><span>${dayNames[i]}</span>${bar((n / maxD) * 100)}<span>${n}</span></div>`).join('')}
    <div class="small">⏰ Heures les plus fréquentes : ${bestHours.map((x) => `<b>${x.h} h</b>`).join(', ') || '—'} <span class="muted">(${Math.round((Math.max(...hours) / maxH) * 100)} %)</span></div>
    ${tags.length ? `<details><summary class="small">🏷️ Tags les plus utilisés</summary><div class="chips">${tags.map(([t, n]) => `<span class="chip click" data-kwadd="${esc(t)}">${esc(t)} ×${n}</span>`).join('')}</div></details>` : ''}
    <button id="compHooks" class="primary">🧠 Formules d'accroche + titres originaux (Gemini)</button>
    <div id="compHooksOut"></div>
  </div>`;
  $('#compHooks').onclick = () => runHooks(base.map((v) => ({ title: v.title, views: v.views })), '', $('#compHooksOut'));
}

/* =============== Tendances =============== */
async function loadTrends() {
  const out = $('#trResults');
  if (!settings.ytKey) { out.innerHTML = '<div class="alert small">Clé YouTube Data API requise (Réglages) — 1 unité par chargement.</div>'; return; }
  out.innerHTML = `<div class="box small muted">Chargement…</div>`;
  try {
    const vids = (await YT.trending({ regionCode: $('#trGl').value, videoCategoryId: $('#trCat').value })).sort((a, b) => b.vph - a.vph);
    const pat = S.titlePatterns(vids.map((v) => v.title));
    const tagFreq = {};
    vids.forEach((v) => F.uniq(v.tags || []).forEach((t) => { tagFreq[t] = (tagFreq[t] || 0) + 1; }));
    const tags = Object.entries(tagFreq).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 30);
    renderFooter();
    out.innerHTML = `<div class="box">
      <h2>💡 Sujets qui reviennent</h2>
      <div class="chips">${pat.words.map((w) => `<span class="chip click" data-kwseed="${esc(w.k)}" title="Analyser ce mot-clé">${esc(w.k)} ×${w.c}</span>`).join('') || '<span class="muted small">—</span>'}</div>
      ${tags.length ? `<div class="chips">${tags.map(([t, n]) => `<span class="chip click" data-kwseed="${esc(t)}">#${esc(t)} ×${n}</span>`).join('')}</div>` : ''}
      ${pat.hooks.slice(0, 5).map((h) => `<div class="hbar"><span>${esc(h.k)}</span>${bar(h.pct)}<span>${h.pct} %</span></div>`).join('')}
    </div>
    <div class="box">${vids.map((v, i) => `<div class="item vid small"><b class="muted">${i + 1}</b><div class="grow"><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank">${esc(v.title)}</a>
      <div class="tiny muted">${esc(v.channelTitle)} · ${F.num(v.views)} vues · <b>${F.num(v.vph)} /h</b> · ${F.ago(v.publishedAt)} · ${F.dur(v.duration)}</div></div></div>`).join('')}</div>`;
  } catch (e) {
    out.innerHTML = `<div class="alert small">⚠️ ${esc(e.message)}</div>`;
  }
}

/* =============== Historique =============== */
async function renderHistory() {
  const list = await listPacks();
  $('#histList').innerHTML = list.length ? `<div class="box">${list.map((x) => `<div class="item small">${badge(x.score || 0)}<div class="grow"><b class="clamp">${esc(x.title)}</b><div class="tiny muted">${esc(x.fileName || x.videoId || x.key)} · ${F.ago(x.createdAt)}</div></div>
      <button class="small" data-open="${esc(x.key)}">Ouvrir</button><button class="small ghost" data-del="${esc(x.key)}" title="Supprimer">🗑️</button></div>`).join('')}</div>`
    : '<div class="box small muted">Aucune fiche pour l\'instant.</div>';
}

/* =============== Intentions venant des pages YouTube =============== */
async function handleIntent(intent) {
  if (!intent || Date.now() - (intent.ts || 0) > 15000) return;
  await chrome.storage.session.remove('panelIntent');
  if (intent.tab) showTab(intent.tab);
  if (intent.tab === 'keywords' && intent.keyword) kwSearch(intent.keyword);
  if (intent.tab === 'competitors' && intent.channelId) {
    const list = await getCompetitors();
    if (!list.some((c) => c.id === intent.channelId)) $('#compIn').value = intent.channelId;
  }
}

/* =============== Événements =============== */
function bind() {
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-options]')) chrome.runtime.openOptionsPage();
    const seed = e.target.closest('[data-kwseed]');
    if (seed) { showTab('keywords'); kwSearch(seed.dataset.kwseed); }
    const add = e.target.closest('[data-kwadd]');
    if (add) { toBasket(add.dataset.kwadd); flash('Ajouté au panier ✓'); }
    const an = e.target.closest('[data-kwan]');
    if (an) kwAnalyze(an.dataset.kwan);
    const cp = e.target.closest('[data-copy]');
    if (cp) copy(cp.dataset.copy);
    const bi = e.target.closest('[data-bi]');
    if (bi) { basket.splice(+bi.dataset.bi, 1); renderBasket(); }
    const rm = e.target.closest('[data-rmcomp]');
    if (rm) getCompetitors().then((l) => setCompetitors(l.filter((c) => c.id !== rm.dataset.rmcomp))).then(renderCompetitors);
    const op = e.target.closest('[data-open]');
    if (op) getPack(op.dataset.open).then((p) => { if (p) { showPack(p); showTab('video'); } });
    const del = e.target.closest('[data-del]');
    if (del) deletePack(del.dataset.del).then(renderHistory);
  });
  $$('input[name=src]').forEach((r) => r.addEventListener('change', () => { srcTouched = true; syncSrc(); }));
  $('#runBtn').addEventListener('click', runNow);
  $('#result').addEventListener('click', onResultClick);
  $('#copyPrompt').addEventListener('click', copyManualPrompt);
  $('#openGemini').addEventListener('click', () => chrome.tabs.create({ url: 'https://gemini.google.com/app' }));
  $('#manualApply').addEventListener('click', applyManual);
  $('#profile').addEventListener('change', async () => { settings = await setSettings({ activeProfile: $('#profile').value }); });
  $('#kwGo').addEventListener('click', () => kwSearch());
  $('#kwSeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') kwSearch(); });
  $('#basketCopy').addEventListener('click', () => copy(basket.join(', ')));
  $('#basketClear').addEventListener('click', () => { basket = []; renderBasket(); });
  $('#basketInsert').addEventListener('click', async () => {
    try { await studioApply({ tags: basket, replaceTags: false }); flash('Tags ajoutés dans Studio ✓'); } catch (e) { flash('⚠️ ' + e.message); }
  });
  $('#compAdd').addEventListener('click', addCompetitor);
  $('#compIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCompetitor(); });
  $('#compRefresh').addEventListener('click', () => refreshCompetitors().catch((e) => { $('#compVideos').innerHTML = `<div class="alert small">⚠️ ${esc(e.message)}</div>`; }));
  $('#trGo').addEventListener('click', loadTrends);

  const refreshSoon = debounce(refreshContext, 300);
  chrome.tabs.onActivated.addListener(refreshSoon);
  chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') refreshSoon(); });
  setInterval(() => { if (ctx?.page === 'studio' && document.visibilityState === 'visible') refreshContext(); }, 4000);

  chrome.storage.onChanged.addListener(async (ch, area) => {
    if (area === 'session' && ch.panelIntent?.newValue) handleIntent(ch.panelIntent.newValue);
    if (area !== 'local') return;
    if (ch.settings) loadSettings();
    const want = studioJob?.key || pack?.key;
    if (want && ch['pack:' + want]?.newValue && !job) {
      const p = ch['pack:' + want].newValue;
      if (studioJob || p.createdAt !== pack?.createdAt) {
        studioJob = null;
        showProgress(null);
        $('#runBtn').disabled = false;
        showPack(p);
      }
    }
  });

  // progression d'une analyse lancée dans Studio (moteur intégré à la page)
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type !== 'job:progress' || !studioJob || (m.key && m.key !== studioJob.key)) return false;
    if (m.progress?.step === 'error') {
      studioJob = null;
      showProgress(null);
      $('#runBtn').disabled = false;
      showError(m.progress.detail || 'Erreur pendant l\'analyse.');
    } else if (m.progress?.step !== 'done') showProgress(m.progress);
    return false;
  });
}

(async function init() {
  bind();
  await loadSettings();
  await loadBasket();
  syncSrc();
  await refreshContext();
  if (!pack) {
    const last = (await listPacks())[0];
    if (last && Date.now() - last.createdAt < 6 * 3600000) { const p = await getPack(last.key); if (p) showPack(p); }
  }
  const { panelIntent } = await chrome.storage.session.get('panelIntent');
  handleIntent(panelIntent);
})();
