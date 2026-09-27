// TubePilot — panneau latéral : vidéo (écoute + SEO), mots-clés (+ Keyword Planner), concurrents, tendances, historique
import { t, I18n } from '../lib/lang.js';
import { getSettings, setSettings, getPack, savePack, listPacks, deletePack, getCompetitors, setCompetitors, getQuota } from '../lib/storage.js';
import { run, fromManual, analyzeHooks, STEPS } from '../lib/pipeline.js';
import { research, competition } from '../lib/keywords.js';
import { importKeywordPlanner, kpStats, clearKeywordPlanner } from '../lib/kpimport.js';
import * as YT from '../lib/ytapi.js';
import { manualPrompt } from '../lib/prompts.js';
import '../lib/format.js';
import '../lib/policy.js';
import '../lib/seo.js';
import '../lib/postprocess.js';

const F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo, Post = globalThis.TPPost, I = globalThis.TPIcons;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = F.esc;
const ic = (n, s = 15) => I.icon(n, s);
const bar = (pct) => `<div class="tp-bar"><i style="width:${F.clamp(Math.round(pct), 0, 100)}%"></i></div>`;
const show = (el, on = true) => el.classList.toggle('tp-hidden', !on);
const debounce = (fn, ms) => { let h = 0; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const trendsUrl = (kw, geo) => `https://trends.google.com/trends/explore?gprop=youtube${geo ? '&geo=' + encodeURIComponent(geo) : ''}&q=${encodeURIComponent(kw)}`;
const acc = (id, icon, title, body, { open = false, extra = '' } = {}) => `<details class="tp-acc" data-sec="${id}" ${open ? 'open' : ''}><summary><span class="tp-acc__icon">${ic(icon, 15)}</span><span>${title}</span>${extra}<span class="tp-acc__chev">${ic('down', 16)}</span></summary><div class="tp-acc__body">${body}</div></details>`;

const COUNTRIES = ['MA', 'DZ', 'TN', 'EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'IQ', 'YE', 'JO', 'LB', 'SY', 'PS', 'LY', 'SD', 'FR', 'BE', 'CH', 'CA', 'US', 'GB', 'ES', 'DE', 'IT', 'NL', 'TR', 'IN', 'PK', 'ID', 'BR', 'MX', 'NG', 'SN', 'CI', 'ZA'];
const LANGS = ['ar', 'en', 'fr', 'es', 'de', 'it', 'pt', 'tr', 'hi', 'ur', 'id'];

let settings = null, ctx = null, pack = null, edit = null, job = null, studioJob = null, srcTouched = false;

/* =============== Général =============== */
function icons(root = document) {
  $$('[data-icon]', root).forEach((el) => { if (!el.dataset.iconDone) { el.insertAdjacentHTML('afterbegin', ic(el.dataset.icon, 15)); el.dataset.iconDone = '1'; } });
}

function showTab(name) {
  $$('.sp-navbtn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('.sp-tab').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + name));
  show($('#actionBar'), name === 'video' && !!pack);
  if (name === 'history') renderHistory();
  if (name === 'competitors') renderCompetitors();
  if (name === 'keywords') renderKp();
}

async function copy(text, msg = t('toast.copied')) {
  try { await navigator.clipboard.writeText(text); flash(msg); } catch (e) { flash(e.message); }
}

function flash(msg) {
  const el = $('#status');
  clearTimeout(flash.h);
  el.innerHTML = `<span class="sp-flash">${ic('check', 13)} ${esc(msg)}</span>`;
  flash.h = setTimeout(renderFooter, 2600);
}

const countryName = (c) => { try { return new Intl.DisplayNames([I18n.locale()], { type: 'region' }).of(c) || c; } catch (e) { return c; } };
const langName = (l) => { try { return new Intl.DisplayNames([I18n.locale()], { type: 'language' }).of(l) || l; } catch (e) { return l; } };
function fillSelect(sel, list, value, label) {
  sel.innerHTML = list.map((v) => `<option value="${esc(v)}">${esc(label(v))}</option>`).join('');
  if (value && list.includes(value)) sel.value = value;
}

function profile() {
  return settings.profiles.find((p) => p.id === $('#profile').value) || settings.profiles[0];
}

async function loadSettings() {
  settings = await getSettings();
  I18n.setLang(settings.uiLang || 'auto');
  I18n.apply(document);
  const sel = $('#profile');
  const cur = sel.value || settings.activeProfile;
  sel.innerHTML = settings.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = settings.profiles.some((p) => p.id === cur) ? cur : settings.profiles[0].id;
  $('#mediaMode').value = settings.mediaMode || 'auto';
  $('#lyricsChk').checked = !!settings.transcribeLyrics;
  $('#compChk').checked = !!settings.competitorLookup && !!settings.ytKey;
  $('#compChk').disabled = !settings.ytKey;
  $('#webChk').checked = settings.webTrends !== false;
  const p = profile();
  const lang = String(p.languages || 'en').split(/[,\s]+/)[0];
  fillSelect($('#kwHl'), LANGS, $('#kwHl').value || lang, langName);
  fillSelect($('#kwGl'), COUNTRIES, $('#kwGl').value || p.country, countryName);
  fillSelect($('#trGl'), COUNTRIES, $('#trGl').value || p.country, countryName);
  const web = settings.aiEngine !== 'api';
  const ok = web || !!settings.geminiKey;
  $('#engineChip').className = 'sp-engine' + (ok ? '' : ' off');
  $('#engineChip').innerHTML = `<i></i>${esc(web ? t('engine.web') : t('engine.api'))}`;
  syncSrc();
  renderFooter();
}

async function renderFooter() {
  const q = await getQuota();
  $('#status').innerHTML = `<span>${ic('sparkles', 12)} ${esc(settings.aiEngine === 'api' ? `API · ${settings.modelMain || 'auto'}` : t('engine.web'))}</span>
    <span>${ic('chart', 12)} ${settings.ytKey ? esc(t('footer.quota', { n: q.toLocaleString(I18n.locale()) })) : esc(t('footer.noYtKey'))}</span>`;
}

/* =============== Contexte : onglet actif =============== */
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshContext() {
  const tab = await activeTab();
  const url = tab?.url || '';
  let next = null;
  if (url.startsWith('https://studio.youtube.com')) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'studio:context' });
      next = r?.ok ? { ...r.data, tabId: tab.id } : { page: 'studio', stale: true };
    } catch (e) { next = { page: 'studio', stale: true }; }
  } else if (/^https:\/\/www\.youtube\.com\/watch/.test(url)) {
    next = { page: 'watch', videoId: new URL(url).searchParams.get('v') || '', tabId: tab.id, title: (tab.title || '').replace(/ - YouTube$/, '') };
  }
  ctx = next;
  renderCtx();
  if (!job && !studioJob && (ctx?.packKey || ctx?.videoId)) {
    const p = await getPack(ctx.packKey, ctx.videoId ? 'vid:' + ctx.videoId : '');
    if (p && p.key !== pack?.key) showPack(p);
  }
}

