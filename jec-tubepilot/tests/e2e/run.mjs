// Test de bout en bout : Chromium + extension chargée, maquettes de YouTube Studio / YouTube, API Google simulées
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

let geminiCalls = 0, uploaded = 0;
await ctx.route('https://studio.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: studioHtml }));
await ctx.route('https://www.youtube.com/oembed**', (r) => r.fulfill({ status: /privatevideo/.test(r.request().url()) ? 401 : 200, contentType: 'application/json', body: '{}' }));
await ctx.route('https://www.youtube.com/watch**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: watchHtml }));
const gemLog = [];
await ctx.route('https://gemini.google.com/__log', (r) => { gemLog.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 204, body: '' }); });
await ctx.route('https://gemini.google.com/app**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: geminiTpl.replace('__ANALYSIS__', JSON.stringify(ANALYSIS)).replace('__SEO__', JSON.stringify(SEO)) }));
await ctx.route('https://suggestqueries.google.com/**', (r) => {
  const q = new URL(r.request().url()).searchParams.get('q');
  r.fulfill({ contentType: 'application/json; charset=utf-8', headers: cors, body: JSON.stringify([q, [q, q + ' 2026', q + ' نايضة']]) });
});
await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request();
  const url = new URL(req.url());
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname === '/upload/v1beta/files') return r.fulfill({ status: 200, headers: { ...cors, 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/session/42' }, body: '{}' });
  if (url.pathname === '/upload/session/42') { uploaded = req.postDataBuffer()?.length || 0; return r.fulfill({ headers: cors, json: { file: { name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mimeType: 'audio/wav', state: 'PROCESSING' } } }); }
  if (url.pathname === '/v1beta/files/abc') return r.fulfill({ headers: cors, json: req.method() === 'DELETE' ? {} : { name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mimeType: 'audio/wav', state: 'ACTIVE' } });
  if (url.pathname.startsWith('/v1beta/models') && req.method() === 'GET') return r.fulfill({ headers: cors, json: { models: [{ name: 'models/gemini-9-pro', displayName: 'Gemini 9 Pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9-flash', displayName: 'Gemini 9 Flash', supportedGenerationMethods: ['generateContent'] }] } });
  if (url.pathname.endsWith(':generateContent')) {
    geminiCalls++;
    const body = JSON.parse(req.postData());
    if (body.tools) return r.fulfill({ headers: cors, json: { candidates: [{ content: { parts: [{ text: '{"keywords":["شعبي 2026","نايضة اعراس"],"hashtags":["#شعبي_مغربي","#نايضة"],"title_patterns":["[titre] 🔥 [style]"],"notes":"Le chaabi de mariage monte avant l\'été."}' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/tendances', title: 'example.com' } }] }, finishReason: 'STOP' }] } });
    const media = body.contents[0].parts.some((p) => p.fileData);
    await new Promise((res) => setTimeout(res, 300));
    return r.fulfill({ headers: cors, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(media ? ANALYSIS : SEO) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 999 } } });
  }
  r.fulfill({ status: 404, headers: cors, json: { error: { message: 'mock: ' + url.pathname } } });
});


function watch(page, name) {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
}

// 1. Réglages
const opt = await ctx.newPage();
watch(opt, 'options');
await opt.goto(`chrome-extension://${extId}/options/options.html`);
await opt.evaluate(() => chrome.storage.local.set({ settings: { aiEngine: 'api', geminiKey: 'AIzaTEST', modelMain: 'gemini-9-pro', modelFast: 'gemini-9-flash', models: [{ id: 'gemini-9-pro', label: 'Gemini 9 Pro' }], competitorLookup: false, autopilot: true, autofill: true, profiles: [{ id: 'default', name: 'Chaîne test', channelId: 'UCabcdefghijklmnopqrstuv', languages: 'ar, fr', country: 'MA', niche: 'Musique marocaine', genre: 'chaabi', aiGenerated: true, signature: 'Instagram : https://instagram.com/test' }], activeProfile: 'default' } }));
await opt.reload();
await opt.waitForSelector('.profile');
await opt.screenshot({ path: path.join(shots, '1-options.png'), fullPage: true });
log('réglages OK — profils :', await opt.locator('.profile').count());

// 2. YouTube Studio : import d'un fichier → pilote automatique
const studio = await ctx.newPage();
watch(studio, 'studio');
await studio.goto('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos/upload');
await studio.setInputFiles('#picker', { name: 'قُولْهَا-لِيَّا [usesuno.com].wav', mimeType: 'audio/wav', buffer: wav() });
await studio.waitForSelector('#tp-studio-card', { timeout: 10000 });
log('carte TubePilot affichée sous le titre');
await studio.waitForFunction(() => document.querySelector('#title-textarea #textbox').textContent.includes('شعبي'), null, { timeout: 30000 });
await studio.waitForFunction(() => document.querySelectorAll('ytcp-chip').length >= 3, null, { timeout: 15000 });
const res = await studio.evaluate(() => ({
  title: document.querySelector('#title-textarea #textbox').textContent,
  description: document.querySelector('#description-textarea #textbox').innerText,
  tags: [...document.querySelectorAll('ytcp-chip')].map((c) => c.textContent.trim())
}));
log('titre inséré :', res.title);
log('tags insérés :', res.tags.join(', '));
if (!/00:12 🔥 اللازمة/.test(res.description)) errors.push('description sans timeline 🔥 : ' + res.description.slice(0, 300));
if (!res.description.includes('instagram.com/test')) errors.push('signature absente');
log('envoi à Gemini :', uploaded, 'octets · appels generateContent :', geminiCalls);
await studio.waitForTimeout(600);
await studio.screenshot({ path: path.join(studio.constructor ? shots : shots, '2-studio.png'), fullPage: true });

// clic sur un autre titre proposé
await studio.locator('#tp-studio-card').locator('.tp-title').nth(1).click();
await studio.waitForTimeout(400);
log('titre après clic :', await studio.evaluate(() => document.querySelector('#title-textarea #textbox').textContent));

// 2b. Ce que l'utilisateur tape pendant l'analyse n'est jamais remplacé
const studio2 = await ctx.newPage();
watch(studio2, 'studio2');
await studio2.goto('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos/upload');
await studio2.setInputFiles('#picker', { name: 'autre-chanson.wav', mimeType: 'audio/wav', buffer: wav() });
await studio2.evaluate(() => { const t = document.querySelector('#title-textarea #textbox'); t.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, 'Mon titre à moi'); });
await studio2.waitForFunction(() => document.querySelector('#tp-studio-card')?.shadowRoot?.querySelector('.tp-title'), null, { timeout: 30000 });
await studio2.waitForTimeout(800);
const kept = await studio2.evaluate(() => document.querySelector('#title-textarea #textbox').textContent);
if (kept !== 'Mon titre à moi') errors.push('titre de l\'utilisateur remplacé : ' + kept);
log('titre tapé par l\'utilisateur conservé :', kept);
await studio2.close();

// 3. Panneau latéral (ouvert comme une page)
const panel = await ctx.newPage();
watch(panel, 'panel');
await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
await panel.waitForSelector('#titles .tt', { timeout: 10000 });
await panel.screenshot({ path: path.join(shots, '3-panel.png'), fullPage: true });
log('panneau : titres', await panel.locator('#titles .tt').count(), '· score', await panel.locator('#scoreHead .sc').first().textContent());
for (const t of ['competitors', 'trends', 'history', 'video', 'keywords']) await panel.click(`.tabs button[data-tab="${t}"]`);
await panel.fill('#kwSeed', 'شعبي مغربي');
await panel.click('#kwGo');
await panel.waitForSelector('#kwResults table', { timeout: 10000 });
log('mots-clés trouvés :', await panel.locator('#kwResults tr').count() - 1);
await panel.screenshot({ path: path.join(shots, '4-keywords.png'), fullPage: true });

// 3b. Mode abonnement (gemini.google.com piloté) : import dans Studio → audio joint dans Gemini → 2 demandes → Studio rempli
await opt.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, aiEngine: 'web', geminiSteps: 2, geminiWindow: 'popup', geminiClose: true } }); });
const geminiPages = [];
// banc de test : la 1re navigation d'une fenêtre ouverte par l'extension peut échapper à la maquette → rechargée une fois
ctx.on('page', async (p) => {
  geminiPages.push(p);
  watch(p, 'gemini');
  await p.waitForLoadState().catch(() => {});
  if (p.url().startsWith('chrome-error://')) await p.goto('https://gemini.google.com/app').catch(() => {});
});
const studio3 = await ctx.newPage();
watch(studio3, 'studio3');
await studio3.goto('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos/upload');
const callsBefore = geminiCalls;
await studio3.setInputFiles('#picker', { name: 'khaliji-web.wav', mimeType: 'audio/wav', buffer: wav() });
try {
  await studio3.waitForFunction(() => document.querySelector('#title-textarea #textbox').textContent.includes('شعبي'), null, { timeout: 60000 });
} catch (e) {
  console.error('DIAG carte :', await studio3.evaluate(() => document.querySelector('#tp-studio-card')?.shadowRoot?.textContent?.replace(/\s+/g, ' ').slice(0, 800)));
  for (const p of ctx.pages()) console.error('DIAG page :', p.url());
  const g = ctx.pages().find((p) => p.url().startsWith('https://gemini.google.com'));
  if (g) console.error('DIAG gemini :', await g.evaluate(() => ({ prompts: window.__prompts?.length, files: window.__files, bar: document.getElementById('tp-gw')?.innerText, html: document.getElementById('chat')?.innerHTML.slice(0, 300) })));
  console.error('ERREURS jusqu\'ici :', errors.join('\n'));
  throw e;
}
const gp = geminiPages.find((p) => p.url().startsWith('https://gemini.google.com'));
const web = await studio3.evaluate(() => ({ title: document.querySelector('#title-textarea #textbox').textContent, description: document.querySelector('#description-textarea #textbox').innerText }));
log('mode abonnement — titre inséré :', web.title);
if (!/00:12 🔥 اللازمة/.test(web.description)) errors.push('mode abonnement : timeline absente');
if (geminiCalls !== callsBefore) errors.push('mode abonnement : l\'API Gemini a été appelée');
await studio3.waitForTimeout(1500);
const stillOpen = ctx.pages().filter((p) => p.url().startsWith('https://gemini.google.com') && !p.isClosed()).length;
log('fenêtre Gemini refermée :', stillOpen === 0 ? 'oui' : 'NON');
if (stillOpen) errors.push('fenêtre Gemini pas refermée');
log('Gemini a reçu :', gemLog.map((x) => (x.seo ? 'demande SEO' : 'demande d\'écoute') + (x.files.length ? ` + ${x.files.join(', ')}` : '')).join(' → '));
if (gemLog.length !== 2 || gemLog[0].seo || !gemLog[1].seo) errors.push('Gemini : 2 demandes attendues (écoute puis SEO)');
if (!gemLog[0]?.files?.some((f) => /khaliji-web\.wav/.test(f))) errors.push('Gemini : audio non joint');
await studio3.screenshot({ path: path.join(shots, '6-studio-web.png'), fullPage: true });

// 4. Page vidéo YouTube
const yt = await ctx.newPage();
watch(yt, 'watch');
await yt.goto('https://www.youtube.com/watch?v=zyxwvutsrqp');
await yt.waitForSelector('#tp-watch-card', { timeout: 10000 });
await yt.waitForTimeout(500);
await yt.screenshot({ path: path.join(shots, '5-watch.png') });
log('carte page vidéo OK');

await ctx.close();
if (errors.length) { console.error('ERREURS :\n' + errors.join('\n')); process.exit(1); }
console.log('✅ e2e OK — captures dans', shots);
