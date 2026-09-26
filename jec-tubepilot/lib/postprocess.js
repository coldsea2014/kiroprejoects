// JEC TubePilot — assemblage final : titres notés, description avec chapitres valides, tags ≤ 500, hashtags, contrôle du règlement
(function (g) {
  'use strict';
  const F = g.TPF, P = g.TPPolicy, S = g.TPSeo;

  const LABELS = {
    ar: { chapters: '⏱️ التوقيتات', hot: ' — 🔥 أقوى اللحظات', lyrics: '🎤 كلمات الأغنية', intro: 'مقدمة' },
    fr: { chapters: '⏱️ Timeline', hot: ' — 🔥 meilleurs moments', lyrics: '🎤 Paroles', intro: 'Intro' },
    en: { chapters: '⏱️ Timeline', hot: ' — 🔥 best moments', lyrics: '🎤 Lyrics', intro: 'Intro' },
    es: { chapters: '⏱️ Momentos', hot: ' — 🔥 lo mejor', lyrics: '🎤 Letra', intro: 'Intro' }
  };
  const HOT = '🔥';

  const splitList = (s) => String(s || '').split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
  // langue des intitulés de la description : celle de la chanson, sinon la 1re langue de la chaîne
  const langOf = (ctx, analysis) => {
    const song = String(analysis?.language_code || '').slice(0, 2).toLowerCase();
    if (LABELS[song]) return song;
    const first = String(splitList(ctx.profile?.languages || '')[0] || '').split(/\s+/)[0].slice(0, 2).toLowerCase();
    return LABELS[first] ? first : 'fr';
  };

  // Meilleurs moments → marqués 🔥 dans la timeline (fusionnés avec le chapitre le plus proche s'il est à moins de 10 s)
  function mergeHighlights(chapters, highlights, duration) {
    const list = (chapters || []).map((c) => ({ t: Math.round(Number(c.start ?? c.t) || 0), label: String(c.label || c.title || '').trim() })).filter((c) => c.label);
    for (const h of highlights || []) {
      const t = Math.round(Number(h.start));
      const label = String(h.label || '').trim();
      if (!Number.isFinite(t) || t < 0 || !label || (duration && t > duration - P.LIMITS.chapterMinSec)) continue;
      let near = null;
      list.forEach((c) => { if (!near || Math.abs(c.t - t) < Math.abs(near.t - t)) near = c; });
      if (near && Math.abs(near.t - t) < P.LIMITS.chapterMinSec) { if (!near.label.startsWith(HOT)) near.label = `${HOT} ${near.label}`; }
      else list.push({ t, label: `${HOT} ${label}` });
    }
    return list.map((c) => ({ start: c.t, label: c.label }));
  }

  function scoreCtx(ctx, seo, analysis, comp) {
    return {
      keyword: seo?.main_keyword || ctx.keyword || '',
      keywords: (seo?.secondary_keywords || []).slice(0, 8),
      duration: analysis?.duration_seconds || ctx.duration || 0,
      isMusic: /music/.test(analysis?.content_type || '') || /musi|chanson|song|أغان|اغان/i.test(ctx.profile?.niche || ''),
      competitorTitles: (comp?.videos || []).map((v) => v.title),
      officialArtist: !!ctx.profile?.officialArtist,
      aiGenerated: !!ctx.profile?.aiGenerated,
      isCover: !!analysis?.is_cover
    };
  }

  function rankTitles(list, sctx) {
    const seen = new Set();
    const out = [];
    for (const t of list || []) {
      const text = P.sanitizeTitle(typeof t === 'string' ? t : t?.text);
      const k = F.norm(text);
      if (!text || seen.has(k)) continue;
      seen.add(k);
      const sc = S.scoreTitle(text, sctx);
      out.push({ text, hook: (typeof t === 'object' && t.hook_type) || sc.hooks[0] || '', angle: (typeof t === 'object' && t.angle) || '', score: sc.score, parts: sc.parts, issues: sc.issues });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  function assembleDescription({ intro, body, lyrics, chapters, cta, signature, hashtags }, lang) {
    const L = LABELS[lang] || LABELS.fr;
    const join = (b) => [
      String(intro || '').trim(),
      b,
      lyrics ? `${L.lyrics}\n${String(lyrics).trim()}` : '',
      chapters.length ? `${L.chapters}${chapters.some((c) => c.label.startsWith(HOT)) ? L.hot : ''}\n${P.chaptersText(chapters)}` : '',
      String(cta || '').trim(),
      String(signature || '').trim(),
      hashtags.join(' ')
    ].filter(Boolean).join('\n\n');
    const fullBody = String(body || '').trim();
    let d = P.sanitizeDescription(join(fullBody));
    if (join(fullBody).length > P.LIMITS.description) {
      // trop long : on raccourcit le corps en gardant chapitres, appel à l'action et hashtags
      const room = Math.max(200, P.LIMITS.description - join('').length - 10);
      d = P.sanitizeDescription(join(fullBody.slice(0, room).replace(/\s+\S*$/, '') + '…'));
    }
    return d;
  }

  // Fiche finale à partir de l'analyse (écoute) et du JSON SEO de Gemini
  function buildPack({ key, aliases = [], source = {}, ctx = {}, analysis = null, seo = {}, kw = null, comp = null, models = {}, usage = {}, media = null, trends = null, warnings = [] }) {
    const sctx = scoreCtx(ctx, seo, analysis, comp);
    const lang = langOf(ctx, analysis);
    const titles = rankTitles(seo.titles, sctx);
    const abTitles = rankTitles(seo.ab_titles, sctx).slice(0, 3);
    const duration = sctx.duration;
    // sans écoute, des horodatages seraient inventés : aucun chapitre
    const rawChapters = !analysis ? []
      : seo.chapters?.length ? seo.chapters
        : analysis.tracks?.length >= 3 ? analysis.tracks.map((t) => ({ start: t.start, label: t.title }))
          : analysis.timeline || [];
    const withHot = analysis ? mergeHighlights(rawChapters, analysis.highlights, duration) : rawChapters;
    const chapters = !duration || duration >= 30 ? P.buildChapters(withHot, duration, LABELS[lang].intro) : [];
    const hashtags = F.uniq([...(seo.hashtags || []), ...splitList(ctx.profile?.defaultHashtags)].map(P.normalizeHashtag).filter(Boolean)).slice(0, 5);
    const ownSong = !analysis?.is_cover;
    const description = assembleDescription({
      intro: seo.description_intro,
      body: seo.description_body,
      lyrics: ownSong ? seo.lyrics_section : '',
      chapters,
      cta: seo.cta,
      signature: ctx.profile?.signature,
      hashtags
    }, lang);
    const popular = (kw?.items || []).filter((k) => k.popularity >= 45).slice(0, 12).map((k) => k.kw);
    const compTags = (comp?.tags || []).filter((t) => t.n >= 3).slice(0, 8).map((t) => t.tag);
    const tags = P.fitTags([
      sctx.keyword,
      ...(seo.tags || []),
      analysis?.music?.song_title_guess,
      ...(analysis?.music?.genre_search_terms || []).slice(0, 4),
      ...splitList(ctx.profile?.defaultTags),
      ...sctx.keywords,
      ...popular,
      ...compTags
    ]);
    const best = titles[0]?.text || '';
    const score = S.scoreAll({ title: best, description, tags }, sctx);
    const issues = P.checkAll({ title: best, description, tags }, sctx);
    return {
      key,
      aliases,
      createdAt: Date.now(),
      source,
      media,
      ctx: { fileName: ctx.fileName || '', cleanTitle: ctx.cleanTitle || '', duration, isShort: !!ctx.isShort, profileId: ctx.profile?.id || '', profileName: ctx.profile?.name || '', localBpm: ctx.localBpm || null },
      analysis,
      keywords: kw ? { seed: kw.seed, items: (kw.items || []).slice(0, 60), sources: kw.sources || [], locale: kw.locale || null, compared: kw.compared || [] } : null,
      trends: trends ? {
        youtube: trends.youtube ? { region: trends.youtube.region, hashtags: trends.youtube.hashtags.slice(0, 15), tags: trends.youtube.tags.slice(0, 15), words: trends.youtube.words.slice(0, 12) } : null,
        web: trends.web || null
      } : null,
      warnings,
      competition: comp ? { kw: comp.kw, demand: comp.demand, competition: comp.competition, overall: comp.overall, medianViews: comp.medianViews, medianSubs: comp.medianSubs, patterns: comp.patterns, tags: comp.tags, videos: (comp.videos || []).slice(0, 10).map((v) => ({ id: v.id, title: v.title, channelTitle: v.channelTitle, views: v.views, subs: v.subs, ageDays: v.ageDays, vph: v.vph })) } : null,
      seo: {
        mainKeyword: sctx.keyword,
        secondaryKeywords: sctx.keywords,
        keywordStrategy: seo.keyword_strategy || '',
        audienceInsight: seo.audience_insight || '',
        titles,
        abTitles,
        description,
        chapters,
        tags,
        hashtags,
        pinnedComment: seo.pinned_comment || '',
        thumbnail: seo.thumbnail || null,
        short: seo.short || null,
        complianceNotes: seo.compliance_notes || []
      },
      score: { overall: score.score, title: score.title.score, description: score.description.score, tags: score.tags.score },
      issues,
      models,
      usage
    };
  }

  // Recalcule scores et contrôles après une modification à la main dans le panneau
  function rescore(pack, { title, description, tags }) {
    const sctx = { keyword: pack.seo.mainKeyword, keywords: pack.seo.secondaryKeywords, duration: pack.ctx.duration, isMusic: /music/.test(pack.analysis?.content_type || ''), competitorTitles: (pack.competition?.videos || []).map((v) => v.title), officialArtist: false };
    const s = S.scoreAll({ title, description, tags }, sctx);
    return { score: { overall: s.score, title: s.title.score, description: s.description.score, tags: s.tags.score }, detail: s, issues: P.checkAll({ title, description, tags }, { duration: pack.ctx.duration, isCover: !!pack.analysis?.is_cover }) };
  }

  // Réponse collée depuis gemini.google.com (mode abonnement) → { analysis, seo }
  function parseManual(text) {
    let s = String(text || '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1];
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Aucun JSON trouvé : copiez toute la réponse de Gemini (le bloc de code).');
    let obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) {
      try { obj = JSON.parse(s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1')); } catch (e2) { throw new Error('JSON incomplet ou abîmé : demandez à Gemini « renvoie le JSON complet » puis recollez.'); }
    }
    const seo = obj.seo || (obj.titles ? obj : null);
    if (!seo || !Array.isArray(seo.titles)) throw new Error('Ce JSON ne contient pas de titres (clé « seo.titles »).');
    return { analysis: obj.analysis || null, seo };
  }

  g.TPPost = { buildPack, rescore, parseManual, rankTitles, assembleDescription, mergeHighlights, LABELS };
})(globalThis);