function renderCtx() {
  const box = $('#ctxCard');
  let title, sub, id = '';
  if (ctx?.page === 'studio' && ctx.stale) { title = t('ctx.studio'); sub = t('ctx.reload'); }
  else if (ctx?.page === 'studio') {
    id = ctx.videoId;
    title = ctx.title || t('ctx.studio');
    sub = ctx.hasFile ? t('ctx.fileCaptured', { name: ctx.fileName }) : ctx.editing ? t('ctx.noFile') : t('ctx.openVideo');
    if (ctx.job) sub = t('ctx.running', { step: t('step.' + ctx.job.step) });
  } else if (ctx?.page === 'watch') {
    id = ctx.videoId;
    title = ctx.title || t('ctx.watch');
    sub = t('ctx.watchHint');
    if (!$('#urlIn').value) $('#urlIn').value = 'https://www.youtube.com/watch?v=' + ctx.videoId;
  } else { title = t('ctx.none'); sub = t('ctx.noneHint'); }
  box.innerHTML = `<div class="tp-card"><div class="tp-card__body"><div class="sp-ctx">
    ${id ? `<img class="sp-thumb" src="https://i.ytimg.com/vi/${esc(id)}/mqdefault.jpg" alt="">` : `<div class="sp-thumb sp-thumb--icon">${ic('video', 22)}</div>`}
    <div class="tp-grow tp-stack tp-stack--sm"><b class="tp-ellipsis tp-bidi">${esc(title)}</b><span class="tp-small tp-muted">${esc(sub)}</span></div></div></div></div>`;
  const img = box.querySelector('img.sp-thumb');
  if (img) img.addEventListener('error', () => { img.outerHTML = `<div class="sp-thumb sp-thumb--icon">${ic('video', 22)}</div>`; }, { once: true });
  if (!srcTouched) {
    const v = ctx?.page === 'studio' && (ctx.hasFile || (ctx.videoId && settings.aiEngine !== 'api')) ? 'studio' : ctx?.page === 'watch' ? 'url' : 'file';
    $(`input[name=src][value=${v}]`).checked = true;
    syncSrc();
  }
}

function syncSrc() {
  const v = $('input[name=src]:checked')?.value || 'file';
  show($('#srcFile'), v === 'file');
  show($('#srcUrl'), v === 'url');
  $('#srcHelp').textContent = t('run.help.' + v);
  $('#runBtn').innerHTML = `${ic(v === 'express' ? 'zap' : 'sparkles', 17)} ${esc(v === 'express' ? t('run.goQuick') : t('run.go'))}`;
}

/* =============== Lancement =============== */
function showError(msg) {
  const el = $('#runErr');
  el.innerHTML = msg ? `<div class="tp-alert tp-alert--danger">${ic('alert', 15)}<span>${esc(msg)}</span></div>` : '';
  show(el, !!msg);
}

function showProgress(p) {
  const el = $('#progress');
  if (!p) { show(el, false); return; }
  show(el, true);
  const api = settings.aiEngine === 'api';
  const order = STEPS.filter((s) => s.id !== 'done' && (api ? s.id !== 'gemini' : s.id !== 'upload' && s.id !== 'processing'));
  const idx = Math.max(0, order.findIndex((s) => s.id === p.step));
  const pct = p.pct != null ? Math.round(p.pct * 100) : null;
  el.innerHTML = `<div class="tp-progress">
    <div class="tp-row tp-row--nowrap"><span class="tp-spinner"></span><b>${esc(t('step.' + (order[idx]?.id || p.step)))}</b>${pct != null ? `<span class="tp-faint">${pct}%</span>` : ''}<span class="tp-grow tp-ellipsis tp-small tp-muted">${esc(p.detail || '')}</span>
      <button class="tp-btn tp-btn--ghost tp-btn--sm" id="cancelBtn">${ic('x', 13)} ${esc(t('common.cancel'))}</button></div>
    <div class="tp-bar ${pct == null ? 'tp-bar--indet' : ''}"><i style="width:${pct ?? 30}%"></i></div>
    <div class="tp-steps">${order.map((s, i) => `<span class="tp-step ${i < idx ? 'tp-step--done' : i === idx ? 'tp-step--on' : ''}">${i < idx ? ic('check', 11) : ''}${esc(t('step.' + s.id))}</span>`).join('')}</div>
    ${p.warn ? `<div class="tp-alert tp-alert--warn">${ic('alert', 14)}<span>${esc(p.warn)}</span></div>` : ''}
  </div>`;
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
  if (settings.aiEngine === 'api' && !settings.geminiKey) return showError(t('err.apiNoKey'));
  const src = $('input[name=src]:checked').value;
  const channelMatch = ctx?.channelId && settings.profiles.some((p) => p.channelId === ctx.channelId);
  const extra = { keyword: $('#kwIn').value.trim(), notes: $('#notesIn').value.trim(), lyrics: $('#lyricsIn').value.trim(), profileId: channelMatch ? undefined : profile().id };
  const options = { mediaMode: $('#mediaMode').value, transcribeLyrics: $('#lyricsChk').checked, competitors: $('#compChk').checked, webTrends: $('#webChk').checked, reanalyze: $('#reChk').checked };

  if (src === 'studio') {
    if (ctx?.page !== 'studio' || ctx.stale) return showError(t('err.openStudio'));
    let r;
    try { r = await chrome.tabs.sendMessage(ctx.tabId, { type: 'studio:run', options: { mode: 'full', reanalyze: options.reanalyze, extra, runOptions: options } }); } catch (e) { r = { ok: false, error: t('err.studioNoAnswer') }; }
    if (!r?.ok) return showError(r?.error || t('err.studioStart'));
    studioJob = { key: r.data.key };
    $('#runBtn').disabled = true;
    showProgress({ step: 'prepare' });
    return;
  }

  const file = src === 'file' ? $('#fileIn').files[0] : null;
  if (src === 'file' && !file) return showError(t('err.pickFile'));
  const youtubeUrl = src === 'url' ? $('#urlIn').value.trim() : '';
  const urlId = youtubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] || '';
  if (src === 'url' && !urlId) return showError(t('err.badLink'));
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
  const chosen = p.seo.chosenTitle && p.seo.titles.find((x) => x.text === p.seo.chosenTitle);
  edit = { title: chosen?.text || p.seo.titles[0]?.text || '', description: p.seo.description, tags: [...p.seo.tags] };
  renderResult();
  show($('#actionBar'), $('#tab-video').classList.contains('on'));
}

const persist = debounce(async () => {
  if (!pack) return;
  pack.seo.description = edit.description;
  pack.seo.tags = edit.tags;
  pack.seo.chosenTitle = edit.title;
  await savePack(pack);
}, 800);

function scoreCard() {
  const r = Post.rescore(pack, edit);
  const src = pack.source?.fileName || pack.source?.youtubeUrl || pack.key;
  return {
    html: `<div class="tp-card"><div class="tp-card__body">
      <div class="sp-scorecard">${I.ring(r.score.overall, 58, t('score.overall'))}
        <div class="tp-stack tp-stack--sm tp-grow"><b class="tp-h2">${esc(t('score.overall'))}</b>
          <div class="tp-subscores"><span>${esc(t('score.titleShort'))} <b>${r.score.title}</b></span><span>${esc(t('score.descShort'))} <b>${r.score.description}</b></span><span>${esc(t('score.tagsShort'))} <b>${r.score.tags}</b></span></div>
          <span class="tp-tiny tp-faint tp-ellipsis">${ic('file', 11)} ${esc(src)} · ${esc(F.ago(pack.createdAt))}</span></div></div>
      ${pack.seo.audienceInsight ? `<div class="tp-alert tp-alert--info">${ic('users', 14)}<span><b>${esc(t('result.audience'))}</b> <span class="tp-bidi">${esc(pack.seo.audienceInsight)}</span></span></div>` : ''}
      ${pack.warnings?.length ? `<div class="tp-alert tp-alert--warn">${ic('info', 14)}<span>${pack.warnings.map(esc).join('<br>')}</span></div>` : ''}
    </div></div>`,
    issues: r.issues
  };
}

function issuesHtml(list, notes = []) {
  if (!list.length && !notes.length) return `<div class="tp-alert tp-alert--good">${ic('shield', 14)}<span>${esc(t('policy.allGood'))}</span></div>`;
  const icon = { error: 'alert', warn: 'alert', info: 'info' };
  return `<ul class="tp-issues">${list.map((i) => `<li class="${i.level}">${ic(icon[i.level], 14)}<span>${esc(i.msg)}${i.ref ? ` <a href="${esc(i.ref)}" target="_blank" rel="noopener">${esc(t('policy.help'))}</a>` : ''}</span></li>`).join('')}
    ${notes.map((n) => `<li class="info">${ic('sparkles', 14)}<span>${esc(n)}</span></li>`).join('')}</ul>`;
}

