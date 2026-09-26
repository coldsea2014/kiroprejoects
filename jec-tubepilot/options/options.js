// JEC TubePilot — réglages : clés, modèles Gemini, Studio, profils de chaînes, sauvegarde
import { getSettings, setSettings, DEFAULT_PROFILE, getCompetitors, setCompetitors, pruneCache } from '../lib/storage.js';
import { listModels, rankModels } from '../lib/gemini.js';
import { testKey as testYtKey } from '../lib/ytapi.js';
import '../lib/format.js';

const F = globalThis.TPF;
const esc = F.esc;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const SIMPLE = ['geminiKey', 'ytKey', 'mediaMode', 'titleCount', 'modelMain', 'modelFast', 'geminiUrl', 'geminiSteps', 'geminiWindow'];
const CHECKS = ['geminiClose', 'deleteFiles', 'transcribeLyrics', 'competitorLookup', 'webTrends', 'autopilot', 'autofill', 'studioCard', 'tagSuggest', 'watchCard'];
const PROFILE_FIELDS = [
  ['name', 'Nom du profil', 'ex. DOZA MANAL'],
  ['channelId', 'ID de la chaîne (UC…)', 'UCxxxxxxxxxxxxxxxxxxxxxx'],
  ['handle', '@handle', '@machaine'],
  ['artistName', 'Nom d\'artiste de la chaîne (autorisé dans titres et tags)', 'ex. DOZA MANAL'],
  ['niche', 'Niche', 'ex. Musique du monde : khaliji, rap irakien, yéménite, RnB, jazz, chaabi…'],
  ['genre', 'Styles publiés (Gemini détecte toujours le style de CHAQUE chanson)', 'ex. khaliji, sheilat, rap irakien, jazz, RnB, chaabi'],
  ['languages', 'Langues des métadonnées (la 1re = titres)', 'ex. ar, fr, en'],
  ['country', 'Pays principal du public (code)', 'ex. MA'],
  ['audience', 'Public visé', 'ex. 18-35 ans, Maroc et diaspora, écoute le soir'],
  ['tone', 'Ton', 'ex. émotionnel, authentique']
];

let settings;
let saveT = 0;

function flashSaved() {
  const el = $('#saved');
  el.classList.remove('hidden');
  clearTimeout(flashSaved.t);
  flashSaved.t = setTimeout(() => el.classList.add('hidden'), 1200);
}

function saveSoon(patch) {
  Object.assign(settings, patch);
  clearTimeout(saveT);
  saveT = setTimeout(async () => { settings = await setSettings(settings); flashSaved(); }, 400);
}

function fillModels(models, main, fast) {
  const opts = models.length
    ? models.map((m) => `<option value="${esc(m.id)}">${esc(m.label || m.id)} — ${esc(m.id)}</option>`).join('')
    : '<option value="">(testez la clé pour charger la liste)</option>';
  $('#modelMain').innerHTML = opts;
  $('#modelFast').innerHTML = opts;
  if (main) $('#modelMain').value = main;
  if (fast) $('#modelFast').value = fast;
}

async function testGemini() {
  const st = $('#geminiStatus');
  const key = $('#geminiKey').value.trim();
  if (!key) { st.innerHTML = '<span class="muted">Collez d\'abord la clé.</span>'; return; }
  st.textContent = 'Test en cours…';
  try {
    const models = await listModels(key);
    if (!models.length) throw new Error('Aucun modèle Gemini disponible pour cette clé.');
    const r = rankModels(models);
    const main = settings.modelMain && models.some((m) => m.id === settings.modelMain) ? settings.modelMain : r.pro || r.flash || r.all[0].id;
    const fast = settings.modelFast && models.some((m) => m.id === settings.modelFast) ? settings.modelFast : r.flash || r.lite || main;
    const list = r.all.map((m) => ({ id: m.id, label: m.label }));
    fillModels(list, main, fast);
    settings = await setSettings({ geminiKey: key, models: list, modelMain: main, modelFast: fast });
    st.innerHTML = `<span class="ok">✓ Clé valide — ${models.length} modèles. Principal : <b>${esc(main)}</b> · rapide : <b>${esc(fast)}</b></span>`;
  } catch (e) {
    st.innerHTML = `<span style="color:var(--bad)">✘ ${esc(e.message)}</span>`;
  }
}

async function testYt() {
  const st = $('#ytStatus');
  const key = $('#ytKey').value.trim();
  if (!key) { st.innerHTML = '<span class="muted">Collez d\'abord la clé.</span>'; return; }
  st.textContent = 'Test en cours…';
  try {
    await testYtKey(key);
    settings = await setSettings({ ytKey: key });
    st.innerHTML = '<span class="ok">✓ Clé YouTube valide.</span>';
  } catch (e) {
    st.innerHTML = `<span style="color:var(--bad)">✘ ${esc(e.message)}</span>`;
  }
}

