// TubePilot — réglages : langue, Gemini (votre compte), clé YouTube, Keyword Planner, Studio, profils de chaînes, sauvegarde
import { t, I18n } from '../lib/lang.js';
import { getSettings, setSettings, DEFAULT_PROFILE, getCompetitors, setCompetitors, pruneCache } from '../lib/storage.js';
import { testKey as testYtKey } from '../lib/ytapi.js';
import { importKeywordPlanner, kpStats, clearKeywordPlanner } from '../lib/kpimport.js';
import '../lib/format.js';

const F = globalThis.TPF, I = globalThis.TPIcons;
const esc = F.esc;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = (n, s = 15) => I.icon(n, s);

const VALUES = ['ytKey', 'titleCount', 'geminiUrl', 'geminiMode', 'geminiSteps', 'geminiWindow'];
const CHECKS = ['geminiClose', 'transcribeLyrics', 'competitorLookup', 'autopilot', 'autofill', 'replaceExisting', 'studioCard', 'tagSuggest', 'watchCard'];
const PROFILE_FIELDS = ['name', 'channelId', 'handle', 'artistName', 'niche', 'genre', 'languages', 'country', 'audience', 'tone'];

let settings;
let saveH = 0;

function flashSaved() {
  const el = $('#saved');
  el.innerHTML = `${ic('check', 15)} ${esc(t('op.saved'))}`;
  el.classList.remove('tp-hidden');
  clearTimeout(flashSaved.h);
  flashSaved.h = setTimeout(() => el.classList.add('tp-hidden'), 1300);
}

function saveSoon(patch) {
  Object.assign(settings, patch);
  clearTimeout(saveH);
  saveH = setTimeout(async () => { settings = await setSettings(settings); flashSaved(); renderSteps(); }, 350);
}

const status = (el, ok, msg) => { el.innerHTML = `<div class="tp-alert tp-alert--${ok ? 'good' : 'danger'}">${ic(ok ? 'check' : 'alert', 14)}<span>${esc(msg)}</span></div>`; };

async function testYt() {
  const st = $('#ytStatus');
  const key = $('#ytKey').value.trim();
  if (!key) return status(st, false, t('op.pasteKey'));
  st.innerHTML = `<div class="tp-row tp-small"><span class="tp-spinner"></span>${esc(t('op.testing'))}</div>`;
  try {
    await testYtKey(key);
    settings = await setSettings({ ytKey: key });
    status(st, true, t('op.yt.ok'));
    renderSteps();
  } catch (e) { status(st, false, e.message); }
}

/* ---------- Démarrage ---------- */
function renderSteps() {
  const p = settings.profiles[0] || {};
  const done = {
    engine: !!settings.geminiOpened,
    profile: !!(p.channelId || (p.name && p.name !== DEFAULT_PROFILE.name)),
    yt: !!settings.ytKey,
    studio: !!settings.studioVisited
  };
  $$('#steps li').forEach((li) => li.classList.toggle('done', !!done[li.dataset.step]));
}

/* ---------- Profils ---------- */
function renderProfiles() {
  $('#profileList').innerHTML = settings.profiles.map((p, i) => `<div class="op-profile" data-i="${i}">
    <div class="tp-row"><label class="tp-switch"><input type="radio" name="activeProfile" value="${esc(p.id)}" ${p.id === settings.activeProfile ? 'checked' : ''}><span class="tp-switch__text"><b>${esc(p.name || t('op.profiles.unnamed'))}</b><span class="tp-help">${esc(t('op.profiles.default'))}</span></span></label><span class="tp-grow"></span>
      ${settings.profiles.length > 1 ? `<button class="tp-btn tp-btn--ghost tp-btn--sm" data-del="${i}">${ic('trash', 13)} ${esc(t('common.remove'))}</button>` : ''}</div>
    <div class="op-grid2">${PROFILE_FIELDS.map((k) => `<label class="tp-field"><span class="tp-label">${esc(t('op.pf.' + k))}</span><input class="tp-input" data-f="${k}" value="${esc(p[k] || '')}" placeholder="${esc(t('op.pf.' + k + 'Ph'))}"></label>`).join('')}</div>
    <label class="tp-switch"><input type="checkbox" data-f="aiGenerated" ${p.aiGenerated ? 'checked' : ''}><span class="tp-switch__text"><span>${esc(t('op.pf.aiGenerated'))}</span><span class="tp-help">${esc(t('op.pf.aiGeneratedHelp'))}</span></span></label>
    <label class="tp-switch"><input type="checkbox" data-f="officialArtist" ${p.officialArtist ? 'checked' : ''}><span class="tp-switch__text"><span>${esc(t('op.pf.officialArtist'))}</span></span></label>
    <label class="tp-field"><span class="tp-label">${esc(t('op.pf.signature'))}</span><textarea class="tp-textarea" data-f="signature" rows="3" placeholder="${esc(t('op.pf.signaturePh'))}">${esc(p.signature || '')}</textarea></label>
    <div class="op-grid2">
      <label class="tp-field"><span class="tp-label">${esc(t('op.pf.defaultTags'))}</span><input class="tp-input" data-f="defaultTags" value="${esc(p.defaultTags || '')}"></label>
      <label class="tp-field"><span class="tp-label">${esc(t('op.pf.defaultHashtags'))}</span><input class="tp-input" data-f="defaultHashtags" value="${esc(p.defaultHashtags || '')}" placeholder="#mychannel"></label>
    </div>
    <label class="tp-field"><span class="tp-label">${esc(t('op.pf.notes'))}</span><textarea class="tp-textarea" data-f="notes" rows="2" placeholder="${esc(t('op.pf.notesPh'))}">${esc(p.notes || '')}</textarea></label>
  </div>`).join('');
}