function titlesHtml(s) {
  return `<div class="tp-list" id="titles">${s.titles.map((x, i) => `<div class="tp-item tp-item--click ${x.text === edit.title ? 'tp-item--on' : ''}" data-act="pickTitle" data-i="${i}">
      ${I.pill(x.score, t('score.title'))}<div class="tp-item__main"><div class="tp-item__title tp-bidi">${esc(x.text)}</div><div class="tp-item__meta">${esc([x.hook, x.angle].filter(Boolean).join(' — '))}</div></div>
      <div class="tp-item__act"><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-act="copyTitle" data-i="${i}" title="${esc(t('common.copy'))}">${ic('copy', 13)}</button></div></div>`).join('')}</div>
    <label class="tp-field"><span class="tp-label">${esc(t('result.testTitle'))}</span><input id="customTitle" class="tp-input tp-bidi" placeholder="${esc(t('result.testTitlePh'))}"></label>
    <div id="customScore" class="tp-small"></div>
    ${s.abTitles?.length ? `<details><summary class="tp-small tp-muted">${ic('layers', 13)} ${esc(t('studio.abTitles'))}</summary><div class="tp-list" style="margin-top:6px">${s.abTitles.map((x) => `<div class="tp-item">${I.pill(x.score)}<div class="tp-item__main tp-bidi">${esc(x.text)}</div></div>`).join('')}</div><button class="tp-btn tp-btn--sm" data-act="copyAB" style="margin-top:6px">${ic('copy', 13)} ${esc(t('result.copyAB'))}</button></details>` : ''}`;
}

function descHtml() {
  return `<textarea id="descEdit" class="tp-textarea tp-bidi" rows="12">${esc(edit.description)}</textarea>
    <div class="tp-row"><button class="tp-btn tp-btn--primary tp-btn--sm" data-act="insDesc">${ic('upload', 13)} ${esc(t('studio.insertDescription'))}</button><button class="tp-btn tp-btn--sm" data-act="copyDesc">${ic('copy', 13)} ${esc(t('common.copy'))}</button><span class="tp-grow"></span><span class="tp-counter" id="descCount"></span></div>`;
}

function tagsHtml(s) {
  return `<div class="tp-chips" id="tagChips"></div>
    <div class="tp-inputgroup"><input id="tagAdd" class="tp-input" placeholder="${esc(t('result.addTagPh'))}"><button class="tp-btn tp-btn--sm" data-act="insTags">${ic('upload', 13)} ${esc(t('result.insertReplace'))}</button><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-act="copyTags" title="${esc(t('common.copy'))}">${ic('copy', 13)}</button></div>
    <div class="tp-row"><span class="tp-small tp-muted">${ic('hash', 13)}</span>${s.hashtags.map((h) => `<span class="tp-chip tp-chip--accent tp-bidi">${esc(h)}</span>`).join('')}<span class="tp-grow"></span><button class="tp-btn tp-btn--ghost tp-btn--sm" data-act="copyHashtags">${ic('copy', 13)} ${esc(t('studio.copyHashtags'))}</button></div>`;
}

function timelineHtml(s) {
  if (!s.chapters?.length) return `<div class="tp-small tp-muted">${esc(t('result.noChapters'))}</div>`;
  return `<div class="tp-list">${s.chapters.map((c) => {
    const hot = c.label.startsWith('🔥');
    return `<div class="tp-item"><span class="tp-chip ${hot ? 'tp-chip--hot' : ''}">${hot ? ic('flame', 12) : ic('clock', 12)}${F.ts(c.t)}</span><div class="tp-item__main tp-bidi">${esc(c.label.replace(/^🔥\s*/, ''))}</div></div>`;
  }).join('')}</div><div class="tp-tiny tp-faint">${esc(t('result.timelineNote'))}</div>`;
}