/* ---------- Profils ---------- */
function renderProfiles() {
  $('#profiles').innerHTML = settings.profiles.map((p, i) => `<div class="profile" data-i="${i}">
    <div class="row"><label class="chk"><input type="radio" name="activeProfile" value="${esc(p.id)}" ${p.id === settings.activeProfile ? 'checked' : ''}> Profil par défaut</label><span class="sp"></span>
      ${settings.profiles.length > 1 ? `<button class="small ghost" data-del="${i}">🗑️ Supprimer</button>` : ''}</div>
    <div class="grid2">${PROFILE_FIELDS.map(([k, label, ph]) => `<label>${label}<input data-f="${k}" value="${esc(p[k] || '')}" placeholder="${esc(ph)}"></label>`).join('')}</div>
    <label class="chk"><input type="checkbox" data-f="aiGenerated" ${p.aiGenerated ? 'checked' : ''}> Musique / voix créées avec l'IA (Suno, Udio…) — rappel de la mention « contenu synthétique »</label>
    <label class="chk"><input type="checkbox" data-f="officialArtist" ${p.officialArtist ? 'checked' : ''}> Chaîne officielle de l'artiste (autorise « officiel » dans les titres)</label>
    <label>Bloc de signature ajouté à chaque description (liens, réseaux, crédits)<textarea data-f="signature" rows="3" placeholder="🎧 Écouter sur Spotify : https://…&#10;📸 Instagram : https://…">${esc(p.signature || '')}</textarea></label>
    <div class="grid2">
      <label>Tags toujours ajoutés (séparés par des virgules)<input data-f="defaultTags" value="${esc(p.defaultTags || '')}"></label>
      <label>Hashtags de la chaîne<input data-f="defaultHashtags" value="${esc(p.defaultHashtags || '')}" placeholder="#machaine"></label>
    </div>
    <label>Notes pour Gemini (règles propres à la chaîne)<textarea data-f="notes" rows="2" placeholder="ex. Toujours écrire les titres en darija avec l'écriture arabe ; jamais de nom d'artiste">${esc(p.notes || '')}</textarea></label>
  </div>`).join('');
}

function onProfileInput(e) {
  const box = e.target.closest('.profile');
  const f = e.target.dataset.f;
  if (!box || !f) return;
  const i = +box.dataset.i;
  const profiles = settings.profiles.map((p) => ({ ...p }));
  profiles[i][f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (f === 'channelId') profiles[i].channelId = (e.target.value.match(/UC[\w-]{22}/) || [e.target.value.trim()])[0];
  saveSoon({ profiles });
}

/* ---------- Démarrage ---------- */
(async function init() {
  settings = await getSettings();
  SIMPLE.forEach((k) => { const el = $('#' + k); if (el && k !== 'modelMain' && k !== 'modelFast') el.value = settings[k] ?? ''; });
  CHECKS.forEach((k) => { $('#' + k).checked = !!settings[k]; });
  fillModels(settings.models || [], settings.modelMain, settings.modelFast);
  renderProfiles();

  ['mediaMode', 'titleCount', 'modelMain', 'modelFast', 'geminiSteps', 'geminiWindow'].forEach((k) => $('#' + k).addEventListener('change', (e) => saveSoon({ [k]: k === 'titleCount' || k === 'geminiSteps' ? +e.target.value : e.target.value })));
  $$('input[name=aiEngine]').forEach((r) => { r.checked = r.value === (settings.aiEngine === 'api' ? 'api' : 'web'); r.addEventListener('change', () => saveSoon({ aiEngine: r.value })); });
  $('#geminiUrl').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v && !/^https:\/\/gemini\.google\.com\//.test(v)) { e.target.value = settings.geminiUrl; return; }
    saveSoon({ geminiUrl: v || 'https://gemini.google.com/app' });
  });
  $('#geminiKey').addEventListener('change', (e) => saveSoon({ geminiKey: e.target.value.trim(), modelMain: settings.modelMain, modelFast: settings.modelFast }));
  $('#ytKey').addEventListener('change', (e) => saveSoon({ ytKey: e.target.value.trim() }));
  CHECKS.forEach((k) => $('#' + k).addEventListener('change', (e) => saveSoon({ [k]: e.target.checked })));
  $('#testGemini').addEventListener('click', testGemini);
  $('#testYt').addEventListener('click', testYt);

  $('#profiles').addEventListener('input', onProfileInput);
  $('#profiles').addEventListener('change', (e) => {
    if (e.target.name === 'activeProfile') saveSoon({ activeProfile: e.target.value });
    else if (e.target.type === 'checkbox') onProfileInput(e);
  });
  $('#profiles').addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (!d) return;
    const profiles = settings.profiles.filter((_, i) => i !== +d.dataset.del);
    const activeProfile = profiles.some((p) => p.id === settings.activeProfile) ? settings.activeProfile : profiles[0].id;
    saveSoon({ profiles, activeProfile });
    renderProfiles();
  });
  $('#addProfile').addEventListener('click', () => {
    const profiles = [...settings.profiles, { ...DEFAULT_PROFILE, id: 'p' + Date.now().toString(36), name: 'Nouvelle chaîne' }];
    saveSoon({ profiles });
    renderProfiles();
  });

  $('#export').addEventListener('click', async () => {
    const data = { app: 'jec-tubepilot', version: chrome.runtime.getManifest().version, settings: { ...settings, models: undefined }, competitors: await getCompetitors() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'jec-tubepilot-reglages.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'jec-tubepilot' || !data.settings) throw new Error('Ce fichier ne vient pas de JEC TubePilot.');
      settings = await setSettings(data.settings);
      if (Array.isArray(data.competitors)) await setCompetitors(data.competitors);
      $('#backupStatus').innerHTML = '<span class="ok">✓ Réglages importés. Rechargez la page.</span>';
    } catch (err) {
      $('#backupStatus').innerHTML = `<span style="color:var(--bad)">✘ ${esc(err.message)}</span>`;
    }
  });
  $('#clearCache').addEventListener('click', async () => {
    const n = await pruneCache(0);
    $('#backupStatus').textContent = `${n} élément(s) de cache supprimé(s).`;
  });
})();
