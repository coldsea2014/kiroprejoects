import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBpm, wavBlob } from '../lib/media.js';

// signal synthétique : grosse caisse sur les temps, charleston sur les contretemps, note tenue
function beat(bpm, { seconds = 40, hats = true, swing = 0 } = {}) {
  const sr = 16000, n = sr * seconds, out = new Float32Array(n);
  const period = 60 / bpm;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ph = t % period;
    let v = 0.05 * Math.sin(2 * Math.PI * 196 * t);
    if (ph < 0.08) v += Math.sin(2 * Math.PI * 60 * ph) * Math.exp(-ph * 40) * 0.9;
    const off = (t + period / 2 + swing) % period;
    if (hats && off < 0.02) v += rnd() * 0.3 * (1 - off / 0.02);
    out[i] = v;
  }
  return out;
}

test('tempo mesuré sur l\'ordinateur (±2 BPM, autre octave proposée aux extrêmes)', () => {
  for (const bpm of [75, 90, 118, 120, 128, 140, 170]) {
    const r = estimateBpm(beat(bpm));
    assert.ok(r, 'pas de résultat pour ' + bpm);
    const ok = Math.abs(r.bpm - bpm) <= 2 || (r.alt && Math.abs(r.alt - bpm) <= 2);
    assert.ok(ok, `attendu ${bpm}, obtenu ${r.bpm} (ou ${r.alt})`);
  }
  assert.equal(estimateBpm(new Float32Array(16000 * 3)), null);
});

test('WAV 16 kHz mono valide', async () => {
  const b = wavBlob(new Float32Array(16000));
  assert.equal(b.size, 44 + 32000);
  const head = Buffer.from(await b.slice(0, 12).arrayBuffer()).toString('latin1');
  assert.equal(head.slice(0, 4) + head.slice(8, 12), 'RIFFWAVE');
});