function analysisHtml(a, p) {
  if (!a) return `<div class="tp-small tp-muted">${esc(t('result.noListening'))}</div>`;
  const m = a.music || {};
  const local = p.ctx?.localBpm;
  const kv = [
    [t('an.style'), m.primary_genre ? `<b class="tp-bidi">${esc(m.primary_genre)}</b>${m.subgenres?.length ? ' · ' + esc(m.subgenres.join(', ')) : ''}${m.regional_style ? ` <span class="tp-faint">(${esc(m.regional_style)})</span>` : ''}` : ''],
    [t('an.fusion'), esc(m.fusion || '')],
    [t('an.tempo'), m.bpm || local ? `${m.bpm ? `${Math.round(m.bpm)} BPM` : ''}${m.bpm && local ? ' · ' : ''}${local ? `${local} BPM ${esc(t('an.measured'))}${p.media?.bpm?.alt ? ` / ${p.media.bpm.alt}` : ''}` : ''}${m.time_signature ? ' · ' + esc(m.time_signature) : ''}${m.pulse ? ' · ' + esc(m.pulse) : ''}` : ''],
    [t('an.rhythm'), esc(m.rhythm_pattern || '')],
    [t('an.percussion'), esc((m.percussion || []).join(', '))],
    [t('an.key'), esc([m.key, m.scale_or_maqam].filter(Boolean).join(' · '))],
    [t('an.energy'), m.energy ? `${m.energy}/10` : ''],
    [t('an.mood'), m.mood?.length ? m.mood.map((x) => `<span class="tp-chip">${esc(x)}</span>`).join(' ') : ''],
    [t('an.instruments'), esc((m.instruments || []).join(', '))],
    [t('an.vocals'), esc(m.vocals || '')],
    [t('an.language'), a.language ? `${esc(a.language)}${a.dialect ? ` · <b>${esc(a.dialect)}</b>` : ''}` : ''],
    [t('an.countries'), esc((a.target_countries || []).map(countryName).join(', '))],
    [t('an.hook'), m.hook_line ? `« <b class="tp-bidi">${esc(m.hook_line)}</b> »${m.hook_start != null ? ` · ${F.ts(m.hook_start)}` : ''}` : ''],
    [t('an.searchedAs'), (m.genre_search_terms || []).map((x) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwseed="${esc(x)}">${esc(x)}</span>`).join(' ')],
    [t('an.short'), a.best_short?.end ? `${F.ts(a.best_short.start)} → ${F.ts(a.best_short.end)} <span class="tp-faint">${esc(a.best_short.reason || '')}</span>` : ''],
    [t('an.cover'), a.is_cover ? esc(a.cover_original || '?') : ''],
    [t('an.confidence'), a.confidence != null ? `${Math.round(a.confidence * 100)}%` : '']
  ].filter(([, v]) => v);
  const cands = (m.rhythm_candidates || []).filter((c) => c?.name);
  return `${a.summary ? `<div class="tp-small tp-muted">${esc(a.summary)}</div>` : ''}
    <dl class="tp-kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
    ${cands.length ? `<div class="tp-stack tp-stack--sm"><b class="tp-small">${esc(t('an.candidates'))}</b>${cands.map((c) => `<div class="tp-meter" title="${esc(c.evidence || '')}"><span class="tp-ellipsis tp-bidi">${esc(c.name)}</span>${bar((c.confidence || 0) * 100)}<span class="tp-num">${Math.round((c.confidence || 0) * 100)}%</span></div>`).join('')}</div>` : ''}
    ${a.highlights?.length ? `<div class="tp-stack tp-stack--sm"><b class="tp-small">${esc(t('an.highlights'))}</b><div class="tp-list">${a.highlights.map((h) => `<div class="tp-item"><span class="tp-chip tp-chip--hot">${ic('flame', 12)}${F.ts(h.start)}</span><div class="tp-item__main"><div class="tp-item__title tp-bidi">${esc(h.label)}</div><div class="tp-item__meta">${esc(h.why || '')}</div></div></div>`).join('')}</div></div>` : ''}
    ${m.lyrics ? `<details><summary class="tp-small tp-muted">${ic('mic', 13)} ${esc(t('an.lyrics'))}</summary><div class="tp-pre" style="margin-top:6px">${esc(m.lyrics)}</div><button class="tp-btn tp-btn--sm" data-act="copyLyrics" style="margin-top:6px">${ic('copy', 13)} ${esc(t('common.copy'))}</button></details>` : ''}
    ${a.uncertain?.length ? `<div class="tp-tiny tp-faint">${esc(t('an.uncertain'))} ${esc(a.uncertain.join(' · '))}</div>` : ''}`;
}

function keywordsHtml(p) {
  const kw = p.keywords, c = p.competition, loc = kw?.locale;
  const geo = loc?.gl || '';
  return `${p.seo.keywordStrategy ? `<div class="tp-alert tp-alert--info">${ic('target', 14)}<span>${esc(p.seo.keywordStrategy)}</span></div>` : ''}
    ${loc ? `<div class="tp-tiny tp-faint">${esc(t('kw.searchedIn', { lang: langName(loc.hl), countries: (loc.countries || [loc.gl]).filter(Boolean).map(countryName).join(', ') || '—' }))}</div>` : ''}
    ${c ? `<div class="tp-kpis"><div class="tp-kpi"><b>${c.overall}</b><span>${esc(t('kw.score'))}</span></div><div class="tp-kpi"><b>${c.demand}</b><span>${esc(t('insight.demand'))}</span></div><div class="tp-kpi"><b>${100 - c.competition}</b><span>${esc(t('kw.ease'))}</span></div><div class="tp-kpi"><b>${F.num(c.medianViews)}</b><span>${esc(t('kw.medianViews'))}</span></div></div>` : ''}
    ${kw?.compared?.length > 1 ? `<div class="tp-small">${esc(t('kw.compared'))} ${kw.compared.map((x) => `<span class="tp-chip tp-bidi">${esc(x.kw)} ${I.pill(x.overall)}</span>`).join(' ')}</div>` : ''}
    ${kw?.items?.length ? `<table class="tp-table"><thead><tr><th>${esc(t('kw.keyword'))}</th><th>${esc(t('kw.popularity'))}</th><th class="tp-num">${esc(t('kw.volume'))}</th><th></th></tr></thead><tbody>
      ${kw.items.slice(0, 20).map((k) => `<tr class="sp-kwrow"><td class="tp-bidi">${esc(k.kw)}</td><td class="sp-kwbar">${bar(k.popularity)}</td><td class="tp-num tp-small">${k.volLabel ? esc(k.volLabel) : '<span class="tp-faint">—</span>'}</td>
        <td class="tp-num"><a class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" href="${esc(trendsUrl(k.kw, geo))}" target="_blank" rel="noopener" title="${esc(t('kw.trendsLink'))}">${ic('trending', 13)}</a><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-act="addTag" data-kw="${esc(k.kw)}" title="${esc(t('kw.addTag'))}">${ic('plus', 13)}</button></td></tr>`).join('')}
    </tbody></table>` : ''}
    ${c?.videos?.length ? `<details><summary class="tp-small tp-muted">${ic('users', 13)} ${esc(t('kw.topVideos', { kw: c.kw }))}</summary><div class="tp-list" style="margin-top:6px">${c.videos.map((v) => `<div class="tp-item sp-vid"><div class="tp-item__main"><a class="tp-bidi" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="tp-item__meta">${esc(v.channelTitle)} · ${F.num(v.views)} ${esc(t('watch.views'))} · ${F.num(v.subs)} ${esc(t('watch.subs'))}</div></div></div>`).join('')}</div></details>` : ''}`;
}

function trendsHtml(p) {
  const yt = p.trends?.youtube, web = p.trends?.web;
  if (!yt && !web) return '';
  return `${yt ? `<b class="tp-small">${esc(t('trends.youtube', { country: countryName(yt.region) }))}</b>
      ${yt.hashtags?.length ? `<div class="tp-chips">${yt.hashtags.map((h) => `<span class="tp-chip tp-chip--click tp-bidi" data-copy="${esc(h.tag)}" title="${esc(t('common.copy'))}">${esc(h.tag)} <span class="tp-faint">×${h.n}</span></span>`).join('')}</div>` : ''}
      ${yt.tags?.length ? `<div class="tp-chips">${yt.tags.map((x) => `<span class="tp-chip tp-chip--click tp-bidi" data-act="addTag" data-kw="${esc(x.tag)}" title="${esc(t('kw.addTag'))}">${esc(x.tag)} <span class="tp-faint">×${x.n}</span></span>`).join('')}</div>` : ''}` : ''}
    ${web ? `<b class="tp-small">${esc(t('trends.web'))}</b>${web.notes ? `<div class="tp-small tp-muted">${esc(web.notes)}</div>` : ''}
      ${web.keywords?.length ? `<div class="tp-chips">${web.keywords.map((k) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwseed="${esc(k)}">${esc(k)}</span>`).join('')}</div>` : ''}
      ${web.hashtags?.length ? `<div class="tp-chips">${web.hashtags.map((h) => `<span class="tp-chip tp-chip--accent tp-chip--click tp-bidi" data-copy="${esc(h)}">${esc(h)}</span>`).join('')}</div>` : ''}
      ${web.sources?.length ? `<div class="tp-tiny tp-faint">${esc(t('trends.sources'))} ${web.sources.map((x) => `<a href="${esc(x.uri)}" target="_blank" rel="noopener">${esc(x.title || 'link')}</a>`).join(' · ')}</div>` : ''}` : ''}
    <div class="tp-tiny tp-faint">${esc(t('trends.note'))}</div>`;
}

function extrasHtml(s) {
  return `${s.pinnedComment ? `<div class="tp-item">${ic('message', 15)}<div class="tp-item__main"><div class="tp-item__meta">${esc(t('result.pinned'))}</div><div class="tp-bidi">${esc(s.pinnedComment)}</div></div><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-act="copyPinned">${ic('copy', 13)}</button></div>` : ''}
    ${s.thumbnail ? `<div class="tp-item">${ic('image', 15)}<div class="tp-item__main"><div class="tp-item__meta">${esc(t('result.thumbnail'))}</div><div class="tp-chips">${(s.thumbnail.texts || []).map((x) => `<span class="tp-chip tp-bidi">${esc(x)}</span>`).join('')}</div><div class="tp-small tp-muted">${esc(s.thumbnail.concept || '')}</div></div>${s.thumbnail.prompt ? `<button class="tp-btn tp-btn--ghost tp-btn--sm" data-act="copyThumb" title="${esc(t('result.copyImagePrompt'))}">${ic('copy', 13)}</button>` : ''}</div>` : ''}
    ${s.short?.title ? `<div class="tp-item">${ic('video', 15)}<div class="tp-item__main"><div class="tp-item__meta">${esc(t('result.short'))}</div><b class="tp-bidi">${esc(s.short.title)}</b><div class="tp-small tp-muted tp-bidi">${esc(s.short.description || '')}</div></div></div>` : ''}`;
}

function renderResult() {
  const box = $('#result');
  if (!pack) { box.innerHTML = ''; return; }
  const s = pack.seo;
  const head = scoreCard();
  const important = head.issues.filter((i) => i.level !== 'info').length;
  const count = (n) => `<span class="tp-faint tp-small">${n}</span>`;
  box.innerHTML = [
    head.html,
    acc('titles', 'sparkles', esc(t('tab.titles')), titlesHtml(s), { open: true, extra: count(s.titles.length) }),
    acc('description', 'file', esc(t('tab.description')), descHtml(), { open: true }),
    acc('tags', 'tag', esc(t('tab.tags')), tagsHtml(s), { open: true, extra: '<span class="tp-counter" id="tagCount"></span>' }),
    acc('timeline', 'clock', esc(t('result.timeline')), timelineHtml(s), { open: !!s.chapters?.length, extra: count(s.chapters?.length || 0) }),
    acc('analysis', 'music', esc(t('result.analysis')), analysisHtml(pack.analysis, pack)),
    pack.keywords || pack.competition ? acc('keywords', 'key', esc(t('result.keywords')), keywordsHtml(pack), { extra: `<span class="tp-small tp-faint tp-ellipsis tp-bidi">${esc(s.mainKeyword || '')}</span>` }) : '',
    pack.trends ? acc('trends', 'trending', esc(t('result.trends')), trendsHtml(pack)) : '',
    acc('extras', 'wand', esc(t('result.extras')), extrasHtml(s)),
    acc('policy', 'shield', esc(t('tab.policy')), `<div id="issuesBox">${issuesHtml(head.issues, s.complianceNotes)}</div>`, { open: important > 0, extra: important ? `<span class="tp-chip tp-chip--hot">${important}</span>` : '' })
  ].join('');
  renderTags(false);
  updateCounters();
  $('#descEdit').addEventListener('input', (e) => { edit.description = e.target.value; updateCounters(); rescoreSoon(); persist(); });
  $('#tagAdd').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.target.value.split(',').forEach((x) => addTag(x));
    e.target.value = '';
  });
  $('#customTitle').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (!v) { $('#customScore').innerHTML = ''; return; }
    const r = S.scoreTitle(v, { keyword: pack.seo.mainKeyword, competitorTitles: (pack.competition?.videos || []).map((x) => x.title) });
    $('#customScore').innerHTML = `<div class="tp-row">${I.pill(r.score)}<span class="tp-muted">${r.parts.map((x) => `${esc(x.label)} ${Math.round(x.pts)}/${x.max}`).join(' · ')}</span></div>
      ${r.parts.filter((x) => x.pts < x.max).map((x) => `<div class="tp-tiny tp-faint">• ${esc(x.tip)}</div>`).join('')}
      <button class="tp-btn tp-btn--sm" data-act="useCustom" style="margin-top:6px">${ic('check', 13)} ${esc(t('result.useTitle'))}</button>`;
  });
}

function updateCounters() {
  const n = edit.description.length;
  const dc = $('#descCount');
  if (dc) { dc.textContent = `${n}/5000`; dc.classList.toggle('tp-counter--over', n > 5000); }
  const tc = $('#tagCount');
  if (tc) { const l = P.tagsLength(edit.tags); tc.textContent = `${edit.tags.length} · ${l}/500`; tc.classList.toggle('tp-counter--over', l > 500); }
}

const rescoreSoon = debounce(() => {
  if (!pack) return;
  const head = scoreCard();
  const first = $('#result > .tp-card');
  if (first) first.outerHTML = head.html;
  const ib = $('#issuesBox');
  if (ib) ib.innerHTML = issuesHtml(head.issues, pack.seo.complianceNotes);
}, 350);

function renderTags(save = true) {
  const box = $('#tagChips');
  if (!box) return;
  box.innerHTML = edit.tags.map((x, i) => `<span class="tp-chip tp-bidi">${esc(x)}<button class="tp-chip__x" data-act="rmTag" data-i="${i}" title="${esc(t('common.remove'))}">${ic('x', 12)}</button></span>`).join('');
  updateCounters();
  if (save) { rescoreSoon(); persist(); }
}

function addTag(x) {
  const tag = P.cleanTag(x);
  if (!tag || edit.tags.some((y) => F.norm(y) === F.norm(tag))) return;
  if (P.tagsLength([...edit.tags, tag]) > 500) { flash(t('result.tagLimit')); return; }
  edit.tags.push(tag);
  renderTags();
}

async function studioApply(fields) {
  const tab = await activeTab();
  if (!tab?.url?.startsWith('https://studio.youtube.com')) throw new Error(t('err.openStudioVideo'));
  let r;
  try { r = await chrome.tabs.sendMessage(tab.id, { type: 'studio:apply', fields }); } catch (e) { throw new Error(t('err.studioNoAnswer')); }
  if (!r?.ok) throw new Error(r?.error || t('err.insertFailed'));
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
      $$('#titles .tp-item').forEach((el) => el.classList.toggle('tp-item--on', el === b));
      rescoreSoon();
      persist();
    } else if (act === 'copyTitle') { e.stopPropagation(); copy(s.titles[+b.dataset.i].text); }
    else if (act === 'useCustom') { edit.title = P.sanitizeTitle($('#customTitle').value); rescoreSoon(); persist(); flash(t('toast.titleChosen')); }
    else if (act === 'copyAB') copy(s.abTitles.map((x) => x.text).join('\n'));
    else if (act === 'copyDesc') copy(edit.description);
    else if (act === 'copyTags') copy(edit.tags.join(', '));
    else if (act === 'copyHashtags') copy(s.hashtags.join(' '));
    else if (act === 'copyPinned') copy(s.pinnedComment);
    else if (act === 'copyThumb') copy(s.thumbnail?.prompt || '');
    else if (act === 'copyLyrics') copy(pack.analysis?.music?.lyrics || '');
    else if (act === 'rmTag') { edit.tags.splice(+b.dataset.i, 1); renderTags(); }
    else if (act === 'addTag') { addTag(b.dataset.kw); flash(t('toast.tagAdded')); }
    else if (act === 'insDesc') { await studioApply({ description: edit.description }); flash(t('toast.descInserted')); }
    else if (act === 'insTags') { await studioApply({ tags: edit.tags, replaceTags: true }); flash(t('toast.tagsInserted')); }
  } catch (err) {
    showError(err.message);
    $('#runErr').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

async function onActionBar(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !pack) return;
  try {
    if (b.dataset.act === 'insAll') {
      const d = await studioApply({ title: edit.title, description: edit.description, tags: edit.tags, replaceTags: true });
      flash(t('toast.inserted', { fields: d.join(', ') }));
    } else if (b.dataset.act === 'regen') {
      $('input[name=src][value=express]').checked = true;
      srcTouched = true;
      syncSrc();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      runNow();
    }
  } catch (err) {
    showError(err.message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* =============== Copier-coller manuel (secours) =============== */
async function copyManualPrompt() {
  const studio = ctx?.page === 'studio' ? ctx : {};
  const name = studio.fileName || $('#fileIn').files[0]?.name || '';
  copy(manualPrompt({
    profile: profile(), fileName: name, cleanTitle: F.cleanFileName(name), keyword: $('#kwIn').value.trim(), notes: $('#notesIn').value.trim(),
    lyrics: $('#lyricsIn').value.trim(), transcribeLyrics: $('#lyricsChk').checked, titleCount: settings.titleCount, currentTitle: studio.title || ''
  }), t('manual.copied'));
}

async function applyManual() {
  showError('');
  const studio = ctx?.page === 'studio' ? ctx : {};
  try {
    const p = await fromManual({ text: $('#manualIn').value, ctx: { fileName: studio.fileName || '', fileSize: studio.fileSize || 0, videoId: studio.videoId || '', channelId: studio.channelId || '', profileId: profile().id, packKey: studio.packKey || undefined } });
    $('#manualIn').value = '';
    showPack(p);
    flash(t('manual.imported'));
  } catch (e) { showError(e.message); }
}

/* =============== Mots-clés =============== */
let kwData = null, basket = [];

async function loadBasket() {
  basket = (await chrome.storage.local.get('basket')).basket || [];
  renderBasket();
}

function renderBasket() {
  $('#basketChips').innerHTML = basket.map((x, i) => `<span class="tp-chip tp-bidi">${esc(x)}<button class="tp-chip__x" data-bi="${i}">${ic('x', 12)}</button></span>`).join('') || `<span class="tp-small tp-faint">${esc(t('basket.empty'))}</span>`;
  $('#basketInfo').textContent = `${basket.length} · ${P.tagsLength(basket)}/500`;
  chrome.storage.local.set({ basket });
}

function toBasket(kw) {
  if (basket.some((x) => F.norm(x) === F.norm(kw))) return;
  basket.push(P.cleanTag(kw));
  renderBasket();
}

async function renderKp() {
  const st = await kpStats();
  $('#kpState').textContent = st.total ? t('kp.state', { n: st.total.toLocaleString(I18n.locale()) }) : '';
}

async function importKp(files) {
  const msg = $('#kpMsg');
  let total = 0, last = null;
  try {
    for (const f of files) {
      last = await importKeywordPlanner(await f.arrayBuffer(), { country: $('#kwGl').value, lang: $('#kwHl').value });
      total += last.imported;
    }
    msg.innerHTML = `<div class="tp-alert tp-alert--good">${ic('check', 14)}<span>${esc(t('kp.done', { n: total.toLocaleString(I18n.locale()), total: (last?.total || 0).toLocaleString(I18n.locale()) }))}</span></div>`;
    renderKp();
    if (kwData) kwSearch(kwData.seed);
  } catch (e) {
    msg.innerHTML = `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(e.message === 'no-header' ? t('kp.badFile') : e.message)}</span></div>`;
  }
}

async function kwSearch(seedArg) {
  const seed = (seedArg ?? $('#kwSeed').value).trim();
  if (!seed) return;
  $('#kwSeed').value = seed;
  $('#kwDetail').innerHTML = '';
  $('#kwResults').innerHTML = '';
  const prog = (p) => { $('#kwProgress').innerHTML = `<div class="tp-card"><div class="tp-card__body"><div class="tp-row"><span class="tp-spinner"></span><span class="tp-small">${esc(t('kw.searching'))} ${Math.round(p * 100)}%</span></div>${bar(p * 100)}</div></div>`; };
  prog(0.05);
  try {
    kwData = await research(seed, { hl: $('#kwHl').value, gl: $('#kwGl').value, deep: $('#kwDeep').checked, onProgress: prog });
    renderKw();
  } catch (e) {
    $('#kwResults').innerHTML = `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(e.message)}</span></div>`;
  } finally {
    $('#kwProgress').innerHTML = '';
  }
}

function renderKw(filter = '') {
  if (!kwData) return;
  const f = F.norm(filter);
  const items = kwData.items.filter((k) => !f || F.norm(k.kw).includes(f));
  const geo = $('#kwGl').value;
  const hasVol = kwData.items.some((k) => k.vol);
  $('#kwResults').innerHTML = `<div class="tp-card">
    <div class="tp-card__head"><span class="tp-acc__icon">${ic('search', 15)}</span><b>${esc(t('kw.found', { n: kwData.items.length }))}</b><span class="tp-grow"></span><input id="kwFilter" class="tp-input" style="max-width:150px;min-height:30px" placeholder="${esc(t('kw.filter'))}" value="${esc(filter)}"></div>
    <div class="tp-card__body">
      ${!hasVol ? `<div class="tp-tiny tp-faint">${esc(t('kw.noVolumeHint'))}</div>` : ''}
      <table class="tp-table"><thead><tr><th>${esc(t('kw.keyword'))}</th><th>${esc(t('kw.popularity'))}</th><th class="tp-num">${esc(t('kw.volume'))}</th><th></th></tr></thead><tbody>
      ${items.slice(0, 90).map((k) => `<tr class="sp-kwrow"><td><span class="tp-bidi">${esc(k.kw)}</span> ${k.direct ? `<span class="tp-chip tp-chip--accent" style="height:20px;font-size:10.5px">${esc(t('kw.top'))}</span>` : ''}${k.words >= 4 ? ` <span class="tp-chip" style="height:20px;font-size:10.5px">${esc(t('kw.longTail'))}</span>` : ''}</td>
        <td class="sp-kwbar">${bar(k.popularity)}<span class="tp-tiny tp-faint">${k.popularity}</span></td>
        <td class="tp-num tp-small">${k.volLabel ? esc(k.volLabel) : '<span class="tp-faint">—</span>'}</td>
        <td class="tp-num"><a class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" href="${esc(trendsUrl(k.kw, geo))}" target="_blank" rel="noopener" title="${esc(t('kw.trendsLink'))}">${ic('trending', 13)}</a><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-kwadd="${esc(k.kw)}" title="${esc(t('basket.add'))}">${ic('plus', 13)}</button><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-kwan="${esc(k.kw)}" title="${esc(t('kw.analyze'))}">${ic('chart', 13)}</button></td></tr>`).join('')}
      </tbody></table>
    </div></div>`;
  const inp = $('#kwFilter');
  inp.addEventListener('input', debounce(() => { renderKw(inp.value); const v = $('#kwFilter'); v.focus(); v.setSelectionRange(v.value.length, v.value.length); }, 250));
}

async function kwAnalyze(kw) {
  const box = $('#kwDetail');
  if (!settings.ytKey) { box.innerHTML = `<div class="tp-alert tp-alert--warn">${ic('key', 14)}<span>${esc(t('err.needYtKey'))} <a class="tp-link" data-open-options>${esc(t('common.openSettings'))}</a></span></div>`; return; }
  box.innerHTML = `<div class="tp-card"><div class="tp-card__body"><div class="tp-row"><span class="tp-spinner"></span>${esc(t('kw.analyzing', { kw }))}</div></div></div>`;
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  try {
    const c = await competition(kw, { regionCode: $('#kwGl').value, relevanceLanguage: $('#kwHl').value });
    const pat = c.patterns;
    box.innerHTML = `<div class="tp-card">
      <div class="tp-card__head">${I.ring(c.overall, 42, t('kw.score'))}<div class="tp-grow"><b class="tp-bidi">${esc(kw)}</b><div class="tp-tiny tp-faint">${esc(t('kw.scoreExplain'))}</div></div><a class="tp-btn tp-btn--sm" href="${esc(trendsUrl(kw, $('#kwGl').value))}" target="_blank" rel="noopener">${ic('trending', 13)} Trends</a></div>
      <div class="tp-card__body">
        <div class="tp-kpis"><div class="tp-kpi"><b>${c.demand}</b><span>${esc(t('insight.demand'))}</span></div><div class="tp-kpi"><b>${100 - c.competition}</b><span>${esc(t('kw.ease'))}</span></div><div class="tp-kpi"><b>${F.num(c.medianViews)}</b><span>${esc(t('kw.medianViews'))}</span></div><div class="tp-kpi"><b>${F.num(c.medianSubs)}</b><span>${esc(t('kw.medianSubs'))}</span></div></div>
        <b class="tp-small">${esc(t('kw.whatWorks'))}</b>
        ${pat.hooks.slice(0, 6).map((h) => `<div class="tp-meter"><span>${esc(t('hook.' + h.k))}</span>${bar(h.pct)}<span class="tp-num">${h.pct}%</span></div>`).join('')}
        <div class="tp-tiny tp-faint">${esc(t('kw.traits', { len: pat.avgLength, emoji: pat.traits.emoji, caps: pat.traits.caps, year: pat.traits.year }))}</div>
        <div class="tp-chips">${pat.words.map((w) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwseed="${esc(w.k)}">${esc(w.k)} <span class="tp-faint">×${w.c}</span></span>`).join('')}</div>
        ${c.tags.length ? `<details><summary class="tp-small tp-muted">${ic('tag', 13)} ${esc(t('kw.compTags'))}</summary><div class="tp-chips" style="margin-top:6px">${c.tags.map((x) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwadd="${esc(x.tag)}">${esc(x.tag)} <span class="tp-faint">×${x.n}</span></span>`).join('')}</div></details>` : ''}
        <details open><summary class="tp-small tp-muted">${ic('users', 13)} ${esc(t('kw.top15'))}</summary><div class="tp-list" style="margin-top:6px">${c.videos.map((v) => `<div class="tp-item sp-vid"><div class="tp-item__main"><a class="tp-bidi" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
          <div class="tp-item__meta">${esc(v.channelTitle)} · ${F.num(v.views)} ${esc(t('watch.views'))} · ${F.num(v.vph)}/h · ${F.num(v.subs)} ${esc(t('watch.subs'))} · ${esc(F.ago(v.publishedAt))}${v.outlier >= 2 ? ` · 🔥 ×${v.outlier.toFixed(1)}` : ''}</div></div></div>`).join('')}</div></details>
        <button id="hooksBtn" class="tp-btn tp-btn--primary">${ic('target', 15)} ${esc(t('kw.hooksBtn'))}</button>
        <div id="hooksOut"></div>
      </div></div>`;
    $('#hooksBtn').onclick = () => runHooks(c.videos.map((v) => ({ title: v.title, views: v.views })), kw, $('#hooksOut'));
  } catch (e) {
    box.innerHTML = `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(e.message)}</span></div>`;
  }
}

async function runHooks(titles, topic, out) {
  if (settings.aiEngine === 'api' && !settings.geminiKey) { out.innerHTML = `<div class="tp-alert tp-alert--warn">${ic('key', 14)}<span>${esc(t('err.apiNoKey'))}</span></div>`; return; }
  out.innerHTML = `<div class="tp-row tp-small"><span class="tp-spinner"></span>${esc(t('hooks.running', { n: titles.length }))}</div>`;
  try {
    const r = await analyzeHooks(titles, { topic, profileId: profile().id });
    out.innerHTML = `<div class="tp-stack">
      ${r.formulas.map((f) => `<div class="tp-item"><div class="tp-item__main"><b>${esc(f.name)}</b><code class="tp-small tp-bidi">${esc(f.template)}</code>${f.example ? `<div class="tp-item__meta tp-bidi">${esc(f.example)}</div>` : ''}<div class="tp-tiny tp-faint">${esc(f.why)}</div></div></div>`).join('')}
      ${r.power_words?.length ? `<div class="tp-chips">${r.power_words.map((w) => `<span class="tp-chip tp-chip--accent tp-bidi">${esc(w)}</span>`).join('')}</div>` : ''}
      ${r.recommendations?.length ? `<ul class="tp-small sp-ol">${r.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <b class="tp-small">${esc(t('hooks.ideas'))}</b>
      <div class="tp-list">${r.title_ideas.map((x) => `<div class="tp-item">${I.pill(x.score)}<div class="tp-item__main"><div class="tp-item__title tp-bidi">${esc(x.text)}</div><div class="tp-item__meta">${esc(x.hook_type)}</div></div><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-copy="${esc(x.text)}">${ic('copy', 13)}</button></div>`).join('')}</div>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(e.message)}</span></div>`;
  }
}

/* =============== Concurrents =============== */
async function renderCompetitors() {
  const list = await getCompetitors();
  $('#compList').innerHTML = list.length ? list.map((c) => `<div class="tp-item"><img src="${esc(c.thumb || '')}" width="30" height="30" style="border-radius:50%;flex:none" alt=""><div class="tp-item__main"><b class="tp-bidi">${esc(c.title)}</b><div class="tp-item__meta">${esc(c.handle || c.id)} · ${F.num(c.subs)} ${esc(t('watch.subs'))}</div></div><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-rmcomp="${esc(c.id)}" title="${esc(t('common.remove'))}">${ic('trash', 13)}</button></div>`).join('')
    : `<div class="tp-empty">${ic('users', 22)}<span class="tp-small">${esc(t('comp.empty'))}</span></div>`;
  const cache = (await chrome.storage.local.get('compCache')).compCache;
  if (cache?.videos?.length && !$('#compVideos').dataset.filled) renderCompVideos(cache.videos, cache.ts);
  else if (!cache?.videos?.length) $('#compVideos').innerHTML = `<div class="tp-small tp-faint">${esc(t('comp.refreshHint'))}</div>`;
}

async function addCompetitor() {
  const v = $('#compIn').value.trim();
  if (!v) return;
  try {
    const c = await YT.resolveChannel(v);
    if (!c) throw new Error(t('comp.notFound'));
    const list = await getCompetitors();
    if (!list.some((x) => x.id === c.id)) list.push({ id: c.id, title: c.title, handle: c.handle, thumb: c.thumb, subs: c.subs, uploads: c.uploads, addedAt: Date.now() });
    await setCompetitors(list);
    $('#compIn').value = '';
    renderCompetitors();
  } catch (e) { flash(e.message); }
}

async function refreshCompetitors() {
  const list = await getCompetitors();
  if (!list.length) return;
  if (!settings.ytKey) { $('#compVideos').innerHTML = `<div class="tp-alert tp-alert--warn">${ic('key', 14)}<span>${esc(t('err.needYtKey'))}</span></div>`; return; }
  $('#compVideos').innerHTML = `<div class="tp-row tp-small"><span class="tp-spinner"></span>${esc(t('comp.loading', { n: list.length }))}</div>`;
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
  const box = $('#compVideos');
  box.dataset.filled = '1';
  box.innerHTML = `<div class="tp-tiny tp-faint">${esc(t('comp.updated', { ago: F.ago(ts) }))}</div>` + videos.slice(0, 30).map((v) => `<div class="tp-item sp-vid"><span class="tp-pill tp-pill--${v.outlier >= 3 ? 'good' : v.outlier >= 1.5 ? 'mid' : 'bad'}" title="${esc(t('comp.outlierHint'))}">×${v.outlier >= 10 ? Math.round(v.outlier) : v.outlier.toFixed(1)}</span>
    <div class="tp-item__main"><a class="tp-bidi" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="tp-item__meta">${esc(v.channelTitle)} · ${F.num(v.views)} ${esc(t('watch.views'))} · ${F.num(v.vph)}/h · ${esc(F.ago(v.publishedAt))}</div>
    <div class="tp-chips">${S.detectHooks(v.title).map((h) => `<span class="tp-chip" style="height:20px;font-size:11px">${esc(t('hook.' + h))}</span>`).join('')}</div></div></div>`).join('');
  const winners = videos.filter((v) => v.outlier >= 1.5).slice(0, 40);
  const base = winners.length >= 5 ? winners : videos.slice(0, 20);
  const pat = S.titlePatterns(base.map((v) => v.title));
  const days = Array(7).fill(0), hours = Array(24).fill(0);
  base.forEach((v) => { const d = new Date(v.publishedAt); days[d.getDay()]++; hours[d.getHours()]++; });
  const maxD = Math.max(1, ...days);
  const dayName = (i) => new Date(2024, 0, 7 + i).toLocaleDateString(I18n.locale(), { weekday: 'short' });
  const bestHours = hours.map((n, h) => ({ h, n })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
  const tagFreq = {};
  base.forEach((v) => (v.tags || []).forEach((x) => { const k = x.trim(); tagFreq[k] = (tagFreq[k] || 0) + 1; }));
  const tags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 30);
  $('#compInsights').innerHTML = `<div class="tp-card"><div class="tp-card__head"><span class="tp-acc__icon">${ic('target', 15)}</span><b>${esc(t('comp.insights'))}</b></div><div class="tp-card__body">
    <div class="tp-tiny tp-faint">${esc(winners.length >= 5 ? t('comp.basedWinners', { n: base.length }) : t('comp.basedRecent', { n: base.length }))}</div>
    ${pat.hooks.slice(0, 6).map((h) => `<div class="tp-meter"><span>${esc(t('hook.' + h.k))}</span>${bar(h.pct)}<span class="tp-num">${h.pct}%</span></div>`).join('')}
    <div class="tp-tiny tp-faint">${esc(t('kw.traits', { len: pat.avgLength, emoji: pat.traits.emoji, caps: pat.traits.caps, year: pat.traits.year }))}</div>
    <div class="tp-chips">${pat.words.map((w) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwseed="${esc(w.k)}">${esc(w.k)} <span class="tp-faint">×${w.c}</span></span>`).join('')}</div>
    <b class="tp-small">${esc(t('comp.when'))}</b>
    ${days.map((n, i) => `<div class="tp-meter"><span>${esc(dayName(i))}</span>${bar((n / maxD) * 100)}<span class="tp-num">${n}</span></div>`).join('')}
    <div class="tp-small">${esc(t('comp.bestHours'))} ${bestHours.map((x) => `<b>${x.h}:00</b>`).join(', ') || '—'}</div>
    ${tags.length ? `<details><summary class="tp-small tp-muted">${ic('tag', 13)} ${esc(t('comp.topTags'))}</summary><div class="tp-chips" style="margin-top:6px">${tags.map(([x, n]) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwadd="${esc(x)}">${esc(x)} <span class="tp-faint">×${n}</span></span>`).join('')}</div></details>` : ''}
    <button id="compHooks" class="tp-btn tp-btn--primary">${ic('target', 15)} ${esc(t('kw.hooksBtn'))}</button>
    <div id="compHooksOut"></div>
  </div></div>`;
  $('#compHooks').onclick = () => runHooks(base.map((v) => ({ title: v.title, views: v.views })), '', $('#compHooksOut'));
}

