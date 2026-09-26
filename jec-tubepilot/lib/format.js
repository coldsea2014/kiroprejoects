// JEC TubePilot — utilitaires de formatage partagés (content scripts, pages, service worker, tests Node)
(function (g) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const uniq = (arr) => [...new Set(arr)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1 234 → « 1,2 k » ; 3 400 000 → « 3,4 M »
  function num(n) {
    n = Number(n) || 0;
    const a = Math.abs(n);
    const f = (v, u) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', ',') + ' ' + u;
    if (a >= 1e9) return f(n / 1e9, 'Md');
    if (a >= 1e6) return f(n / 1e6, 'M');
    if (a >= 1e3) return f(n / 1e3, 'k');
    return String(Math.round(n));
  }

  // secondes → « 3:07 » ou « 1:02:03 »
  function dur(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  // secondes → horodatage de chapitre « 00:05 », « 03:12 » ou « 1:02:03 »
  function ts(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p2 = (x) => String(x).padStart(2, '0');
    return h ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`;
  }

  // « 1:02:03 » / « 02:03 » / « 83 » → secondes
  function parseTs(t) {
    const parts = String(t ?? '').trim().split(':').map((x) => Number(x));
    if (!parts.length || parts.some((x) => !Number.isFinite(x) || x < 0)) return NaN;
    return parts.reduce((acc, x) => acc * 60 + x, 0);
  }

  // durée ISO 8601 de l'API YouTube (PT1H2M3S) → secondes
  function isoDur(iso) {
    const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  function ago(date) {
    const t = typeof date === 'number' ? date : Date.parse(date);
    if (!Number.isFinite(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    if (s < 86400 * 30) return `il y a ${Math.round(s / 86400)} j`;
    if (s < 86400 * 365) return `il y a ${Math.round(s / (86400 * 30))} mois`;
    return `il y a ${Math.round((s / (86400 * 365)) * 10) / 10} an(s)`.replace('.', ',');
  }

  // vues par heure depuis la publication
  function vph(views, publishedAt) {
    const t = Date.parse(publishedAt);
    if (!Number.isFinite(t)) return 0;
    const hours = Math.max(1, (Date.now() - t) / 3600000);
    return (Number(views) || 0) / hours;
  }

  const median = (arr) => {
    const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  // Arabe : retire les voyelles (tashkeel) et le tatweel pour comparer / chercher
  const stripArabicMarks = (s) => String(s || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');

  // minuscules, sans accents latins ni voyelles arabes, ponctuation → espace
  function norm(s) {
    return stripArabicMarks(String(s || ''))
      .normalize('NFKD').replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}#]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const tokens = (s) => norm(s).split(' ').filter(Boolean);

  // écriture dominante d'un texte
  function script(s) {
    const t = String(s || '');
    const ar = (t.match(/[\u0600-\u06FF]/g) || []).length;
    const la = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (!ar && !la) return 'other';
    return ar >= la ? 'arabic' : 'latin';
  }

  // Emojis (pictogrammes) d'un texte
  const emojis = (s) => String(s || '').match(/\p{Extended_Pictographic}/gu) || [];

  // Nom de fichier → titre lisible (« قُولْهَا-لِيَّا [usesuno.com].webm » → « قولها ليا »). Noms génériques → ''.
  function cleanFileName(name) {
    let t = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    t = t.replace(/\[[^\]]*\]|\([^)]*(?:\.com|\.ai|suno|udio|final|master|mix\s*\d*)[^)]*\)/gi, ' ');
    t = t.replace(/[_\-.]+/g, ' ');
    t = stripArabicMarks(t).replace(/\s+/g, ' ').trim();
    if (/^(vid|img|mov|dsc|pxl|video|audio|aud|rec|track|piste|clip|screen ?recording|untitled|sans titre|new project)\s*\d*/i.test(t) && !/[\u0600-\u06FF]/.test(t)) {
      const rest = t.replace(/^(vid|img|mov|dsc|pxl|video|audio|aud|rec|track|piste|clip|screen ?recording|untitled|sans titre|new project)/i, '').replace(/[\d\s]+/g, '');
      if (!rest) return '';
    }
    if (/^\d[\d\s]*$/.test(t)) return '';
    return t;
  }

  // limite de concurrence pour des promesses
  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try { out[k] = await fn(items[k], k); } catch (e) { out[k] = undefined; }
      }
    });
    await Promise.all(workers);
    return out;
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  const scoreClass = (s) => (s >= 80 ? 'good' : s >= 55 ? 'mid' : 'bad');

  g.TPF = { esc, clamp, uniq, sleep, num, dur, ts, parseTs, isoDur, ago, vph, median, stripArabicMarks, norm, tokens, script, emojis, cleanFileName, pool, hash, scoreClass };
})(globalThis);
