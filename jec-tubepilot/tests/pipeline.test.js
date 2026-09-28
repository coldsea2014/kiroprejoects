import test from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './chrome-mock.js';

const store = installChrome();
const { setSettings, getSettings, getPack, listPacks } = await import('../lib/storage.js');
const { run, fromManual } = await import('../lib/pipeline.js');
const { ANALYSIS_SCHEMA, SEO_SCHEMA, webSeoPrompt } = await import('../lib/prompts.js');

const ANALYSIS = {
  content_type: 'music', summary: 'Chanson chaâbi festive.', language: 'Arabe — darija marocaine', language_code: 'ar', target_countries: ['MA', 'DZ'], search_language: 'ar',
  highlights: [{ start: 33, label: 'اللازمة', kind: 'refrain', why: 'refrain le plus fort' }],
  music: { primary_genre: 'chaabi', genre_search_terms: ['شعبي مغربي', 'chaabi marocain'], rhythm_candidates: [{ name: 'chaabi 6/8', confidence: 0.8, evidence: '6/8' }], regional_style: 'Maroc', bpm: 118, time_signature: '6/8', mood: ['festif'], energy: 8, instruments: ['violon', 'darbouka'], vocals: 'voix masculine', hook_line: 'قولها ليا', hook_start: 32, song_title_guess: 'قولها ليا' },
  timeline: [{ start: 0, label: 'Intro violon' }, { start: 32, label: 'Refrain' }, { start: 70, label: 'Couplet 2' }, { start: 150, label: 'Final' }],
  search_queries: ['شعبي مغربي', 'اغاني مغربية'], duration_seconds: 185, confidence: 0.86
};
const SEO = {
  main_keyword: 'شعبي مغربي', secondary_keywords: ['اغاني مغربية'], audience_insight: 'Public festif.',
  titles: [{ text: 'قولها ليا 🔥 شعبي مغربي نايضة للأعراس', hook_type: 'moment d\'écoute' }, { text: 'شعبي مغربي 2026 | قولها ليا', hook_type: 'mot-clé' }],
  ab_titles: ['a', 'b', 'c'], description_intro: 'قولها ليا — شعبي مغربي نايضة', description_body: 'أغنية شعبية مغربية للأعراس والحفلات.', cta: 'اشترك 🔔',
  chapters: [{ start: 0, label: 'مقدمة' }, { start: 32, label: 'اللازمة' }, { start: 70, label: 'الكوبلي 2' }],
  tags: ['شعبي مغربي', 'قولها ليا', 'chaabi marocain'], hashtags: ['#شعبي', '#قولها_ليا', '#chaabi'], pinned_comment: 'فين غادي تسمعوها؟', thumbnail: { texts: ['نايضة'], concept: 'fête', prompt: 'wedding party' }
};

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
  const json = (obj, status = 200) => ({ ok: status < 400, status, statusText: '', headers: new Map(), json: async () => obj, text: async () => JSON.stringify(obj) });
  if (url.includes('suggestqueries.google.com')) {
    const q = new URL(url).searchParams.get('q');
    return json([q, [q, q + ' 2026', q + ' نايضة', q + ' اعراس']]);
  }
  if (url.includes('/oembed')) return json({}, /private/.test(url) ? 401 : 200);
  return json({ error: { message: 'inconnu' } }, 404);
};

// faux gemini.google.com : la 1re demande (écoute) renvoie l'analyse, la demande SEO renvoie le pack
const answer = (prompt) => 'Voici le résultat :\n```json\n' + JSON.stringify(prompt.includes('DELIVERABLES') ? SEO : ANALYSIS) + '\n```';
await setSettings({ geminiSteps: 2, geminiWindow: 'popup', geminiClose: true, competitorLookup: false, profiles: [{ id: 'default', name: 'Test', languages: 'ar, fr', country: 'MA', niche: 'Musique marocaine', signature: 'Instagram : https://instagram.com/test' }] });