/* =============== Tendances =============== */
async function loadTrends() {
  const out = $('#trResults');
  if (!settings.ytKey) { out.innerHTML = `<div class="tp-alert tp-alert--warn">${ic('key', 14)}<span>${esc(t('err.needYtKey'))} <a class="tp-link" data-open-options>${esc(t('common.openSettings'))}</a></span></div>`; return; }
  out.innerHTML = `<div class="tp-row tp-small"><span class="tp-spinner"></span>${esc(t('common.loading'))}</div>`;
  try {
    const vids = (await YT.trending({ regionCode: $('#trGl').value, videoCategoryId: $('#trCat').value })).sort((a, b) => b.vph - a.vph);
    const pat = S.titlePatterns(vids.map((v) => v.title));
    const tagFreq = {};
    vids.forEach((v) => F.uniq(v.tags || []).forEach((x) => { tagFreq[x] = (tagFreq[x] || 0) + 1; }));
    const tags = Object.entries(tagFreq).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 30);
    renderFooter();
    out.innerHTML = `<div class="tp-card"><div class="tp-card__head"><span class="tp-acc__icon">${ic('sparkles', 15)}</span><b>${esc(t('trends.topics'))}</b></div><div class="tp-card__body">
      <div class="tp-chips">${pat.words.map((w) => `<span class="tp-chip tp-chip--click tp-bidi" data-kwseed="${esc(w.k)}">${esc(w.k)} <span class="tp-faint">×${w.c}</span></span>`).join('') || '—'}</div>
      ${tags.length ? `<div class="tp-chips">${tags.map(([x, n]) => `<span class="tp-chip tp-chip--accent tp-chip--click tp-bidi" data-kwseed="${esc(x)}">${esc(x)} <span class="tp-faint">×${n}</span></span>`).join('')}</div>` : ''}
      ${pat.hooks.slice(0, 5).map((h) => `<div class="tp-meter"><span>${esc(t('hook.' + h.k))}</span>${bar(h.pct)}<span class="tp-num">${h.pct}%</span></div>`).join('')}
    </div></div>
    <div class="tp-list">${vids.map((v, i) => `<div class="tp-item sp-vid"><b class="tp-faint" style="min-width:18px">${i + 1}</b><img src="${esc(v.thumb)}" width="72" style="border-radius:6px;aspect-ratio:16/9;object-fit:cover;flex:none" alt=""><div class="tp-item__main"><a class="tp-bidi" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
      <div class="tp-item__meta">${esc(v.channelTitle)} · ${F.num(v.views)} · <b>${F.num(v.vph)}/h</b> · ${esc(F.ago(v.publishedAt))}</div></div></div>`).join('')}</div>`;
  } catch (e) {
    out.innerHTML = `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(e.message)}</span></div>`;
  }
}

