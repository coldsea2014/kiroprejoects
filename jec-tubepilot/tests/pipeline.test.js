import test from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './chrome-mock.js';

const store = installChrome();
const { setSettings, getPack, listPacks } = await import('../lib/storage.js');
const G = await import('../lib/gemini.js');
const { run, fromManual } = await import('../lib/pipeline.js');
const { ANALYSIS_SCHEMA, SEO_SCHEMA } = await import('../lib/prompts.js');

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
  if (url.includes(':generateContent')) {
    const body = JSON.parse(init.body);
    if (body.tools) {
      assert.ok(!body.generationConfig.responseSchema, 'pas de schéma avec la recherche Google');
      return json({ candidates: [{ content: { parts: [{ text: 'Voici : {"keywords":["شعبي 2026"],"hashtags":["#شعبي_مغربي","nayda"],"title_patterns":["[titre] 🔥 [style]"],"notes":"ok"}' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }] }, finishReason: 'STOP' }] });
    }
    assert.equal(init.headers['x-goog-api-key'], 'AIzaTEST');
    const hasMedia = body.contents[0].parts.some((p) => p.fileData);
    const out = hasMedia ? ANALYSIS : SEO;
    return json({ candidates: [{ content: { parts: [{ text: 'réflexion', thought: true }, { text: JSON.stringify(out) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 1234 } });
  }
  return json({ error: { message: 'inconnu' } }, 404);
};

await setSettings({ aiEngine: 'api', geminiKey: 'AIzaTEST', modelMain: 'gemini-9-pro', modelFast: 'gemini-9-flash', competitorLookup: false, profiles: [{ id: 'default', name: 'Test', languages: 'ar, fr', country: 'MA', niche: 'Musique marocaine', signature: 'Instagram : https://instagram.com/test' }] });

test('chaîne complète avec un lien YouTube public', async () => {
  const steps = [];
  const pack = await run({ youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', ctx: { videoId: 'abcdefghijk' }, onProgress: (p) => steps.push(p.step) });
  assert.deepEqual([...new Set(steps)], ['analyze', 'keywords', 'trends', 'seo', 'done']);
  const gen = calls.filter((c) => c.url.includes(':generateContent') && !c.body.tools);
  assert.equal(gen.length, 2);
  const grounded = calls.filter((c) => c.url.includes(':generateContent') && c.body.tools);
  assert.equal(grounded.length, 1, 'tendances web demandées une fois');
  assert.equal(grounded[0].body.tools[0].google_search !== undefined, true);
  assert.equal(gen[0].body.contents[0].parts[0].fileData.fileUri, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.match(gen[0].body.contents[0].parts[1].text, /GUIDE DES STYLES ET RYTHMES DU MONDE/);
  assert.match(gen[1].body.contents[0].parts[0].text, /TENDANCES ACTUELLES/);
  assert.match(gen[1].body.contents[0].parts[0].text, /#شعبي_مغربي/);
  // recherches faites dans le pays du style entendu (MA puis DZ)
  const sug = calls.filter((c) => c.url.includes('suggestqueries')).map((c) => new URL(c.url).searchParams.get('gl'));
  assert.ok(sug.includes('MA') && sug.includes('DZ'));
  assert.equal(gen[0].body.generationConfig.responseMimeType, 'application/json');
  assert.equal(gen[0].body.generationConfig.responseSchema.type, 'OBJECT');
  assert.match(gen[1].body.contents[0].parts[0].text, /RECHERCHES RÉELLES SUR YOUTUBE/);
  assert.equal(pack.key, 'vid:abcdefghijk');
  assert.equal(pack.analysis.music.primary_genre, 'chaabi');
  assert.equal(pack.seo.mainKeyword, 'شعبي مغربي');
  assert.equal(pack.seo.chapters.length, 3);
  assert.match(pack.seo.description, /00:32 🔥 اللازمة/);
  assert.deepEqual(pack.trends.web.hashtags, ['#شعبي_مغربي', '#nayda']);
  assert.equal(pack.keywords.locale.gl, 'MA');
  assert.match(pack.seo.description, /instagram\.com\/test/);
  assert.ok(pack.seo.tags.includes('قولها ليا'));
  assert.ok(pack.keywords.items.length > 0);
  assert.ok(await getPack('vid:abcdefghijk'));
  assert.equal((await listPacks())[0].key, 'vid:abcdefghijk');
});

test('régénération : l\'écoute est réutilisée (pas de nouvel envoi du média)', async () => {
  calls.length = 0;
  const pack = await run({ ctx: { packKey: 'vid:abcdefghijk' }, options: { mode: 'express' } });
  const gen = calls.filter((c) => c.url.includes(':generateContent') && !c.body.tools);
  assert.equal(gen.length, 1);
  assert.ok(!gen[0].body.contents[0].parts.some((p) => p.fileData));
  assert.match(gen[0].body.contents[0].parts[0].text, /ANALYSE DE LA VIDÉO PAR ÉCOUTE/);
  assert.equal(pack.analysis.music.hook_line, 'قولها ليا');
});

test('mode abonnement : réponse collée', async () => {
  const pack = await fromManual({ text: '```json\n' + JSON.stringify({ analysis: ANALYSIS, seo: SEO }) + '\n```', ctx: { fileName: 'song.mp4', fileSize: 42 } });
  assert.equal(pack.key, 'file:song.mp4:42');
  assert.equal(pack.seo.titles.length, 2);
});

test('gemini : erreurs lisibles et choix des modèles', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, statusText: '', json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }) });
  await assert.rejects(G.generate({ key: 'k', model: 'gemini-9-pro', parts: [{ text: 'x' }] }), /Quota journalier/);
  globalThis.fetch = saved;
  const r = G.rankModels([{ id: 'gemini-2.5-pro' }, { id: 'gemini-3-pro-preview' }, { id: 'gemini-2.5-flash' }, { id: 'gemini-2.5-flash-lite' }, { id: 'gemini-flash-latest' }, { id: 'gemini-embedding-001' }]);
  assert.equal(r.pro, 'gemini-3-pro-preview');
  assert.equal(r.flash, 'gemini-2.5-flash');
  assert.equal(r.lite, 'gemini-2.5-flash-lite');
  assert.deepEqual(G.parseJSONLoose('bla ```json\n{"a":1,}\n``` bla'), { a: 1 });
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

test('mode abonnement (gemini.google.com) : lien public → écoute → SEO dans la même conversation → fenêtre fermée', async () => {
  await setSettings({ aiEngine: 'web', geminiSteps: 2, geminiWindow: 'popup', geminiClose: true });
  const G = store.__gemini;
  const prompts = [];
  G.setResponder(async (prompt) => {
    prompts.push(prompt);
    return 'Voici le résultat :\n```json\n' + JSON.stringify(prompt.includes('À PRODUIRE') ? SEO : ANALYSIS) + '\n```';
  });
  const saved = globalThis.fetch;
  const oembed = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/oembed')) { oembed.push(url); return { ok: true, status: 200, json: async () => ({}) }; }
    return saved(url, init);
  };
  calls.length = 0;
  const pack = await run({ ctx: { videoId: 'publicvideo1', packKey: 'vid:publicvideo1' } });
  globalThis.fetch = saved;
  assert.equal(oembed.length, 1, 'visibilité vérifiée par oEmbed');
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /VIDÉO À ANALYSER : https:\/\/www\.youtube\.com\/watch\?v=publicvideo1/);
  assert.match(prompts[0], /FORMAT DE RÉPONSE OBLIGATOIRE/);
  assert.match(prompts[1], /RECHERCHES RÉELLES SUR YOUTUBE/);
  assert.match(prompts[1], /RECHERCHE DE TENDANCES/);
  assert.equal(calls.filter((c) => c.url.includes('generativelanguage')).length, 0, 'aucun appel à l\'API Gemini');
  assert.equal(G.opened.length, 1, 'une seule fenêtre Gemini pour les 2 demandes');
  assert.equal(G.opened[0].type, 'popup');
  assert.equal(G.opened[0].closed, true, 'fenêtre fermée à la fin');
  assert.equal(pack.models.engine, 'web');
  assert.equal(pack.analysis.music.primary_genre, 'chaabi');
  assert.match(pack.seo.description, /00:32 🔥 اللازمة/);
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
  assert.match(pack.warnings.join(' '), /sans écoute/);
  assert.equal(pack.seo.chapters.length, 0);
});

test('mode abonnement : « no_access » de Gemini → SEO sans écoute, sans planter', async () => {
  const G = store.__gemini;
  let n = 0;
  G.setResponder(async (prompt) => (++n === 1 ? '{"error": "no_access"}' : '```json\n' + JSON.stringify(SEO) + '\n```'));
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('/oembed') ? { ok: true, status: 200, json: async () => ({}) } : saved(url, init));
  const pack = await run({ ctx: { videoId: 'blockedvid01', packKey: 'vid:blockedvid01' } });
  globalThis.fetch = saved;
  assert.equal(n, 2);
  assert.match(pack.warnings.join(' '), /no_access/);
  await setSettings({ aiEngine: 'api' });
});
