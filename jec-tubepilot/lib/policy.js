// JEC TubePilot — règles officielles YouTube / Google appliquées aux métadonnées (titre, description, tags, hashtags, chapitres)
(function (g) {
  'use strict';
  const F = g.TPF;

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
    if (chapters[0].t !== 0) errs.push('Le premier chapitre doit commencer à 0:00.');
    if (chapters.length < LIMITS.chaptersMin) errs.push(`Il faut au moins ${LIMITS.chaptersMin} horodatages pour que YouTube crée des chapitres.`);
    for (let i = 1; i < chapters.length; i++) {
      if (chapters[i].t <= chapters[i - 1].t) { errs.push(`Horodatages pas dans l'ordre croissant (${F.dur(chapters[i].t)}).`); break; }
      if (chapters[i].t - chapters[i - 1].t < LIMITS.chapterMinSec) { errs.push(`Chapitre de moins de ${LIMITS.chapterMinSec} s (${F.dur(chapters[i - 1].t)} → ${F.dur(chapters[i].t)}).`); break; }
    }
    const last = chapters[chapters.length - 1];
    if (duration && last.t > duration - LIMITS.chapterMinSec) errs.push(`Le dernier chapitre (${F.dur(last.t)}) dépasse la fin de la vidéo ou dure moins de ${LIMITS.chapterMinSec} s.`);
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

  const chaptersText = (chapters) => chapters.map((c) => `${F.dur(c.t)} ${c.label}`).join('\n');

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
    if (!t.trim()) { out.push(issue('error', 'title', 'empty', 'Titre vide.', REF.settings)); return out; }
    if (t.length > LIMITS.title) out.push(issue('error', 'title', 'long', `Titre trop long : ${t.length}/${LIMITS.title} caractères.`, REF.settings));
    if (/[<>]/.test(t)) out.push(issue('error', 'title', 'chars', 'Les caractères < et > sont refusés par YouTube.', REF.settings));
    if (capsRatio(t) > 0.6) out.push(issue('warn', 'title', 'caps', 'Titre presque tout en MAJUSCULES : YouTube le considère comme racoleur. Gardez 1 ou 2 mots en capitales au plus.', REF.spam));
    if (/[!?]{3,}/.test(t)) out.push(issue('warn', 'title', 'punct', 'Ponctuation répétée (!!!, ???) : à éviter.', REF.spam));
    if (F.emojis(t).length > 3) out.push(issue('warn', 'title', 'emoji', `${F.emojis(t).length} emojis : 1 à 2 suffisent.`));
    if (OFFICIAL.test(t) && !ctx.officialArtist) out.push(issue('warn', 'title', 'official', '« Officiel » seulement si c\'est la chaîne officielle de l\'artiste (sinon métadonnées trompeuses).', REF.spam));
    if (FEAT.test(t)) out.push(issue('info', 'title', 'feat', '« feat. » : créditez uniquement un artiste réellement présent dans la chanson.', REF.spam));
    if (SPAMMY.test(t)) out.push(issue('error', 'title', 'spam', 'Formule interdite (sub4sub, téléchargement gratuit…) : pratique trompeuse.', REF.spam));
    const year = new Date().getFullYear();
    const years = (t.match(/\b20\d{2}\b/g) || []).map(Number);
    if (years.some((y) => y < year && !ctx.allowOldYear)) out.push(issue('info', 'title', 'year', `Année ${years.find((y) => y < year)} dans le titre : est-ce voulu ? (année en cours : ${year}).`));
    const ht = extractHashtags(t);
    if (ht.length > 3) out.push(issue('warn', 'title', 'hashtags', 'Plus de 3 hashtags dans le titre : gardez-les dans la description.', REF.hashtags));
    return out;
  }

  function checkDescription(desc, ctx = {}) {
    const out = [];
    const d = String(desc || '');
    if (d.length > LIMITS.description) out.push(issue('error', 'description', 'long', `Description trop longue : ${d.length}/${LIMITS.description} caractères.`, REF.settings));
    if (/[<>]/.test(d)) out.push(issue('error', 'description', 'chars', 'Les caractères < et > sont refusés par YouTube.', REF.settings));
    if (SPAMMY.test(d)) out.push(issue('error', 'description', 'spam', 'Formule trompeuse (sub4sub, téléchargement gratuit…).', REF.spam));
    if (SHORTENERS.test(d)) out.push(issue('warn', 'description', 'shortener', 'Lien raccourci (bit.ly…) : YouTube préfère les liens complets et transparents.', REF.spam));
    // bourrage : un même mot répété de façon anormale
    const toks = F.tokens(d).filter((w) => w.length > 3 && !w.startsWith('#'));
    if (toks.length > 40) {
      const freq = {};
      toks.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
      const [w, n] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || [];
      if (n > Math.max(8, toks.length * 0.08)) out.push(issue('warn', 'description', 'stuffing', `« ${w} » répété ${n} fois : ressemble à du bourrage de mots-clés.`, REF.spam));
    }
    // liste de mots-clés en vrac (ligne de 15+ virgules)
    if (d.split('\n').some((l) => (l.match(/,/g) || []).length >= 15)) out.push(issue('warn', 'description', 'keyword-list', 'Liste de mots-clés en vrac dans la description : interdit (mettez-les dans les tags).', REF.spam));
    const hashtags = extractHashtags(d);
    if (hashtags.length > LIMITS.hashtagsIgnored) out.push(issue('error', 'hashtags', 'too-many', `${hashtags.length} hashtags : au-delà de ${LIMITS.hashtagsIgnored}, YouTube les ignore TOUS.`, REF.hashtags));
    else if (hashtags.length > LIMITS.hashtagsWarn) out.push(issue('warn', 'hashtags', 'many', `${hashtags.length} hashtags : c'est du sur-marquage. Gardez 3 à 5 hashtags pertinents.`, REF.hashtags));
    else if (d.trim() && hashtags.length === 0) out.push(issue('info', 'hashtags', 'none', 'Aucun hashtag : ajoutez-en 3 à 5 (les 3 premiers s\'affichent au-dessus du titre).', REF.hashtags));
    const chapters = parseChapters(d);
    if (chapters.length) validateChapters(chapters, ctx.duration).forEach((m) => out.push(issue('warn', 'chapters', 'chapters', m, REF.chapters)));
    return out;
  }

  function checkTags(tags) {
    const out = [];
    const len = tagsLength(tags);
    if (len > LIMITS.tags) out.push(issue('error', 'tags', 'long', `Tags trop longs : ${len}/${LIMITS.tags} caractères.`, REF.tags));
    const seen = new Set();
    for (const t of tags || []) {
      const k = F.norm(t);
      if (seen.has(k)) { out.push(issue('info', 'tags', 'dup', `Tag en double : « ${t} ».`)); break; }
      seen.add(k);
    }
    return out;
  }

  function checkAll({ title, description, tags }, ctx = {}) {
    const out = [...checkTitle(title, ctx), ...checkDescription(description, ctx), ...checkTags(tags)];
    if (ctx.aiGenerated) {
      out.push(issue('info', 'general', 'synthetic', 'Musique/voix générée par IA (Suno…) : si la voix ou les images sont réalistes (on pourrait croire à un vrai chanteur) ou imitent une personne réelle, cochez « Contenu modifié ou synthétique » dans Studio.', REF.synthetic));
    }
    if (ctx.isCover) out.push(issue('info', 'general', 'cover', 'Reprise : créditez l\'original (titre, interprète, auteurs). Content ID peut partager ou bloquer les revenus.', REF.copyright));
    return out;
  }

  g.TPPolicy = { LIMITS, REF, tagsLength, cleanTag, fitTags, normalizeHashtag, extractHashtags, parseChapters, validateChapters, buildChapters, chaptersText, sanitizeTitle, sanitizeDescription, capsRatio, checkTitle, checkDescription, checkTags, checkAll };
})(globalThis);
