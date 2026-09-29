// Test de bout en bout : Chromium + extension chargée, maquettes de YouTube Studio, YouTube et gemini.google.com (votre compte)
// Usage : node tests/e2e/run.mjs  (nécessite Playwright et Chromium)
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = process.env.EXT || path.resolve(here, '..', '..');
const shots = process.env.SHOTS || path.join(tmpdir(), 'tubepilot-shots');
mkdirSync(shots, { recursive: true });
const studioHtml = readFileSync(path.join(here, 'studio-mock.html'), 'utf8');
const watchHtml = readFileSync(path.join(here, 'watch-mock.html'), 'utf8');
const geminiTpl = readFileSync(path.join(here, 'gemini-mock.html'), 'utf8');

const ANALYSIS = {
  content_type: 'music', summary: 'Chanson chaâbi marocaine festive, voix masculine, violon et darbouka.', language: 'Arabe — darija marocaine', language_code: 'ar', dialect: 'darija marocaine', language_evidence: '« قولها ليا », « بزاف »', target_countries: ['MA', 'DZ'], search_language: 'ar',
  highlights: [{ start: 13, end: 25, label: 'اللازمة', kind: 'refrain', why: 'refrain le plus accrocheur' }, { start: 30, end: 38, label: 'الكمنجة', kind: 'solo', why: 'solo de violon' }],
  is_cover: false, cover_original: '',
  music: { primary_genre: 'chaabi marocain', fusion: '', pulse: 'ternaire', percussion: ['darbouka', 'bendir'], rhythm_candidates: [{ name: 'chaabi 6/8', confidence: 0.82, evidence: 'cycle 6/8, bendir' }, { name: 'reggada', confidence: 0.12, evidence: 'pas de gasba' }], genre_search_terms: ['شعبي مغربي', 'chaabi marocain'], subgenres: ['nayda'], regional_style: 'Maroc', genre_confidence: 0.9, genre_evidence: '6/8 marocain, violon', bpm: 118, time_signature: '6/8', key: 'La mineur', scale_or_maqam: 'Hijaz', rhythm_pattern: '6/8 marocain', mood: ['festif', 'nostalgique'], energy: 8, instruments: ['violon', 'darbouka', 'bendir'], vocals: 'voix masculine, légère autotune', production: 'propre', hook_line: 'قولها ليا', hook_start: 12, song_title_guess: 'قولها ليا', lyrics_theme: 'amour et déclaration', lyrics: 'قولها ليا\nقولها ليا يا الزين', listening_moments: ['mariage', 'soirée'], similar_styles: ['reggada'] },
  timeline: [{ start: 0, end: 12, label: 'Intro violon', kind: 'intro' }, { start: 12, end: 25, label: 'Refrain', kind: 'refrain' }, { start: 25, end: 40, label: 'Couplet', kind: 'couplet' }],
  tracks: [], best_short: { start: 12, end: 30, reason: 'refrain accrocheur' }, thumbnail_moment: 14, visual: { description: 'visuel animé' }, audience: 'Mariages et soirées', search_queries: ['شعبي مغربي', 'قولها ليا'], topics: ['mariage'], duration_seconds: 40, confidence: 0.86, uncertain: []
};
const SEO = {
  main_keyword: 'شعبي مغربي', secondary_keywords: ['اغاني اعراس مغربية'], audience_insight: 'Ils cherchent une chanson pour faire danser la famille.',
  titles: [{ text: 'قولها ليا 🔥 شعبي مغربي نايضة للأعراس', hook_type: 'moment d\'écoute', angle: 'mariage' }, { text: 'للي بغا يقولها ليها… قولها ليا 💌 شعبي مغربي', hook_type: 'adresse directe' }, { text: 'شعبي مغربي 2026 | قولها ليا', hook_type: 'mot-clé' }],
  ab_titles: ['قولها ليا 🔥', 'شعبي نايضة 2026', 'صيفطها للي تحبها 💌'], description_intro: 'قولها ليا — أغنية شعبي مغربي نايضة للأعراس 🔥', description_body: 'أغنية شعبية مغربية بإيقاع 6/8 للأعراس والحفلات العائلية.',
  lyrics_section: 'قولها ليا يا الزين', cta: 'اشترك في القناة 🔔 وشارك الأغنية', chapters: [{ start: 0, label: 'مقدمة' }, { start: 12, label: 'اللازمة' }, { start: 25, label: 'الكوبلي' }],
  tags: ['شعبي مغربي', 'قولها ليا', 'chaabi marocain', 'اغاني اعراس مغربية', 'nayda'], hashtags: ['#شعبي', '#قولها_ليا', '#chaabi'], pinned_comment: 'فين غادي تسمعوها ؟', thumbnail: { texts: ['نايضة 🔥'], concept: 'fête', prompt: 'moroccan wedding party' }, short: { title: 'قولها ليا 🔥 #shorts', description: 'refrain' }, compliance_notes: ['Voix IA : cochez « contenu synthétique » si elle est réaliste.']
};