test('ancien mode clé API : réglages supprimés, Gemini du compte seulement', async () => {
  await chrome.storage.local.set({ settings: { ...(await chrome.storage.local.get('settings')).settings, aiEngine: 'api', geminiKey: 'AIzaOLD', modelMain: 'gemini-3.1-pro-preview' } });
  const s = await getSettings();
  assert.equal(s.aiEngine, undefined);
  assert.equal(s.geminiKey, undefined);
  assert.equal(s.geminiMode, 'fast', 'modèle rapide par défaut');
  assert.equal(s.geminiModel, undefined);
  assert.equal(s.replaceExisting, true);
  await setSettings({});
  assert.equal((await chrome.storage.local.get('settings')).settings.geminiKey, undefined, 'clé AI Studio effacée');
});

test('chaîne complète avec un lien YouTube public (compte Gemini, modèle choisi, même conversation, recherches pendant l\'écoute)', async () => {
  const G = store.__gemini;
  const jobs = [];
  G.setResponder(async (prompt, job) => { jobs.push(job); return answer(prompt); });
  calls.length = 0;
  const steps = [];
  const pack = await run({ youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', ctx: { videoId: 'abcdefghijk' }, onProgress: (p) => steps.push(p.step) });
  assert.deepEqual([...new Set(steps)], ['gemini', 'analyze', 'keywords', 'trends', 'seo', 'done']);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.model === 'fast'), 'modèle rapide demandé');
  assert.match(jobs[0].prompt, /TUBEPILOT MASTER/);
  assert.match(jobs[0].prompt, /WORLD STYLES & RHYTHMS GUIDE/);
  assert.match(jobs[0].prompt, /VIDEO TO ANALYZE \(public YouTube video\): https:\/\/www\.youtube\.com\/watch\?v=abcdefghijk/);
  assert.match(jobs[1].prompt, /REAL YOUTUBE SEARCHES/);
  assert.match(jobs[1].prompt, /pinned_comment/);
  assert.match(jobs[1].prompt, /1-2 emojis/);
  assert.equal(calls.filter((c) => c.url.includes('generativelanguage')).length, 0, 'aucune clé API, aucun appel à l\'API Gemini');
  // recherches faites dans le pays du style entendu (MA puis DZ)
  const sug = calls.filter((c) => c.url.includes('suggestqueries')).map((c) => new URL(c.url).searchParams.get('gl'));
  assert.ok(sug.includes('MA') && sug.includes('DZ'));
  assert.equal(pack.key, 'vid:abcdefghijk');
  assert.equal(pack.models.engine, 'web');
  assert.equal(pack.analysis.music.primary_genre, 'chaabi');
  assert.equal(pack.seo.mainKeyword, 'شعبي مغربي');
  assert.equal(pack.seo.chapters.length, 3);
  assert.match(pack.seo.description, /00:32 🔥 اللازمة/);
  assert.equal(pack.seo.pinnedComment, 'فين غادي تسمعوها؟');
  assert.equal(pack.keywords.locale.gl, 'MA');
  assert.match(pack.seo.description, /instagram\.com\/test/);
  assert.ok(pack.seo.tags.includes('قولها ليا'));
  assert.ok(await getPack('vid:abcdefghijk'));
  assert.equal((await listPacks())[0].key, 'vid:abcdefghijk');
  assert.equal(G.opened.at(-1).closed, true, 'fenêtre Gemini fermée');
});

test('régénération : l\'écoute est réutilisée (une seule demande SEO, sans média)', async () => {
  const G = store.__gemini;
  const jobs = [];
  G.setResponder(async (prompt, job) => { jobs.push(job); return answer(prompt); });
  const pack = await run({ ctx: { packKey: 'vid:abcdefghijk' }, options: { mode: 'express' } });
  assert.equal(jobs.length, 1);
  assert.ok(!jobs[0].attachKey);
  assert.match(jobs[0].prompt, /LISTENING ANALYSIS OF THE VIDEO/);
  assert.equal(pack.analysis.music.hook_line, 'قولها ليا');
});

