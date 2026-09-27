// TubePilot — règles officielles YouTube / Google appliquées aux métadonnées (titre, description, tags, hashtags, chapitres)
(function (g) {
  'use strict';
  const F = g.TPF;
  const T = (k, v) => (g.TPI18n ? g.TPI18n.t(k, v) : k);

  const LIMITS = {
    title: 100,          // caractères
    description: 5000,   // caractères
    tags: 500,           // total des tags (virgules comprises)
    hashtagsIgnored: 60, // au-delà, YouTube ignore tous les hashtags de la vidéo
    hashtagsWarn: 15,    // sur-marquage (over-tagging)
    hashtagsIdeal: [3, 5],
    chaptersMin: 3,
    chapterMinSec: 10
  };

  const REF = {
    spam: 'https://support.google.com/youtube/answer/2801973',
    hashtags: 'https://support.google.com/youtube/answer/6390658',
    chapters: 'https://support.google.com/youtube/answer/9884579',
    tags: 'https://support.google.com/youtube/answer/146402',
    synthetic: 'https://support.google.com/youtube/answer/14328491',
    thumbnails: 'https://support.google.com/youtube/answer/9229980',
    settings: 'https://support.google.com/youtube/answer/57404',
    copyright: 'https://support.google.com/youtube/answer/2797370'
  };

  const issue = (level, field, code, msg, ref) => ({ level, field, code, msg, ref: ref || '' });

  /* ---------- Tags ---------- */
  // Longueur comptée par YouTube : tags + virgules, et guillemets autour des tags contenant une espace
  function tagsLength(tags) {
    const list = (tags || []).filter(Boolean);
    if (!list.length) return 0;
    return list.reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + (list.length - 1);
  }

  function cleanTag(t) {
    return String(t || '').replace(/[<>#,"]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Dédoublonne et garde l'ordre de priorité dans la limite de 500 caractères
  function fitTags(tags, max = LIMITS.tags) {
    const out = [];
    const seen = new Set();
    for (const raw of tags || []) {
      const t = cleanTag(raw);
      if (!t || t.length > 100) continue;
      const k = F.norm(t);
      if (!k || seen.has(k)) continue;
      if (tagsLength([...out, t]) > max) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }

  /* ---------- Hashtags ---------- */
  function normalizeHashtag(h) {
    const body = String(h || '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]+/gu, '');
    return body ? '#' + body : '';
  }

  function extractHashtags(text) {
    return (String(text || '').match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).map((x) => x.trim());
  }

  /* ---------- Chapitres ---------- */
  const TS_LINE = /^\s*(?:[-•▶►*]\s*)?\(?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\)?\s*(?:[-–—:|]\s*)?(.*)$/;

  function parseChapters(description) {
    const out = [];
    for (const line of String(description || '').split(/\r?\n/)) {
      const m = line.match(TS_LINE);
      if (!m) continue;
      const t = F.parseTs(m[1]);
      if (Number.isFinite(t)) out.push({ t, label: m[2].trim() });
    }
    return out;
  }

  function validateChapters(chapters, duration) {
    const errs = [];
    if (!chapters.length) return errs;
    if (chapters[0].t !== 0) errs.push(T('pol.ch.first'));
    if (chapters.length < LIMITS.chaptersMin) errs.push(T('pol.ch.min', { n: LIMITS.chaptersMin }));
    for (let i = 1; i < chapters.length; i++) {
      if (chapters[i].t <= chapters[i - 1].t) { errs.push(T('pol.ch.order', { t: F.ts(chapters[i].t) })); break; }
      if (chapters[i].t - chapters[i - 1].t < LIMITS.chapterMinSec) { errs.push(T('pol.ch.short', { s: LIMITS.chapterMinSec, a: F.ts(chapters[i - 1].t), b: F.ts(chapters[i].t) })); break; }
    }
    const last = chapters[chapters.length - 1];
    if (duration && last.t > duration - LIMITS.chapterMinSec) errs.push(T('pol.ch.last', { t: F.ts(last.t), s: LIMITS.chapterMinSec }));
    return errs;
  }

  // Timeline brute de Gemini → chapitres valides (0:00 d'abord, ≥ 10 s chacun, ≥ 3) ou [] si impossible
  function buildChapters(timeline, duration, introLabel = 'Intro') {
    let list = (timeline || [])
      .map((c) => ({ t: Math.max(0, Math.round(Number(c.t ?? c.start ?? c.start_seconds) || 0)), label: String(c.label || c.title || '').replace(/[<>\n]/g, ' ').trim() }))
      .filter((c) => c.label && Number.isFinite(c.t))
      .sort((a, b) => a.t - b.t);
    if (duration) list = list.filter((c) => c.t <= duration - LIMITS.chapterMinSec);
    if (!list.length) return [];
    // la vidéo commence avant le 1er repère : intro à 0:00 ; sinon le 1er repère est ramené à 0:00
    if (list[0].t >= LIMITS.chapterMinSec) list.unshift({ t: 0, label: introLabel });
    else list[0] = { ...list[0], t: 0 };
    const out = [];
    for (const c of list) {
      if (out.length && c.t - out[out.length - 1].t < LIMITS.chapterMinSec) continue;
      out.push(c);
    }
    return out.length >= LIMITS.chaptersMin ? out.slice(0, 60) : [];
  }

  const chaptersText = (chapters) => chapters.map((c) => `${F.ts(c.t)} ${c.label}`).join('\n');

  /* ---------- Nettoyage ---------- */
  function sanitizeTitle(t) {
    let s = String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length > LIMITS.title) {
      s = s.slice(0, LIMITS.title);
      const cut = s.lastIndexOf(' ');
      if (cut > 60) s = s.slice(0, cut);
      s = s.replace(/[\s|\-–—,:]+$/, '');
    }
    return s;
  }

  function sanitizeDescription(d) {
    let s = String(d || '').replace(/[<>]/g, '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
    if (s.length > LIMITS.description) s = s.slice(0, LIMITS.description);
    return s;
  }

  /* ---------- Contrôles ---------- */
  const OFFICIAL = /\b(official|officiel(?:le)?|clip officiel|video officielle|vid[ée]o officielle)\b|الرسمي|رسمي|فيديو كليب رسمي/i;
  const SPAMMY = /\b(sub\s*4\s*sub|sub\s*for\s*sub|free\s+download|t[ée]l[ée]chargement\s+gratuit|100\s*%\s*(?:free|gratuit)|click\s*here|cliquez\s*ici)\b/i;
  const FEAT = /(^|\s)(ft\.|feat\.?|featuring)\s/i;
  const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|cutt\.ly|shorturl\.at|rb\.gy)\//i;

  function capsRatio(s) {
    const letters = String(s || '').match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [];
    if (letters.length < 12) return 0;
    const up = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    return up / letters.length;
  }

  function checkTitle(title, ctx = {}) {
    const out = [];
    const t = String(title || '');
    if (!t.trim()) { out.push(issue('error', 'title', 'empty', T('pol.title.empty'), REF.settings)); return out; }
    if (t.length > LIMITS.title) out.push(issue('error', 'title', 'long', T('pol.title.long', { n: t.length, max: LIMITS.title }), REF.settings));
    if (/[<>]/.test(t)) out.push(issue('error', 'title', 'chars', T('pol.chars'), REF.settings));
    if (capsRatio(t) > 0.6) out.push(issue('warn', 'title', 'caps', T('pol.title.caps'), REF.spam));
    if (/[!?]{3,}/.test(t)) out.push(issue('warn', 'title', 'punct', T('pol.title.punct'), REF.spam));
    if (F.emojis(t).length > 3) out.push(issue('warn', 'title', 'emoji', T('pol.title.emoji', { n: F.emojis(t).length })));
    if (OFFICIAL.test(t) && !ctx.officialArtist) out.push(issue('warn', 'title', 'official', T('pol.title.official'), REF.spam));
    if (FEAT.test(t)) out.push(issue('info', 'title', 'feat', T('pol.title.feat'), REF.spam));
    if (SPAMMY.test(t)) out.push(issue('error', 'title', 'spam', T('pol.spam'), REF.spam));
    const year = new Date().getFullYear();
    const years = (t.match(/\b20\d{2}\b/g) || []).map(Number);
    if (years.some((y) => y < year && !ctx.allowOldYear)) out.push(issue('info', 'title', 'year', T('pol.title.year', { y: years.find((y) => y < year), cur: year })));
    const ht = extractHashtags(t);
    if (ht.length > 3) out.push(issue('warn', 'title', 'hashtags', T('pol.title.hashtags'), REF.hashtags));
    return out;
  }

  function checkDescription(desc, ctx = {}) {
    const out = [];
    const d = String(desc || '');
    if (d.length > LIMITS.description) out.push(issue('error', 'description', 'long', T('pol.desc.long', { n: d.length, max: LIMITS.description }), REF.settings));
    if (/[<>]/.test(d)) out.push(issue('error', 'description', 'chars', T('pol.chars'), REF.settings));
    if (SPAMMY.test(d)) out.push(issue('error', 'description', 'spam', T('pol.spam'), REF.spam));
    if (SHORTENERS.test(d)) out.push(issue('warn', 'description', 'shortener', T('pol.desc.shortener'), REF.spam));
    // bourrage : un même mot répété de façon anormale
    const toks = F.tokens(d).filter((w) => w.length > 3 && !w.startsWith('#'));
    if (toks.length > 40) {
      const freq = {};
      toks.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
      const [w, n] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || [];
      if (n > Math.max(8, toks.length * 0.08)) out.push(issue('warn', 'description', 'stuffing', T('pol.desc.stuffing', { w, n }), REF.spam));
    }
    // liste de mots-clés en vrac (ligne de 15+ virgules)
    if (d.split('\n').some((l) => (l.match(/,/g) || []).length >= 15)) out.push(issue('warn', 'description', 'keyword-list', T('pol.desc.list'), REF.spam));
    const hashtags = extractHashtags(d);
    if (hashtags.length > LIMITS.hashtagsIgnored) out.push(issue('error', 'hashtags', 'too-many', T('pol.ht.tooMany', { n: hashtags.length, max: LIMITS.hashtagsIgnored }), REF.hashtags));
    else if (hashtags.length > LIMITS.hashtagsWarn) out.push(issue('warn', 'hashtags', 'many', T('pol.ht.many', { n: hashtags.length }), REF.hashtags));
    else if (d.trim() && hashtags.length === 0) out.push(issue('info', 'hashtags', 'none', T('pol.ht.none'), REF.hashtags));
    const chapters = parseChapters(d);
    if (chapters.length) validateChapters(chapters, ctx.duration).forEach((m) => out.push(issue('warn', 'chapters', 'chapters', m, REF.chapters)));
    return out;
  }

  function checkTags(tags) {
    const out = [];
    const len = tagsLength(tags);
    if (len > LIMITS.tags) out.push(issue('error', 'tags', 'long', T('pol.tags.long', { n: len, max: LIMITS.tags }), REF.tags));
    const seen = new Set();
    for (const t of tags || []) {
      const k = F.norm(t);
      if (seen.has(k)) { out.push(issue('info', 'tags', 'dup', T('pol.tags.dup', { tag: t }))); break; }
      seen.add(k);
    }
    return out;
  }

  function checkAll({ title, description, tags }, ctx = {}) {
    const out = [...checkTitle(title, ctx), ...checkDescription(description, ctx), ...checkTags(tags)];
    if (ctx.aiGenerated) {
      out.push(issue('info', 'general', 'synthetic', T('pol.synthetic'), REF.synthetic));
    }
    if (ctx.isCover) out.push(issue('info', 'general', 'cover', T('pol.cover'), REF.copyright));
    return out;
  }

  g.TPPolicy = { LIMITS, REF, tagsLength, cleanTag, fitTags, normalizeHashtag, extractHashtags, parseChapters, validateChapters, buildChapters, chaptersText, sanitizeTitle, sanitizeDescription, capsRatio, checkTitle, checkDescription, checkTags, checkAll };
})(globalThis);