// petit WAV : 20 s, clics à 120 BPM + note
function wav() {
  const sr = 16000, n = sr * 20, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr, beat = t % 0.5;
    const v = (beat < 0.03 ? Math.sin(2 * Math.PI * 1000 * t) * (1 - beat / 0.03) : 0) * 0.9 + Math.sin(2 * Math.PI * 220 * t) * 0.05;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
  }
  return buf;
}

const errors = [];
const log = (...a) => console.log('•', ...a);
const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-goog-upload-url' };

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'tp-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
log('extension chargée', extId);

// page « Détails » d'une vidéo déjà en ligne : mêmes champs, sans fenêtre d'import
const studioEditHtml = studioHtml.replace('<ytcp-uploads-dialog class="hidden">', '<div class="edit-page" style="display:block;width:1100px;margin:20px auto">').replace('</ytcp-uploads-dialog>', '</div>');
await ctx.route('https://studio.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: /\/video\/[\w-]{11}\/edit/.test(r.request().url()) ? studioEditHtml : studioHtml }));
await ctx.route('https://www.youtube.com/oembed**', (r) => r.fulfill({ status: /privatevideo/.test(r.request().url()) ? 401 : 200, contentType: 'application/json', body: '{}' }));
await ctx.route('https://www.youtube.com/watch**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: watchHtml }));
const gemLog = [];
await ctx.route('https://gemini.google.com/__log', (r) => { gemLog.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 204, body: '' }); });
await ctx.route('https://gemini.google.com/app**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: geminiTpl.replace('__ANALYSIS__', JSON.stringify(ANALYSIS)).replace('__SEO__', JSON.stringify(SEO)) }));
await ctx.route('https://suggestqueries.google.com/**', (r) => {
  const q = new URL(r.request().url()).searchParams.get('q');
  r.fulfill({ contentType: 'application/json; charset=utf-8', headers: cors, body: JSON.stringify([q, [q, q + ' 2026', q + ' نايضة']]) });
});


function watch(page, name) {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
}

// 1. Réglages
const opt = await ctx.newPage();
watch(opt, 'options');
await opt.goto(`chrome-extension://${extId}/options/options.html`);
await opt.evaluate(() => chrome.storage.local.set({ settings: { geminiSteps: 2, geminiWindow: 'popup', geminiClose: true, geminiMode: 'pro', competitorLookup: false, autopilot: true, autofill: true, replaceExisting: true, profiles: [{ id: 'default', name: 'Chaîne test', channelId: 'UCabcdefghijklmnopqrstuv', languages: 'ar, fr', country: 'MA', niche: 'Musique marocaine', genre: 'chaabi', aiGenerated: true, signature: 'Instagram : https://instagram.com/test' }], activeProfile: 'default' } }));
await opt.reload();
await opt.waitForSelector('.op-profile');
await opt.screenshot({ path: path.join(shots, '1-options.png'), fullPage: true });
log('réglages OK — profils :', await opt.locator('.op-profile').count());

// banc de test : la 1re navigation d'une fenêtre ouverte par l'extension peut échapper à la maquette → rechargée une fois
const geminiPages = [];
ctx.on('page', async (p) => {
  geminiPages.push(p);
  watch(p, 'gemini');
  await p.waitForLoadState().catch(() => {});
  if (p.url().startsWith('chrome-error://')) await p.goto('https://gemini.google.com/app').catch(() => {});
});

// 2. YouTube Studio : ancienne description + anciens tags, import d'un fichier → pilote automatique → Gemini (compte) → tout est remplacé
const studio = await ctx.newPage();
watch(studio, 'studio');
await studio.goto('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos/upload');
await studio.evaluate(() => {
  document.querySelector('#description-textarea #textbox').textContent = 'Ancienne description à supprimer';
  ['vieux tag 1', 'vieux tag 2'].forEach((x) => window.addChip(x));
});
await studio.setInputFiles('#picker', { name: 'قُولْهَا-لِيَّا [usesuno.com].wav', mimeType: 'audio/wav', buffer: wav() });
await studio.waitForSelector('#tp-studio-card', { timeout: 10000 });
log('carte TubePilot affichée sous le titre');
try {
  await studio.waitForFunction(() => document.querySelector('#title-textarea #textbox').textContent.includes('شعبي'), null, { timeout: 60000 });
} catch (e) {
  console.error('DIAG carte :', await studio.evaluate(() => document.querySelector('#tp-studio-card')?.shadowRoot?.textContent?.replace(/\s+/g, ' ').slice(0, 800)));
  for (const p of ctx.pages()) console.error('DIAG page :', p.url());
  const g = ctx.pages().find((p) => p.url().startsWith('https://gemini.google.com'));
  if (g) console.error('DIAG gemini :', await g.evaluate(() => ({ prompts: window.__prompts?.length, files: window.__files, bar: document.getElementById('tp-gw')?.innerText })));
  console.error('ERREURS jusqu\'ici :', errors.join('\n'));
  throw e;
}
await studio.waitForFunction(() => document.querySelectorAll('ytcp-chip').length >= 3 && ![...document.querySelectorAll('ytcp-chip')].some((c) => c.textContent.includes('vieux tag')), null, { timeout: 15000 });
const res = await studio.evaluate(() => ({
  title: document.querySelector('#title-textarea #textbox').textContent,
  description: document.querySelector('#description-textarea #textbox').innerText,
  tags: [...document.querySelectorAll('ytcp-chip')].map((c) => (c.querySelector('#chip-text') || c).textContent.trim())
}));
log('titre inséré :', res.title);
log('tags insérés :', res.tags.join(', '));
if (!/00:12 🔥 اللازمة/.test(res.description)) errors.push('description sans timeline 🔥 : ' + res.description.slice(0, 300));
if (!res.description.includes('instagram.com/test')) errors.push('signature absente');
if (res.description.includes('Ancienne description')) errors.push('ancienne description pas supprimée');
if (res.tags.some((x) => x.includes('vieux tag'))) errors.push('anciens tags pas supprimés : ' + res.tags.join(', '));
log('ancienne description et anciens tags remplacés :', !res.description.includes('Ancienne description') && !res.tags.some((x) => x.includes('vieux tag')) ? 'oui' : 'NON');
log('Gemini a reçu :', gemLog.map((x) => (x.seo ? 'demande SEO' : 'demande d\'écoute') + ` [${x.model}]` + (x.files.length ? ` + ${x.files.join(', ')}` : '')).join(' → '));
if (gemLog.length !== 2 || gemLog[0].seo || !gemLog[1].seo) errors.push('Gemini : 2 demandes attendues (écoute puis SEO)');
if (!gemLog[0]?.files?.some((f) => /\.wav/.test(f))) errors.push('Gemini : audio non joint');
if (gemLog.some((x) => x.model !== 'Pro')) errors.push('Gemini : modèle Pro non sélectionné');
await studio.waitForTimeout(1500);
if (ctx.pages().some((p) => p.url().startsWith('https://gemini.google.com') && !p.isClosed())) errors.push('fenêtre Gemini pas refermée');
// onglet « Commentaire » : commentaire à épingler
await studio.locator('#tp-studio-card').locator('.tp-tab[data-tab=comment]').click();
await studio.waitForTimeout(200);
const comment = await studio.evaluate(() => document.querySelector('#tp-studio-card').shadowRoot.querySelector('.tp-pre')?.textContent || '');
if (!comment.includes('فين غادي تسمعوها')) errors.push('commentaire à épingler absent : ' + comment);
log('commentaire à épingler :', comment);
await studio.locator('#tp-studio-card').screenshot({ path: path.join(shots, '2c-studio-comment.png') });
await studio.locator('#tp-studio-card').locator('.tp-tab[data-tab=titles]').click();
await studio.waitForTimeout(600);
await studio.screenshot({ path: path.join(shots, '2-studio.png'), fullPage: true });
await studio.locator('#tp-studio-card').screenshot({ path: path.join(shots, '2b-studio-card.png') });
// la carte est au-dessus du titre, et la description remplie ne déborde jamais sur la suite de la page (bugs v4.2 et v5.1)
const geo = await studio.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const card = r(document.querySelector('#tp-studio-card'));
  const title = r(document.querySelector('ytcp-video-title'));
  const desc = r(document.querySelector('#description-textarea #textbox'));
  const next = r(document.querySelector('#toggle-button'));
  const editor = r(document.querySelector('ytcp-video-metadata-editor'));
  const doc = document.documentElement;
  return { cardBottom: Math.round(card.bottom), titleTop: Math.round(title.top), titleLeft: Math.round(title.left), editorLeft: Math.round(editor.left), descBottom: Math.round(desc.bottom), nextTop: Math.round(next.top), h: Math.round(card.height), w: Math.round(card.width), hScroll: doc.scrollWidth > doc.clientWidth + 2, floating: getComputedStyle(document.querySelector('#tp-studio-card')).position === 'fixed' };
});
// pas de décalage : le titre reste au bord gauche du formulaire, pas de défilement horizontal, carte au-dessus du titre, description sans débordement
if (!(geo.h > 80 && geo.w >= 280 && !geo.hScroll && Math.abs(geo.titleLeft - geo.editorLeft) < 4 && (geo.floating || geo.cardBottom <= geo.titleTop + 1) && geo.descBottom <= geo.nextTop + 1)) errors.push('mise en page Studio cassée : ' + JSON.stringify(geo));
log('mise en page : carte au-dessus du titre, description sans débordement :', JSON.stringify(geo));

