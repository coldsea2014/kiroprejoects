import test from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './chrome-mock.js';

const store = installChrome();
const { setSettings, setCompetitors } = await import('../lib/storage.js');
const Radar = await import('../lib/radar.js');
const { teardown } = await import('../lib/pipeline.js');
const { teardownPrompt } = await import('../lib/prompts.js');

const H = 3600000, D = 24 * H;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
// fausse YouTube Data API : vues modifiables entre deux relevés
const VIDS = {
  hotvideo001: { title: 'قولها ليا 🔥 شعبي', publishedAt: iso(10 * H), views: 20000 },
  old00000001: { title: 'a', publishedAt: iso(5 * D), views: 40000 },
  old00000002: { title: 'b', publishedAt: iso(8 * D), views: 50000 },
  old00000003: { title: 'c', publishedAt: iso(12 * D), views: 60000 },
  old00000004: { title: 'd', publishedAt: iso(20 * D), views: 45000 },
  myvideo0001: { title: 'Ma chanson', publishedAt: iso(6 * H), views: 300 }
};
const calls = [];
globalThis.fetch = async (url) => {
  url = new URL(String(url));
  calls.push(url.pathname);
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
  if (url.pathname.endsWith('/playlistItems')) return json({ items: Object.keys(VIDS).filter((id) => id !== 'myvideo0001').map((id) => ({ contentDetails: { videoId: id } })) });
  if (url.pathname.endsWith('/videos')) {
    const ids = url.searchParams.get('id').split(',');
    return json({ items: ids.filter((id) => VIDS[id]).map((id) => ({ id, snippet: { title: VIDS[id].title, publishedAt: VIDS[id].publishedAt, channelId: id === 'myvideo0001' ? 'UCmine' : 'UCaaaaaaaaaaaaaaaaaaaaaa', channelTitle: 'Chaîne A', thumbnails: {} }, statistics: { viewCount: String(VIDS[id].views) }, contentDetails: { duration: 'PT3M' } })) });
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

await setSettings({ ytKey: 'KEY', profiles: [{ id: 'default', name: 'Test', languages: 'ar', country: 'MA' }] });
await setCompetitors([{ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', title: 'Chaîne A', uploads: 'UUaaaaaaaaaaaaaaaaaaaaaa' }]);

test('radar : vitesse mesurée entre deux relevés, sinon estimée depuis la publication', () => {
  const pub = iso(10 * H);
  const now = Date.now();
  assert.deepEqual(Radar.velocity([[now, 20000]], pub), { vph: 2000, measured: false });
  const v = Radar.velocity([[now - 2 * H, 20000], [now, 30000]], pub);
  assert.equal(v.measured, true);
  assert.equal(Math.round(v.vph), 5000);
  // relevés trop rapprochés (< 20 min) : pas de mesure
  assert.equal(Radar.velocity([[now - 5 * 60000, 20000], [now, 20100]], pub).measured, false);
  assert.equal(Math.round(Radar.typicalVph([{ views: 40000, ageDays: 5 }, { views: 50000, ageDays: 8 }, { views: 60000, ageDays: 12 }, { views: 9e9, ageDays: 0.2 }])), Math.round(50000 / 168));
});

test('radar : une vidéo qui explose est signalée une seule fois ; ma vidéo en retard est signalée', async () => {
  await Radar.track({ videoId: 'myvideo0001', title: 'Ma chanson', packKey: 'vid:myvideo0001' });
  const r1 = await Radar.scan();
  assert.deepEqual(r1.hot.map((v) => v.id), ['hotvideo001']);
  assert.equal(r1.hot[0].measured, false);
  assert.ok(r1.hot[0].ratio > 6);
  assert.deepEqual(r1.behind.map((v) => v.id), ['myvideo0001'], 'ma vidéo est très en dessous du rythme de la niche');
  assert.ok(Object.keys(r1.radar.videos).every((id) => id === 'hotvideo001' || id === 'old00000001'), 'seules les vidéos de moins de 7 jours sont suivies');
  assert.ok(calls.filter((p) => p.endsWith('/videos')).length <= 2, 'peu de quota : 1 appel par chaîne + 1 pour mes vidéos');

  VIDS.hotvideo001.views = 30000;
  const r2 = await Radar.scan({ now: Date.now() + 2 * H });
  assert.equal(r2.hot.length, 0, 'pas de 2e alerte pour la même vidéo');
  assert.equal(r2.behind.length, 0);
  const hot = r2.radar.videos.hotvideo001;
  assert.equal(hot.measured, true);
  assert.equal(Math.round(hot.vph), 5000);
  assert.equal(r2.radar.unseen, 2);
  assert.equal((await Radar.markSeen()).unseen, 0);
  assert.equal(Radar.hotList(r2.radar)[0].id, 'hotvideo001');
});

test('radar : sans clé YouTube, rien n\'est appelé', async () => {
  await setSettings({ ytKey: '' });
  const n = calls.length;
  const r = await Radar.scan();
  assert.equal(r.skipped, 'key');
  assert.equal(calls.length, n);
  await setSettings({ ytKey: 'KEY' });
});

test('pourquoi elle a explosé : Gemini écoute le lien, résultat gardé (une seule demande)', async () => {
  const video = { id: 'hotvideo001', title: 'قولها ليا 🔥 شعبي', channelTitle: 'Chaîne A', views: 30000, publishedAt: iso(12 * H), vph: 5000, ratio: 16.7, tags: ['chaabi'] };
  const txt = teardownPrompt(video, { profile: { name: 'NECO' } });
  for (const re of [/TUBEPILOT MASTER/, /VIRAL TEARDOWN/, /watch\?v=hotvideo001/, /×16\.7/, /never suggest reusing the song/, /"for_my_channel"/]) assert.match(txt, re);
  const G = store.__gemini;
  const jobs = [];
  G.setResponder(async (prompt, job) => { jobs.push(job); return '```json\n' + JSON.stringify({ verdict: 'Refrain dès 0:03', hook_first_seconds: 'refrain', viral_factors: [{ factor: 'hook', evidence: 'x', weight: 5 }], title_formula: '[refrain] 🔥 [style]', copy: ['refrain tôt'], avoid: ['paroles'], for_my_channel: { title_ideas: ['a', 'b', 'c'] } }) + '\n```'; });
  const d1 = await teardown(video);
  assert.equal(d1.verdict, 'Refrain dès 0:03');
  assert.equal(d1.video.id, 'hotvideo001');
  const d2 = await teardown(video);
  assert.equal(d2.verdict, d1.verdict);
  assert.equal(jobs.length, 1, 'deuxième demande servie par le cache');
  await teardown(video, { force: true });
  assert.equal(jobs.length, 2);
});
