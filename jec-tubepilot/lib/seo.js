// JEC TubePilot — scores SEO (titre, description, tags), détection des accroches (hooks) et motifs des titres concurrents
(function (g) {
  'use strict';
  const F = g.TPF, P = g.TPPolicy;

  const STOP = new Set(('le la les un une des de du d l et ou en au aux a à pour par sur dans avec sans ce cet cette ces mon ma mes ton ta tes son sa ses qui que quoi est sont c j je tu il elle on nous vous ils elles ne pas plus tres très ' +
    'the a an and or of to in on for with by at from is are be this that these those my your his her its our their it you i we they not ' +
    'el la los las un una de del y o en con por para que es se su sus lo ' +
    'في من على الى إلى عن مع و او أو ما لا هذا هذه ذلك التي الذي كل هو هي انا أنا انت أنت ديال dyal f fi l').split(/\s+/).map((w) => F.norm(w)).filter(Boolean));

  const LEX = {
    curiosity: /\b(secret|secrets|vérité|verite|truth|nobody|personne ne|why|pourquoi|comment|how|what happens|ce qui|la raison|the reason|revealed|révèle|revele|découvr|discover|hidden|caché|cache|finally|enfin|never|jamais|until|jusqu)|لماذا|علاش|كيفاش|سر|أسرار|اسرار|الحقيقة|حقيقة|لن تصدق|شوف|غادي|ماعمرك|ما عمرك|اكتشف/i,
    emotion: /\b(love|amour|heart|coeur|cœur|cry|pleur|sad|triste|broken|brisé|brise|miss|manque|tears|larmes|happy|joie|feel|ressens|goosebumps|frissons|beautiful|magnifique|emotional|émouvant|nostalg|romantic|romantique)|حب|قلب|دموع|حزين|حزينة|فراق|شوق|غرام|عشق|نبكي|بكيت|توحشتك|الحنين|فرحة|عرس|زين|ضحك|رومانسي/i,
    power: /\b(best|meilleur|meilleure|top|ultimate|ultime|incroyable|amazing|insane|fou|folle|viral|énorme|enorme|legend|légend|masterpiece|chef-d|must|incontournable|exclusive|exclusif|exclusive)|أفضل|اروع|أروع|أجمل|اجمل|حصري|حصريا|نار|خطير|خطيرة|جديد|الجديد|ترند/i,
    direct: /\b(you|your|toi|tu |ton |ta |vous|votre|te )|(^|\s)(ل?للي|يا |ليك|ليكي|عليك|انت |أنت |نتا |نتي )/i,
    contrast: /\b(vs|versus|but|mais|instead|au lieu|before|avant|after|après|apres)\b|ولكن|لكن|مقابل|قبل و بعد/i,
    share: /\b(tag|send this|envoie|partage|share)\b|صيفطها|ارسلها|أرسلها|شاركها|منشن/i,
    moment: /\b(night|nuit|drive|road ?trip|study|work|sleep|dormir|relax|chill|wedding|mariage|party|soirée|soiree|gym|workout)\b|ليل|سهرة|عرس|سفر|طريق|نوم|دراسة|رياضة/i
  };

  // accroches présentes dans un titre
  function detectHooks(title) {
    const t = String(title || '');
    const hooks = [];
    if (/[?؟]/.test(t)) hooks.push('question');
    if (/\b\d+\b/.test(t.replace(/\b20\d{2}\b/g, ''))) hooks.push('nombre');
    if (LEX.curiosity.test(t)) hooks.push('curiosité');
    if (LEX.emotion.test(t) || F.emojis(t).some((e) => /[❤💔🥺😢😭💌😍🥹🌙✨🔥💃🎧]/u.test(e))) hooks.push('émotion');
    if (LEX.power.test(t)) hooks.push('superlatif');
    if (LEX.direct.test(t)) hooks.push('adresse directe');
    if (LEX.contrast.test(t)) hooks.push('contraste');
    if (LEX.share.test(t)) hooks.push('partage');
    if (LEX.moment.test(t)) hooks.push("moment d'écoute");
    return hooks;
  }

  // traits de forme d'un titre (pour l'analyse des concurrents)
  function titleTraits(title) {
    const t = String(title || '');
    return {
      length: t.length,
      emoji: F.emojis(t).length > 0,
      caps: (t.match(/\b[A-ZÀ-Ý]{3,}\b/g) || []).length > 0,
      brackets: /[\[(【].*[\])】]/.test(t),
      pipe: /[|•–—]/.test(t),
      year: /\b20\d{2}\b/.test(t),
      question: /[?؟]/.test(t),
      hashtag: /#[\p{L}\p{N}_]+/u.test(t),
      hooks: detectHooks(t)
    };
  }

  function similarity(a, b) {
    const A = new Set(F.tokens(a).filter((w) => !STOP.has(w)));
    const B = new Set(F.tokens(b).filter((w) => !STOP.has(w)));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((w) => { if (B.has(w)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  // Position du mot-clé : 1 = phrase exacte, 0.7 = tous les mots, sinon part des mots
  function keywordMatch(text, kw) {
    const T = F.norm(text), K = F.norm(kw);
    if (!K) return { match: 0, index: -1 };
    const idx = T.indexOf(K);
    if (idx >= 0) return { match: 1, index: idx, rel: T.length ? idx / T.length : 0 };
    const kt = K.split(' ').filter((w) => !STOP.has(w));
    if (!kt.length) return { match: 0, index: -1 };
    const tt = new Set(T.split(' '));
    const hit = kt.filter((w) => tt.has(w)).length;
    if (hit === kt.length) return { match: 0.7, index: T.indexOf(kt[0]), rel: T.length ? T.indexOf(kt[0]) / T.length : 0 };
    return { match: (hit / kt.length) * 0.4, index: -1 };
  }

  // Additionne des critères { pts, max } et ramène sur 100 (les critères sans objet sont ignorés)
  function total(parts) {
    const used = parts.filter((p) => p.max > 0);
    const max = used.reduce((n, p) => n + p.max, 0);
    const pts = used.reduce((n, p) => n + Math.max(0, Math.min(p.max, p.pts)), 0);
    return max ? Math.round((pts / max) * 100) : 0;
  }

  /* ---------- Titre ---------- */
  function scoreTitle(title, ctx = {}) {
    const t = String(title || '').trim();
    const parts = [];
    const len = t.length;
    parts.push({ key: 'length', label: 'Longueur', max: 15, pts: len >= 30 && len <= 70 ? 15 : len >= 20 && len <= 85 ? 9 : len > 0 && len <= 100 ? 4 : 0, tip: `${len} car. (idéal 30-70 : le titre n'est pas coupé dans les résultats).` });
    if (ctx.keyword) {
      const m = keywordMatch(t, ctx.keyword);
      parts.push({ key: 'keyword', label: 'Mot-clé principal', max: 25, pts: Math.round(25 * m.match), tip: m.match >= 1 ? `« ${ctx.keyword} » présent.` : m.match > 0 ? `« ${ctx.keyword} » partiellement présent.` : `Ajoutez « ${ctx.keyword} ».` });
      parts.push({ key: 'early', label: 'Mot-clé au début', max: 10, pts: m.match >= 0.7 && m.rel <= 0.3 ? 10 : m.match >= 0.7 ? 5 : 0, tip: 'Le mot-clé au début du titre pèse plus.' });
    }
    const hooks = detectHooks(t);
    parts.push({ key: 'hook', label: 'Accroche', max: 20, pts: Math.min(20, hooks.length * 8), tip: hooks.length ? `Accroches : ${hooks.join(', ')}.` : 'Ajoutez une accroche (émotion, curiosité, question, adresse directe…).' });
    const em = F.emojis(t).length;
    parts.push({ key: 'emoji', label: 'Emoji', max: 5, pts: em >= 1 && em <= 2 ? 5 : em === 0 ? 2 : em === 3 ? 2 : 0, tip: '1 à 2 emojis d\'émotion attirent l\'œil sans faire racoleur.' });
    let read = 15;
    if (P.capsRatio(t) > 0.6) read -= 10;
    if ((t.match(/\b[A-ZÀ-Ý]{3,}\b/g) || []).length > 2) read -= 4;
    if (/[!?]{3,}/.test(t)) read -= 5;
    if (/[<>]/.test(t) || len > 100) read -= 8;
    parts.push({ key: 'read', label: 'Lisibilité', max: 15, pts: read, tip: 'Pas de titre en majuscules ni de ponctuation répétée.' });
    if (ctx.competitorTitles && ctx.competitorTitles.length) {
      const sim = Math.max(0, ...ctx.competitorTitles.map((c) => similarity(t, c)));
      parts.push({ key: 'unique', label: 'Originalité', max: 10, pts: sim < 0.5 ? 10 : sim < 0.7 ? 5 : 0, tip: sim >= 0.5 ? 'Trop proche d\'un titre concurrent.' : 'Se distingue des titres concurrents.' });
    }
    const policy = P.checkTitle(t, ctx).filter((i) => i.level !== 'info');
    let score = total(parts);
    if (policy.some((i) => i.level === 'error')) score = Math.min(score, 40);
    return { score, parts, hooks, issues: policy };
  }

  /* ---------- Description ---------- */
  function scoreDescription(desc, ctx = {}) {
    const d = String(desc || '');
    const parts = [];
    const words = F.tokens(d).length;
    const minW = ctx.isMusic ? 80 : 150;
    parts.push({ key: 'length', label: 'Longueur', max: 15, pts: words >= minW ? 15 : words >= minW / 2 ? 9 : words > 10 ? 4 : 0, tip: `${words} mots (visez ${minW}+ : YouTube comprend mieux le sujet).` });
    if (ctx.keyword) {
      const head = d.slice(0, 160);
      const m = keywordMatch(head, ctx.keyword);
      parts.push({ key: 'kwTop', label: 'Mot-clé en 1re ligne', max: 20, pts: Math.round(20 * m.match), tip: 'Les 2 premières lignes s\'affichent dans les résultats : le mot-clé doit y être.' });
    }
    if (ctx.keywords && ctx.keywords.length) {
      const found = ctx.keywords.filter((k) => keywordMatch(d, k).match >= 0.7).length;
      parts.push({ key: 'kwCover', label: 'Mots-clés secondaires', max: 15, pts: Math.round(15 * Math.min(1, found / Math.min(5, ctx.keywords.length))), tip: `${found}/${ctx.keywords.length} mots-clés présents naturellement.` });
    }
    const chapters = P.parseChapters(d);
    if ((ctx.duration || 0) >= 120) {
      const errs = chapters.length ? P.validateChapters(chapters, ctx.duration) : ['absents'];
      parts.push({ key: 'chapters', label: 'Chapitres (timeline)', max: 15, pts: !chapters.length ? 0 : errs.length ? 5 : 15, tip: !chapters.length ? 'Ajoutez des horodatages (0:00 …) : YouTube crée des chapitres et des « moments clés » dans Google.' : errs[0] || `${chapters.length} chapitres valides.` });
    }
    const ht = P.extractHashtags(d).length;
    parts.push({ key: 'hashtags', label: 'Hashtags', max: 10, pts: ht >= 3 && ht <= 5 ? 10 : ht >= 1 && ht <= 15 ? 6 : 0, tip: `${ht} hashtag(s) (idéal 3-5).` });
    parts.push({ key: 'cta', label: 'Appel à l\'action', max: 10, pts: /abonn|subscri|اشترك|أشترك|like|j'aime|commente|comment|partage|share|شارك|علق/i.test(d) ? 10 : 0, tip: 'Invitez à s\'abonner, commenter ou partager.' });
    parts.push({ key: 'links', label: 'Liens / réseaux', max: 5, pts: /https?:\/\//.test(d) ? 5 : 0, tip: 'Liens vers vos réseaux, playlist ou autres vidéos.' });
    const policy = P.checkDescription(d, ctx).filter((i) => i.level !== 'info');
    let score = total(parts);
    if (policy.some((i) => i.level === 'error')) score = Math.min(score, 40);
    else if (policy.some((i) => i.code === 'stuffing' || i.code === 'keyword-list')) score = Math.min(score, 60);
    return { score, parts, issues: policy };
  }

  /* ---------- Tags ---------- */
  function scoreTags(tags, ctx = {}) {
    const list = (tags || []).filter(Boolean);
    const parts = [];
    const len = P.tagsLength(list);
    parts.push({ key: 'fill', label: 'Remplissage', max: 30, pts: len >= 300 && len <= 500 ? 30 : len >= 150 && len <= 500 ? 18 : len > 0 && len <= 500 ? 8 : 0, tip: `${len}/500 caractères (visez 300-500).` });
    parts.push({ key: 'count', label: 'Nombre', max: 15, pts: list.length >= 8 && list.length <= 35 ? 15 : list.length >= 4 ? 8 : list.length ? 3 : 0, tip: `${list.length} tags.` });
    if (ctx.keyword) {
      const first = list.slice(0, 3).some((t) => keywordMatch(t, ctx.keyword).match >= 0.7);
      const any = list.some((t) => keywordMatch(t, ctx.keyword).match >= 0.7);
      parts.push({ key: 'kw', label: 'Mot-clé en premier', max: 25, pts: first ? 25 : any ? 12 : 0, tip: 'Le mot-clé principal doit être parmi les premiers tags.' });
    }
    const multi = list.filter((t) => t.trim().includes(' ')).length;
    parts.push({ key: 'mix', label: 'Larges + longue traîne', max: 15, pts: list.length && multi > 0 && multi < list.length ? 15 : list.length ? 6 : 0, tip: 'Mélangez tags larges (1 mot) et expressions précises (3-5 mots).' });
    if (ctx.title) {
      const tt = new Set(F.tokens(ctx.title).filter((w) => w.length > 2 && !STOP.has(w)));
      const hit = [...tt].filter((w) => list.some((x) => F.norm(x).split(' ').includes(w))).length;
      parts.push({ key: 'title', label: 'Cohérence avec le titre', max: 15, pts: tt.size ? Math.round(15 * Math.min(1, hit / Math.min(3, tt.size))) : 0, tip: 'Reprenez les mots importants du titre dans les tags.' });
    }
    const policy = P.checkTags(list).filter((i) => i.level !== 'info');
    let score = total(parts);
    if (policy.some((i) => i.level === 'error')) score = Math.min(score, 40);
    return { score, parts, issues: policy };
  }

  // Score global d'optimisation (façon « Optimize score »)
  function scoreAll({ title, description, tags }, ctx = {}) {
    const st = scoreTitle(title, ctx), sd = scoreDescription(description, ctx), sg = scoreTags(tags, { ...ctx, title });
    const score = Math.round(st.score * 0.4 + sd.score * 0.35 + sg.score * 0.25);
    return { score, title: st, description: sd, tags: sg };
  }

  // Mots et expressions qui reviennent dans une liste de titres
  function ngrams(titles, { n = 2, top = 15 } = {}) {
    const freq = new Map();
    for (const t of titles) {
      const w = F.tokens(t).filter((x) => x.length > 1 && !/^\d+$/.test(x));
      const seen = new Set();
      for (let size = 1; size <= n; size++) {
        for (let i = 0; i + size <= w.length; i++) {
          const gram = w.slice(i, i + size);
          if (gram.every((x) => STOP.has(x)) || STOP.has(gram[0]) || STOP.has(gram[gram.length - 1])) continue;
          const k = gram.join(' ');
          if (seen.has(k)) continue;
          seen.add(k);
          freq.set(k, (freq.get(k) || 0) + 1);
        }
      }
    }
    return [...freq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, top).map(([k, c]) => ({ k, c }));
  }

  // Motifs des titres concurrents : fréquence des accroches et des traits de forme
  function titlePatterns(titles) {
    const n = titles.length || 1;
    const count = { emoji: 0, caps: 0, brackets: 0, pipe: 0, year: 0, question: 0, hashtag: 0 };
    const hooks = {};
    let len = 0;
    titles.forEach((t) => {
      const tr = titleTraits(t);
      len += tr.length;
      Object.keys(count).forEach((k) => { if (tr[k]) count[k]++; });
      tr.hooks.forEach((h) => { hooks[h] = (hooks[h] || 0) + 1; });
    });
    const pct = (x) => Math.round((x / n) * 100);
    return {
      avgLength: Math.round(len / n),
      traits: Object.fromEntries(Object.entries(count).map(([k, v]) => [k, pct(v)])),
      hooks: Object.entries(hooks).map(([k, v]) => ({ k, pct: pct(v) })).sort((a, b) => b.pct - a.pct),
      words: ngrams(titles)
    };
  }

  g.TPSeo = { STOP, detectHooks, titleTraits, similarity, keywordMatch, scoreTitle, scoreDescription, scoreTags, scoreAll, ngrams, titlePatterns };
})(globalThis);