// clic sur un autre titre proposé
await studio.locator('#tp-studio-card').locator('.tp-item[data-act=title]').nth(1).click();
await studio.waitForTimeout(400);
log('titre après clic :', await studio.evaluate(() => document.querySelector('#title-textarea #textbox').textContent));

// 2b. Ce que l'utilisateur tape pendant l'analyse n'est jamais remplacé
const studio2 = await ctx.newPage();
watch(studio2, 'studio2');
await studio2.goto('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos/upload');
await studio2.setInputFiles('#picker', { name: 'autre-chanson.wav', mimeType: 'audio/wav', buffer: wav() });
await studio2.evaluate(() => { const t = document.querySelector('#title-textarea #textbox'); t.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, 'Mon titre à moi'); });
await studio2.waitForFunction(() => document.querySelector('#tp-studio-card')?.shadowRoot?.querySelector('.tp-item[data-act=title]'), null, { timeout: 30000 });
await studio2.waitForTimeout(800);
const kept = await studio2.evaluate(() => document.querySelector('#title-textarea #textbox').textContent);
if (kept !== 'Mon titre à moi') errors.push('titre de l\'utilisateur remplacé : ' + kept);
log('titre tapé par l\'utilisateur conservé :', kept);
await studio2.close();

// 2d. Vidéo déjà publiée : « Analyser » → lien public → Gemini → ancien titre, ancienne description et anciens tags remplacés
const edit = await ctx.newPage();
watch(edit, 'studio-edit');
await edit.goto('https://studio.youtube.com/video/pubvideo123/edit');
await edit.evaluate(() => {
  document.querySelector('#title-textarea #textbox').textContent = 'Ancien titre';
  document.querySelector('#description-textarea #textbox').textContent = 'Ancienne description de la vidéo';
  document.getElementById('more').classList.remove('hidden');
  ['ancien tag A', 'ancien tag B'].forEach((x) => window.addChip(x));
});
await edit.waitForFunction(() => document.querySelector('#tp-studio-card')?.shadowRoot?.querySelector('[data-act=auto]'), null, { timeout: 15000 });
const logBefore = gemLog.length;
await edit.locator('#tp-studio-card').locator('[data-act=auto]').click();
await edit.waitForFunction(() => document.querySelector('#title-textarea #textbox').textContent.includes('شعبي'), null, { timeout: 60000 });
await edit.waitForFunction(() => ![...document.querySelectorAll('ytcp-chip')].some((c) => c.textContent.includes('ancien tag')) && document.querySelectorAll('ytcp-chip').length >= 3, null, { timeout: 15000 });
await edit.waitForFunction(() => /Save/.test(document.querySelector('#tp-studio-card')?.shadowRoot?.querySelector('.tp-alert--good')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
const ed = await edit.evaluate(() => ({ title: document.querySelector('#title-textarea #textbox').textContent, description: document.querySelector('#description-textarea #textbox').innerText, note: document.querySelector('#tp-studio-card').shadowRoot.querySelector('.tp-alert--good')?.textContent || '' }));
const editLog = gemLog.slice(logBefore);
const edGeo = await edit.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  const doc = document.documentElement;
  return { descBottom: Math.round(r('#description-textarea #textbox').bottom), nextTop: Math.round(r('#toggle-button').top), titleLeft: Math.round(r('ytcp-video-title').left), editorLeft: Math.round(r('ytcp-video-metadata-editor').left), hScroll: doc.scrollWidth > doc.clientWidth + 2 };
});
if (edGeo.descBottom > edGeo.nextTop + 1) errors.push('vidéo publiée : la description déborde sur la suite de la page ' + JSON.stringify(edGeo));
if (edGeo.hScroll || Math.abs(edGeo.titleLeft - edGeo.editorLeft) > 3) errors.push('vidéo publiée : la page Studio est décalée ' + JSON.stringify(edGeo));
if (ed.title === 'Ancien titre' || ed.description.includes('Ancienne description')) errors.push('vidéo publiée : ancien titre / description pas remplacés');
const edTags = await edit.evaluate(() => [...document.querySelectorAll('ytcp-chip #chip-text')].map((c) => c.textContent));
if (edTags.some((x) => /ancien/i.test(x))) errors.push('vidéo publiée : tags tirés de l\'ancien titre : ' + edTags.join(', '));
if (!/00:12 🔥 اللازمة/.test(ed.description)) errors.push('vidéo publiée : timeline absente');
if (editLog[0]?.link !== 'watch?v=pubvideo123' || editLog[0]?.files?.length) errors.push('vidéo publiée : Gemini n\'a pas reçu le lien public seul : ' + JSON.stringify(editLog[0]));
if (!/Save/.test(ed.note)) errors.push('vidéo publiée : rappel « Enregistrer » absent : ' + ed.note);
log('vidéo publiée — Gemini a reçu le lien', editLog[0]?.link, '[' + editLog[0]?.model + '] → titre :', ed.title, '·', ed.note);
await edit.locator('#tp-studio-card').screenshot({ path: path.join(shots, '2d-studio-published.png') });
await edit.screenshot({ path: path.join(shots, '2e-studio-published-page.png'), fullPage: true });
await edit.close();