function onProfileInput(e) {
  const box = e.target.closest('.op-profile');
  const f = e.target.dataset.f;
  if (!box || !f) return;
  const i = +box.dataset.i;
  const profiles = settings.profiles.map((p) => ({ ...p }));
  profiles[i][f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (f === 'channelId') profiles[i].channelId = (e.target.value.match(/UC[\w-]{22}/) || [e.target.value.trim()])[0];
  saveSoon({ profiles });
}

/* ---------- Keyword Planner ---------- */
async function renderKp() {
  const st = await kpStats();
  $('#kpState').textContent = st.total ? t('kp.state', { n: st.total.toLocaleString(I18n.locale()) }) : '';
}

/* ---------- Démarrage de la page ---------- */
(async function init() {
  settings = await getSettings();
  I18n.setLang(settings.uiLang || 'auto');
  I18n.apply(document);
  document.title = 'TubePilot — ' + t('common.settings');
  $('#logo').innerHTML = I.logo(34);
  $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', ic(el.dataset.icon, 16)));
  $('#uiLang').innerHTML = `<option value="auto">${esc(t('op.langAuto'))}</option>` + Object.entries(I18n.NAMES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('#uiLang').value = settings.uiLang || 'auto';
  $('#version').textContent = 'v' + chrome.runtime.getManifest().version;
  $('#docLink').href = chrome.runtime.getURL('docs/index.html');
  $('#privacyLink').href = chrome.runtime.getURL('docs/privacy.html');

  VALUES.forEach((k) => { const el = $('#' + k); if (el) el.value = settings[k] ?? ''; });
  CHECKS.forEach((k) => { const el = $('#' + k); if (el) el.checked = !!settings[k]; });
  renderProfiles();
  renderSteps();
  renderKp();

  $('#uiLang').addEventListener('change', async (e) => { settings = await setSettings({ uiLang: e.target.value }); location.reload(); });
  ['titleCount', 'geminiMode', 'geminiSteps', 'geminiWindow'].forEach((k) => $('#' + k).addEventListener('change', (e) => saveSoon({ [k]: k === 'titleCount' || k === 'geminiSteps' ? +e.target.value : e.target.value })));
  $('#geminiUrl').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v && !/^https:\/\/gemini\.google\.com\//.test(v)) { e.target.value = settings.geminiUrl; return; }
    saveSoon({ geminiUrl: v || 'https://gemini.google.com/app' });
  });
  $('#ytKey').addEventListener('change', (e) => saveSoon({ ytKey: e.target.value.trim() }));
  CHECKS.forEach((k) => $('#' + k)?.addEventListener('change', (e) => saveSoon({ [k]: e.target.checked })));
  $('#testYt').addEventListener('click', testYt);
  $('#openGem').addEventListener('click', () => { chrome.tabs.create({ url: settings.geminiUrl || 'https://gemini.google.com/app' }); saveSoon({ geminiOpened: true }); });
  document.querySelector('#steps [data-step="studio"] a')?.addEventListener('click', () => saveSoon({ studioVisited: true }));

  $('#profileList').addEventListener('input', onProfileInput);
  $('#profileList').addEventListener('change', (e) => {
    if (e.target.name === 'activeProfile') saveSoon({ activeProfile: e.target.value });
    else if (e.target.type === 'checkbox') onProfileInput(e);
  });
  $('#profileList').addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (!d) return;
    const profiles = settings.profiles.filter((_, i) => i !== +d.dataset.del);
    const activeProfile = profiles.some((p) => p.id === settings.activeProfile) ? settings.activeProfile : profiles[0].id;
    saveSoon({ profiles, activeProfile });
    renderProfiles();
  });
  $('#addProfile').addEventListener('click', () => {
    const profiles = [...settings.profiles, { ...DEFAULT_PROFILE, id: 'p' + Date.now().toString(36), name: t('op.profiles.newName') }];
    saveSoon({ profiles });
    renderProfiles();
  });

  $('#kpFile').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    let n = 0, last = null;
    try {
      for (const f of files) { last = await importKeywordPlanner(await f.arrayBuffer(), {}); n += last.imported; }
      status($('#kpMsg'), true, t('kp.done', { n: n.toLocaleString(I18n.locale()), total: (last?.total || 0).toLocaleString(I18n.locale()) }));
    } catch (err) { status($('#kpMsg'), false, err.message === 'no-header' ? t('kp.badFile') : err.message); }
    renderKp();
  });
  $('#kpClear').addEventListener('click', async () => { await clearKeywordPlanner(); $('#kpMsg').innerHTML = ''; renderKp(); });

  $('#export').addEventListener('click', async () => {
    const data = { app: 'tubepilot', version: chrome.runtime.getManifest().version, settings: { ...settings, models: undefined }, competitors: await getCompetitors() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'tubepilot-settings.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!/tubepilot/.test(data.app || '') || !data.settings) throw new Error(t('op.backup.badFile'));
      settings = await setSettings(data.settings);
      if (Array.isArray(data.competitors)) await setCompetitors(data.competitors);
      status($('#backupStatus'), true, t('op.backup.imported'));
      setTimeout(() => location.reload(), 900);
    } catch (err) { status($('#backupStatus'), false, err.message); }
  });
  $('#clearCache').addEventListener('click', async () => {
    const n = await pruneCache(0);
    status($('#backupStatus'), true, t('op.backup.cleared', { n }));
  });

  // section visible → lien actif dans la navigation
  const links = $$('#nav a');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id)); });
  }, { rootMargin: '-40% 0px -55% 0px' });
  $$('.op-main section').forEach((s) => obs.observe(s));
})();