test('lien refusé une première fois : Gemini est relancé dans la même conversation', async () => {
  const G = store.__gemini;
  const prompts = [];
  G.setResponder(async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? '{"error": "no_access"}' : answer(prompt); });
  const before = G.opened.length;
  const pack = await run({ ctx: { videoId: 'retryvideo1', packKey: 'vid:retryvideo1' } });
  assert.equal(prompts.length, 3, 'écoute, relance, SEO');
  assert.match(prompts[1], /PUBLIC YouTube video: https:\/\/www\.youtube\.com\/watch\?v=retryvideo1/);
  assert.equal(G.opened.length, before + 1, 'une seule fenêtre Gemini');
  assert.equal(pack.analysis.music.primary_genre, 'chaabi');
  assert.equal(pack.warnings.length, 0);
});

test('mode abonnement : réponse collée', async () => {
  const pack = await fromManual({ text: '```json\n' + JSON.stringify({ analysis: ANALYSIS, seo: SEO }) + '\n```', ctx: { fileName: 'song.mp4', fileSize: 42 } });
  assert.equal(pack.key, 'file:song.mp4:42');
  assert.equal(pack.seo.titles.length, 2);
});

test('consigne maître : experts, titres avec emojis, commentaire épinglé, timeline', () => {
  const txt = webSeoPrompt({ profile: { name: 'NECO', niche: 'Moroccan music' }, titleCount: 8 }, ANALYSIS, null, null, null);
  for (const re of [/YOUTUBE GROWTH STRATEGIST/, /ETHNOMUSICOLOGIST/, /SEO SPECIALIST/, /HOOK COPYWRITER/, /first 40 characters/, /1-2 emojis/, /pinned_comment: the comment the channel will pin/, /00:32 🔥 Chorus/, /"قولها ليا"/]) assert.match(txt, re);
});

test('schémas : types en majuscules et champs requis existants', () => {
  const walk = (s) => {
    assert.match(s.type, /^[A-Z]+$/);
    if (s.type === 'OBJECT') {
      (s.required || []).forEach((k) => assert.ok(k in s.properties, 'requis inconnu : ' + k));
      Object.values(s.properties).forEach(walk);
    }
    if (s.type === 'ARRAY') walk(s.items);
  };
  walk(ANALYSIS_SCHEMA);
  walk(SEO_SCHEMA);
});

test('mode abonnement : vidéo privée sans fichier → SEO sans écoute (avertissement), aucune timeline inventée', async () => {
  const G = store.__gemini;
  const prompts = [];
  G.setResponder(async (prompt) => { prompts.push(prompt); return '```json\n' + JSON.stringify(SEO) + '\n```'; });
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('/oembed') ? { ok: false, status: 401, json: async () => ({}) } : saved(url, init));
  const pack = await run({ ctx: { videoId: 'privatevid01', packKey: 'vid:privatevid01', fileName: 'ya_lil.mp4' } });
  globalThis.fetch = saved;
  assert.equal(prompts.length, 1, 'seulement la demande SEO');
  assert.match(pack.warnings.join(' '), /without a local file/);
  assert.equal(pack.seo.chapters.length, 0);
});

test('mode abonnement : « no_access » de Gemini → SEO sans écoute, sans planter', async () => {
  const G = store.__gemini;
  let n = 0;
  G.setResponder(async (prompt) => (++n <= 2 ? '{"error": "no_access"}' : '```json\n' + JSON.stringify(SEO) + '\n```'));
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('/oembed') ? { ok: true, status: 200, json: async () => ({}) } : saved(url, init));
  const pack = await run({ ctx: { videoId: 'blockedvid01', packKey: 'vid:blockedvid01' } });
  globalThis.fetch = saved;
  assert.equal(n, 3, 'écoute, relance du lien, SEO');
  assert.match(pack.warnings.join(' '), /no_access/);
});