/* =============== Historique =============== */
async function renderHistory() {
  const list = await listPacks();
  $('#histList').innerHTML = list.length ? `<div class="tp-list">${list.map((x) => `<div class="tp-item">${I.pill(x.score || 0)}<div class="tp-item__main"><b class="tp-ellipsis tp-bidi">${esc(x.title)}</b><div class="tp-item__meta">${esc(x.fileName || x.videoId || x.key)} · ${esc(F.ago(x.createdAt))}</div></div>
      <button class="tp-btn tp-btn--sm" data-open="${esc(x.key)}">${esc(t('common.open'))}</button><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-del="${esc(x.key)}" title="${esc(t('common.remove'))}">${ic('trash', 13)}</button></div>`).join('')}</div>`
    : `<div class="tp-card"><div class="tp-empty">${ic('history', 24)}<span>${esc(t('history.empty'))}</span></div></div>`;
}

/* =============== Intentions venant des pages YouTube =============== */
async function handleIntent(intent) {
  if (!intent || Date.now() - (intent.ts || 0) > 15000) return;
  await chrome.storage.session.remove('panelIntent');
  if (intent.tab) showTab(intent.tab);
  if (intent.tab === 'video' && intent.url) {
    $('input[name=src][value=url]').checked = true;
    srcTouched = true;
    syncSrc();
    $('#urlIn').value = intent.url;
    if (intent.autorun && !job && !studioJob) runNow();
  }
  if (intent.tab === 'keywords' && intent.keyword) kwSearch(intent.keyword);
  if (intent.tab === 'competitors' && intent.channelId) {
    const list = await getCompetitors();
    if (!list.some((c) => c.id === intent.channelId)) $('#compIn').value = intent.channelId;
  }
}