// 3. Panneau latéral (ouvert comme une page)
const panel = await ctx.newPage();
watch(panel, 'panel');
await panel.setViewportSize({ width: 420, height: 900 });
await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
await panel.waitForSelector('#titles .tp-item', { timeout: 10000 });
await panel.screenshot({ path: path.join(shots, '3-panel.png'), fullPage: true });
log('panneau : titres', await panel.locator('#titles .tp-item').count(), '· score', await panel.locator('.sp-scorecard .tp-ring text').first().textContent());
for (const t of ['competitors', 'trends', 'history', 'video', 'keywords']) await panel.click(`.sp-navbtn[data-tab="${t}"]`);
await panel.fill('#kwSeed', 'شعبي مغربي');
await panel.click('#kwGo');
await panel.waitForSelector('#kwResults table', { timeout: 10000 });
log('mots-clés trouvés :', await panel.locator('#kwResults tr').count() - 1);
await panel.screenshot({ path: path.join(shots, '4-keywords.png'), fullPage: true });

// 3c. Radar viral : relevé des chaînes suivies (YouTube Data API simulée), « Pourquoi ? » par Gemini
const H = 3600000, D = 24 * H;
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const YTV = {
  hotvideo001: { title: 'قولها ليا 🔥 شعبي مغربي', publishedAt: iso(10 * H), views: 20000 },
  old00000001: { title: 'a', publishedAt: iso(5 * D), views: 40000 },
  old00000002: { title: 'b', publishedAt: iso(8 * D), views: 50000 },
  old00000003: { title: 'c', publishedAt: iso(12 * D), views: 60000 },
  abcdefghijk: { title: 'Ma chanson', publishedAt: iso(6 * H), views: 300 }
};
await ctx.route('https://www.googleapis.com/youtube/v3/**', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith('/playlistItems')) return r.fulfill({ json: { items: ['hotvideo001', 'old00000001', 'old00000002', 'old00000003'].map((id) => ({ contentDetails: { videoId: id } })) } });
  if (u.pathname.endsWith('/videos')) return r.fulfill({ json: { items: u.searchParams.get('id').split(',').filter((id) => YTV[id]).map((id) => ({ id, snippet: { title: YTV[id].title, publishedAt: YTV[id].publishedAt, channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', channelTitle: 'Chaîne A', thumbnails: {} }, statistics: { viewCount: String(YTV[id].views) }, contentDetails: { duration: 'PT3M' } })) } });
  return r.fulfill({ json: { items: [] } });
});
await opt.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, ytKey: 'TESTKEY', geminiMode: 'fast' }, competitors: [{ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', title: 'Chaîne A', uploads: 'UUaaaaaaaaaaaaaaaaaaaaaa', subs: 120000 }] });
});
await panel.reload();
await panel.click('.sp-navbtn[data-tab="radar"]');
await panel.click('#radarScan');
await panel.waitForSelector('#radarList .sp-hot', { timeout: 15000 });
const radarRow = await panel.locator('#radarList .sp-hot').first().innerText();
if (!/×\d/.test(radarRow) || !radarRow.includes('Chaîne A')) errors.push('radar : vidéo qui explose mal affichée : ' + radarRow);
log('radar :', radarRow.replace(/\s+/g, ' ').slice(0, 140));
const mineRow = await panel.locator('#radarMine').innerText();
if (!/abcdefghijk|Ma chanson/.test(mineRow)) errors.push('radar : ma vidéo remplie dans Studio n\'est pas suivie : ' + mineRow.slice(0, 200));
log('ma vidéo suivie :', mineRow.replace(/\s+/g, ' ').slice(0, 160));
const tdBefore = gemLog.length;
await panel.locator('#radarList [data-td]').first().click();
await panel.waitForSelector('#teardownBox .tp-alert--info', { timeout: 60000 });
const td = await panel.locator('#teardownBox').innerText();
if (!td.includes('Le refrain arrive dès 0:03')) errors.push('radar : analyse « pourquoi » absente');
if (!gemLog.slice(tdBefore).some((x) => /VIRAL TEARDOWN/.test(x.prompt) || /TUBEPILOT MASTER/.test(x.prompt))) errors.push('radar : Gemini n\'a pas reçu la demande « pourquoi »');
log('pourquoi elle a explosé :', td.replace(/\s+/g, ' ').slice(0, 160));
await panel.locator('#tab-radar').screenshot({ path: path.join(shots, '10-radar.png') });

// 4. Page vidéo YouTube
const yt = await ctx.newPage();
watch(yt, 'watch');
await yt.goto('https://www.youtube.com/watch?v=zyxwvutsrqp');
await yt.waitForSelector('#tp-watch-card', { timeout: 10000 });
await yt.waitForTimeout(500);
await yt.screenshot({ path: path.join(shots, '5-watch.png') });
log('carte page vidéo OK');

// 5. Thème sombre et interface en arabe (RTL)
await opt.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, uiLang: 'ar' } }); });
for (const [page, name] of [[panel, '7-panel-ar-dark'], [opt, '8-options-ar-dark']]) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await page.waitForTimeout(700);
  const dir = await page.evaluate(() => document.documentElement.dir);
  if (dir !== 'rtl') errors.push(`${name} : direction ${dir} au lieu de rtl`);
  await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: name.startsWith('8') ? false : true });
}
const studioAr = await ctx.newPage();
watch(studioAr, 'studio-ar');
await studioAr.emulateMedia({ colorScheme: 'dark' });
await studioAr.goto('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos/upload');
await studioAr.setInputFiles('#picker', { name: 'قُولْهَا-لِيَّا [usesuno.com].wav', mimeType: 'audio/wav', buffer: wav() });
await studioAr.waitForFunction(() => document.querySelector('#tp-studio-card')?.shadowRoot?.querySelector('.tp-item[data-act=title]'), null, { timeout: 30000 });
await studioAr.waitForTimeout(500);
await studioAr.locator('#tp-studio-card').screenshot({ path: path.join(shots, '9-studio-card-ar.png') });
log('captures sombre / arabe OK');

await ctx.close();
if (errors.length) { console.error('ERREURS :\n' + errors.join('\n')); process.exit(1); }
console.log('✅ e2e OK — captures dans', shots);
