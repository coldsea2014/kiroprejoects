import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { installChrome } from './chrome-mock.js';

installChrome();
const { decode, parseVolume, parseKeywordPlanner, importKeywordPlanner, kpStats, clearKeywordPlanner, volLabel, volMid } = await import('../lib/kpimport.js');
const { withVolumes } = await import('../lib/keywords.js');

test('keyword planner : volumes en plages, unités et langues', () => {
  assert.deepEqual(parseVolume('1K – 10K'), { min: 1000, max: 10000 });
  assert.deepEqual(parseVolume('1 k – 10 k'), { min: 1000, max: 10000 });
  assert.deepEqual(parseVolume('100 – 1 000'), { min: 100, max: 1000 });
  assert.deepEqual(parseVolume('12,100'), { min: 12100, max: 12100 });
  assert.deepEqual(parseVolume('1.000 – 10.000'), { min: 1000, max: 10000 });
  assert.deepEqual(parseVolume('10 k-100 k'), { min: 10000, max: 100000 });
  assert.deepEqual(parseVolume('1,2 M'), { min: 1200000, max: 1200000 });
  assert.deepEqual(parseVolume('1 mil – 10 mil'), { min: 1000, max: 10000 });
  assert.deepEqual(parseVolume('١٠ آلاف - ١٠٠ ألف'), { min: 10000, max: 100000 });
  assert.equal(parseVolume('--'), null);
  assert.equal(volLabel({ min: 1000, max: 10000 }), '1K–10K');
  assert.equal(volMid({ min: 1000, max: 10000 }), 3162);
});

test('keyword planner : export UTF-16 à tabulations (en-têtes français) et CSV UTF-8 anglais', async () => {
  const fr = 'Stats sur les mots clés 2026-09-01\nToutes les zones géographiques\nMot clé\tDevise\tNombre moyen de recherches mensuelles\tConcurrence\tConcurrence (valeur indexée)\nاغاني خليجية\tEUR\t100 k – 1 M\tFaible\t12\nشيلات\tEUR\t10 k – 100 k\tMoyenne\t40\n';
  const u16 = new Uint8Array(2 + fr.length * 2);
  u16[0] = 0xff; u16[1] = 0xfe;
  for (let i = 0; i < fr.length; i++) { const c = fr.charCodeAt(i); u16[2 + i * 2] = c & 255; u16[3 + i * 2] = c >> 8; }
  const rows = parseKeywordPlanner(decode(u16.buffer));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { kw: 'اغاني خليجية', vol: { min: 100000, max: 1000000 }, comp: 1, compIdx: 12 });
  assert.equal(rows[1].comp, 2);

  const en = '\uFEFFKeyword,Currency,Avg. monthly searches,Three month change,Competition\n"iraqi rap",USD,"10K – 100K",0%,Low\nkhaliji songs,USD,1K – 10K,+900%,High\n';
  const r2 = parseKeywordPlanner(decode(new TextEncoder().encode(en).buffer));
  assert.equal(r2[0].kw, 'iraqi rap');
  assert.deepEqual(r2[1].vol, { min: 1000, max: 10000 });
  assert.equal(r2[1].comp, 3);
  assert.throws(() => parseKeywordPlanner('a,b\n1,2'), /no-header/);

  await clearKeywordPlanner();
  const r = await importKeywordPlanner(u16.buffer, { country: 'SA', lang: 'ar' });
  assert.deepEqual(r, { imported: 2, total: 2 });
  assert.equal((await kpStats()).total, 2);
  // les volumes réels remontent les mots-clés dans le classement
  const items = await withVolumes([{ kw: 'شيلات', popularity: 30 }, { kw: 'mot inconnu', popularity: 30 }]);
  assert.equal(items[0].volLabel, '10K–100K');
  assert.ok(items[0].popularity > 30);
  assert.equal(items[1].vol, undefined);
});

test('traductions : chaque clé utilisée existe en anglais, français et arabe', () => {
  const out = execFileSync(process.execPath, [new URL('../tools/check-i18n.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /✓/);
});

test('données YouTube API effacées après 30 jours (règles YouTube API Services)', async () => {
  const { pruneCache } = await import('../lib/storage.js');
  const old = Date.now() - 31 * 86400000;
  await chrome.storage.local.set({
    'pack:vid:old': { key: 'vid:old', createdAt: old, seo: { titles: [{ text: 'T' }] }, competition: { videos: [{ id: 'x', views: 5 }] }, keywords: { items: [], compared: [{ kw: 'a' }] } },
    'pack:vid:new': { key: 'vid:new', createdAt: Date.now(), competition: { videos: [{ id: 'y' }] } },
    compCache: { ts: old, videos: [{ id: 'z' }] },
    'c:yt:abc': { ts: old, v: 1 }
  });
  await pruneCache();
  const all = await chrome.storage.local.get(null);
  assert.equal(all['pack:vid:old'].competition, null);
  assert.deepEqual(all['pack:vid:old'].keywords.compared, []);
  assert.equal(all['pack:vid:old'].seo.titles[0].text, 'T');
  assert.ok(all['pack:vid:new'].competition);
  assert.equal(all.compCache, undefined);
  assert.equal(all['c:yt:abc'], undefined);
});