/* =============== Événements =============== */
function bind() {
  $$('.sp-navbtn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-options]')) chrome.runtime.openOptionsPage();
    const seed = e.target.closest('[data-kwseed]');
    if (seed) { showTab('keywords'); kwSearch(seed.dataset.kwseed); }
    const add = e.target.closest('[data-kwadd]');
    if (add) { toBasket(add.dataset.kwadd); flash(t('basket.added')); }
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
  $('#actionBar').addEventListener('click', onActionBar);
  $('#copyPrompt').addEventListener('click', copyManualPrompt);
  $('#openGemini').addEventListener('click', () => chrome.tabs.create({ url: settings.geminiUrl || 'https://gemini.google.com/app' }));
  $('#manualApply').addEventListener('click', applyManual);
  $('#profile').addEventListener('change', async () => { settings = await setSettings({ activeProfile: $('#profile').value }); });
  $('#kwGo').addEventListener('click', () => kwSearch());
  $('#kwSeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') kwSearch(); });
  $('#kpFile').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importKp(fs); });
  $('#kpClear').addEventListener('click', async () => { await clearKeywordPlanner(); $('#kpMsg').innerHTML = ''; renderKp(); });
  $('#basketCopy').addEventListener('click', () => copy(basket.join(', ')));
  $('#basketClear').addEventListener('click', () => { basket = []; renderBasket(); });
  $('#basketInsert').addEventListener('click', async () => {
    try { await studioApply({ tags: basket, replaceTags: false }); flash(t('toast.tagsInserted')); } catch (e) { flash(e.message); }
  });
  $('#compAdd').addEventListener('click', addCompetitor);
  $('#compIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCompetitor(); });
  $('#compRefresh').addEventListener('click', () => refreshCompetitors().catch((e) => { $('#compVideos').innerHTML = `<div class="tp-alert tp-alert--danger">${ic('alert', 14)}<span>${esc(e.message)}</span></div>`; }));
  $('#trGo').addEventListener('click', loadTrends);

  const refreshSoon = debounce(refreshContext, 300);
  chrome.tabs.onActivated.addListener(refreshSoon);
  chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') refreshSoon(); });
  setInterval(() => { if (ctx?.page === 'studio' && document.visibilityState === 'visible') refreshContext(); }, 4000);

  chrome.storage.onChanged.addListener(async (ch, area) => {
    if (area === 'session' && ch.panelIntent?.newValue) handleIntent(ch.panelIntent.newValue);
    if (area !== 'local') return;
    if (ch.settings) { await loadSettings(); if (pack) renderResult(); }
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
      showError(m.progress.detail || t('common.unknownError'));
    } else if (m.progress?.step !== 'done') showProgress(m.progress);
    return false;
  });
}

(async function init() {
  $('#logo').innerHTML = I.logo(26);
  $('#openOptions').innerHTML = ic('sliders', 16);
  icons();
  bind();
  await loadSettings();
  await loadBasket();
  await refreshContext();
  if (!pack) {
    const last = (await listPacks())[0];
    if (last && Date.now() - last.createdAt < 6 * 3600000) { const p = await getPack(last.key); if (p) showPack(p); }
  }
  const { panelIntent } = await chrome.storage.session.get('panelIntent');
  handleIntent(panelIntent);
})();
