// JEC TubePilot — consignes et schémas JSON envoyés à Gemini (analyse audio/vidéo, pack SEO, accroches concurrentes)
import './format.js';
import './policy.js';

const F = globalThis.TPF, P = globalThis.TPPolicy;

/* ---------- Schémas (sous-ensemble OpenAPI de l'API Gemini) ---------- */
const S = (type, extra = {}) => ({ type, ...extra });
const STR = (description) => S('STRING', description ? { description } : {});
const NUM = (description) => S('NUMBER', description ? { description } : {});
const INT = (description) => S('INTEGER', description ? { description } : {});
const BOOL = (description) => S('BOOLEAN', description ? { description } : {});
const ARR = (items, description) => S('ARRAY', { items, ...(description ? { description } : {}) });
const OBJ = (properties, required = Object.keys(properties)) => S('OBJECT', { properties, required, propertyOrdering: Object.keys(properties) });

export const ANALYSIS_SCHEMA = OBJ({
  content_type: S('STRING', { enum: ['music', 'music_compilation', 'talk', 'tutorial', 'vlog', 'gaming', 'other'] }),
  summary: STR('2-3 phrases en français : ce que contient réellement la vidéo'),
  language: STR('langue et dialecte entendus, en français (ex. « Arabe — dialecte koweïtien »)'),
  language_code: STR('code ISO 639-1 de la langue principale'),
  dialect: STR('dialecte précis (ex. saoudien najdi, koweïtien, irakien, yéménite, darija marocaine, égyptien) ou vide'),
  language_evidence: STR('mots entendus qui prouvent la langue / le dialecte'),
  target_countries: ARR(STR(), 'codes pays ISO 3166 (2 lettres) du public principal de CE style, du plus important au moins important (ex. ["SA","KW","AE"])'),
  search_language: STR('code langue (2 lettres) dans lequel ce public tape ses recherches YouTube'),
  is_cover: BOOL('true seulement si c\'est une reprise d\'une chanson existante que tu reconnais avec certitude'),
  cover_original: STR('« titre — interprète original » si reprise certaine, sinon vide'),
  music: OBJ({
    primary_genre: STR('style musical principal précis (ex. khaliji samri, sheilat, rap irakien, drill, chaabi marocain, sana\'ani yéménite, RnB, jazz swing)'),
    subgenres: ARR(STR()),
    fusion: STR('fusion nommée précisément (ex. « khaliji × trap », « jazz × chaabi ») ou vide'),
    regional_style: STR('région du STYLE d\'après les preuves musicales (ex. Golfe, Irak, Yémen, Maroc, international)'),
    genre_confidence: NUM('0 à 1'),
    genre_evidence: STR('preuves entendues : rythme, percussions, instruments, gamme, voix, dialecte'),
    rhythm_candidates: ARR(OBJ({ name: STR('style / rythme candidat'), confidence: NUM('0 à 1'), evidence: STR('ce qui l\'appuie ou le contredit') }), '2 à 4 candidats examinés, du plus probable au moins probable'),
    bpm: NUM('tempo compté sur plusieurs mesures (battements par minute)'),
    time_signature: STR('ex. 4/4, 6/8, 12/8, 9/8'),
    pulse: STR('binaire, ternaire, swing, aksak (irrégulier) ou demi-tempo'),
    rhythm_pattern: STR('cycle rythmique nommé (ex. samri, khabiti, adani, choubi, maqsum, saïdi, 6/8 chaabi, dembow, boom bap, trap, drill, swing)'),
    percussion: ARR(STR(), 'percussions entendues (darbouka, riq, tabl, mirwas, bendir, qraqeb, claquements de mains, 808, batterie…)'),
    key: STR('tonalité (ex. La mineur) si audible'),
    scale_or_maqam: STR('gamme ou maqam (ex. Bayati, Hijaz, Saba, Rast, Nahawand, Kurd, Sikah, Ajam, pentatonique, blues)'),
    mood: ARR(STR()),
    energy: INT('1 (calme) à 10 (très énergique)'),
    instruments: ARR(STR()),
    vocals: STR('type de voix (homme, femme, duo, chœur, instrumental), technique (mawwal, mélismes, flow rap), effets (autotune…)'),
    production: STR('qualité / style de production'),
    hook_line: STR('la phrase chantée qui se répète le plus (refrain), dans sa langue et son écriture d\'origine'),
    hook_start: NUM('seconde où le refrain commence la première fois'),
    song_title_guess: STR('titre le plus probable de la chanson (souvent la phrase du refrain)'),
    lyrics_theme: STR('thème des paroles en français'),
    lyrics: STR('transcription des paroles si demandée, sinon vide'),
    listening_moments: ARR(STR(), 'moments d\'écoute (nuit, route, mariage, jalsa, sport…)'),
    genre_search_terms: ARR(STR(), 'comment CE public nomme ce style dans la recherche YouTube, écriture d\'origine + latine (ex. « اغاني خليجية », « شيلات », « راب عراقي », « iraqi rap », « طرب يمني »)'),
    similar_styles: ARR(STR(), 'styles proches (jamais des noms d\'artistes)')
  }, ['primary_genre', 'rhythm_candidates', 'mood', 'energy', 'instruments', 'vocals', 'hook_line', 'genre_search_terms']),
  timeline: ARR(OBJ({ start: NUM('secondes'), end: NUM('secondes'), label: STR('libellé court dans la langue de la chanson'), kind: STR('intro, couplet, pré-refrain, refrain, pont, drop, solo, mawwal, outro, sujet, piste…') }, ['start', 'label', 'kind']), 'structure horodatée de TOUTE la vidéo'),
  highlights: ARR(OBJ({ start: NUM('secondes'), end: NUM('secondes'), label: STR('libellé court et attirant, langue de la chanson'), kind: STR('refrain, drop, climax, solo, changement de beat, montée vocale, moment émotionnel, danse'), why: STR('pourquoi c\'est un des meilleurs moments (français)') }, ['start', 'label', 'kind', 'why']), '2 à 5 MEILLEURS moments de la vidéo'),
  tracks: ARR(OBJ({ start: NUM(), title: STR() }), 'pour une compilation / mix : début de chaque morceau'),
  best_short: OBJ({ start: NUM(), end: NUM(), reason: STR() }),
  thumbnail_moment: NUM('seconde de l\'image la plus forte pour une miniature'),
  visual: OBJ({ description: STR(), colors: ARR(STR()), on_screen_text: STR(), people: STR('personnes visibles, sans les identifier') }, ['description']),
  audience: STR('public visé et ce qu\'il ressent (français)'),
  search_queries: ARR(STR(), '10 à 15 recherches que ce public tape vraiment sur YouTube pour trouver CETTE chanson, dans son dialecte + écriture latine si utile'),
  topics: ARR(STR()),
  duration_seconds: NUM(),
  confidence: NUM('0 à 1 : confiance globale de l\'analyse'),
  uncertain: ARR(STR(), 'points incertains (français)')
}, ['content_type', 'summary', 'language', 'language_code', 'target_countries', 'music', 'timeline', 'highlights', 'search_queries', 'confidence']);

export const SEO_SCHEMA = OBJ({
  main_keyword: STR('mot-clé principal : la recherche réelle la plus demandée ET pertinente'),
  secondary_keywords: ARR(STR(), '5 à 10 recherches réelles secondaires'),
  keyword_strategy: STR('en 1-2 phrases (français) : pourquoi ces mots-clés, pays et langue visés'),
  audience_insight: STR('psychologie du public en 1-2 phrases (français)'),
  titles: ARR(OBJ({ text: STR(), hook_type: STR('curiosité, émotion, adresse directe, partage, contraste, moment d\'écoute, question, mot-clé pur…'), angle: STR('pourquoi ce titre marchera (français, court)') }, ['text', 'hook_type'])),
  ab_titles: ARR(STR(), '3 titres très différents pour « Tester et comparer »'),
  description_intro: STR('2 premières lignes : accroche + mot-clé principal naturel'),
  description_body: STR('corps de la description (sans chapitres ni hashtags)'),
  lyrics_section: STR('extrait du refrain (paroles de la chaîne uniquement) ou vide'),
  cta: STR('appel à l\'action : abonnement, commentaire, partage'),
  chapters: ARR(OBJ({ start: NUM('secondes'), label: STR() }), 'chapitres dans la langue de la vidéo'),
  tags: ARR(STR(), '25 à 40 tags classés par importance'),
  hashtags: ARR(STR(), '3 à 5 hashtags : titre de la chanson, style, 1-2 tendances pertinentes'),
  pinned_comment: STR('question qui fait commenter + renvoi au meilleur moment (horodatage mm:ss)'),
  thumbnail: OBJ({ texts: ARR(STR(), '3 textes de miniature de 2 à 4 mots'), concept: STR(), prompt: STR('prompt d\'image IA (anglais), sans visage de célébrité ni logo') }),
  short: OBJ({ title: STR(), description: STR() }),
  compliance_notes: ARR(STR(), 'points de règlement YouTube à vérifier (français)'),
  trends_found: OBJ({ keywords: ARR(STR()), hashtags: ARR(STR()), notes: STR() }, [])
}, ['main_keyword', 'titles', 'ab_titles', 'description_intro', 'description_body', 'cta', 'tags', 'hashtags', 'pinned_comment', 'thumbnail']);

export const HOOKS_SCHEMA = OBJ({
  formulas: ARR(OBJ({ name: STR(), template: STR(), example: STR(), why: STR() }, ['name', 'template', 'why'])),
  power_words: ARR(STR()),
  emoji_usage: STR(),
  ideal_length: STR(),
  recommendations: ARR(STR()),
  title_ideas: ARR(OBJ({ text: STR(), hook_type: STR() }, ['text', 'hook_type']))
});

export const TRENDS_SCHEMA = OBJ({
  keywords: ARR(STR(), 'recherches / expressions en hausse en ce moment pour ce style et ces pays'),
  hashtags: ARR(STR(), 'hashtags qui circulent en ce moment (YouTube, TikTok, Instagram)'),
  title_patterns: ARR(STR(), 'formules de titres qui marchent en ce moment'),
  notes: STR('résumé en français')
});

/* ---------- Guide des styles et rythmes du monde ---------- */
export const WORLD_MUSIC_GUIDE = `GUIDE DES STYLES ET RYTHMES DU MONDE — compare avec ce que tu ENTENDS ; la chaîne publie TOUS les styles, ne déduis jamais le style du nom de la chaîne ni du profil :
• Golfe / khaliji (Arabie saoudite, Koweït, Émirats, Qatar, Bahreïn, Oman) : samri (lent, ternaire, claquements de mains en groupe), khabiti, adani (chaloupé, origine yéménite), bandari (rapide, 6/8, influence iranienne), liwa ; percussions mirwas (petit tambour à 2 peaux), tabl, mains ; oud, qanun, violons ; dialecte « وش », « ابي », « شلونك ».
  – Sheilat (شيلات) : chant scandé, chœurs, souvent sans instruments ou avec effets de voix / basses ; arda / ardha : tambours, chœurs, poésie.
  – Saoudien : samri, khabiti, mizmar du Hijaz (danse aux bâtons, tambours), jalsa (séance acoustique au oud), pop saoudienne.
• Yémen : sana'ani (oud qanbus / turbi, voix ornée), adani, lahji, hadrami, tihami ; rythmes chaloupés 6/8 ou 2/4.
• Irak : choubi (danse rapide), dabke irakienne, maqam irakien (tchalghi : santour, joza), khashaba de Bassora (percussions), mawwal ; pop irakienne ; rap irakien (راب عراقي : trap / drill, 808, dialecte « شكو », « ماكو », « اكو », « هواية »).
• Levant (Syrie, Liban, Palestine, Jordanie) : dabke (darbouka + tabl, mijwiz / yarghoul), baladi ; dialecte « شو », « هيك ».
• Égypte : maqsum (DUM-tak-tak-DUM-tak), baladi, saïdi (mizmar, double DUM), masmoudi, mahraganat (électro chaabi, autotune lourd, 808) ; dialecte « عايز », « كده ».
• Maghreb : chaabi marocain (6/8 rapide, violon, bendir, darbouka, « nayda »), reggada (6/8 bondissant, gasba, bendir), aïta (voix féminines, violon), gnawa (guembri, qraqeb en triolets), ahwach / ahidous (amazigh, chœurs, bendir), andalou, malhoun, raï (Oran / Oujda, synthé, darbouka), staifi, chaoui, mezoued (Tunisie) ; rap / trap maghrébin ; dialectes « bghit / bzaf » (Maroc), « wech / khoya » (Algérie), « barcha / chnowa » (Tunisie).
• Turquie / Kurde / Iran : aksak 9/8 (karşılama), arabesk, halay / govend, bandari / pop persane 6/8.
• Afrique : afrobeats (4/4 syncopé), amapiano (log drum, ~110-115 BPM), coupé-décalé, afro-trap.
• Urbain / occidental : boom bap (80-95 BPM, caisse claire sur 2 et 4), trap (130-150 BPM ou demi-tempo, 808 glissés, charleston en roulements), drill (~140 BPM, charleston décalé, 808 glissants), RnB / neo-soul (accords de 7e et 9e, voix mélismatique), soul, funk, pop, house / EDM (grosse caisse sur chaque temps, 120-128 BPM), techno, lo-fi (swing, grain vinyle), phonk (cowbell), reggaeton / dembow (90-100 BPM), dancehall, reggae (contretemps), latino, bollywood, K-pop.
• Jazz : swing (croches ternaires, walking bass, ride), bossa nova, jazz modal, fusion, jazz oriental (oud / qanun + contrebasse + batterie, maqams).
• Fusions : nomme-les précisément (« khaliji × trap », « rap irakien sur beat drill », « jazz × chaabi », « RnB en darija », « sheilat électro »).
MÉTHODE POUR LE RYTHME : 1) compte les temps sur plusieurs mesures → BPM (dis s'il s'agit d'un demi-tempo) ; 2) pulsation binaire, ternaire (6/8, 12/8), swing ou aksak (9/8, 7/8) ; 3) place des coups graves (DUM) et aigus (tak) ; 4) percussions ; 5) instruments mélodiques ; 6) gamme / maqam ; 7) dialecte (mots entendus) ; 8) 2 à 4 styles candidats avec confiance et preuve, puis choisis. Le PAYS vient des preuves musicales et du dialecte, pas du profil.`;

/* ---------- Règles communes ---------- */
function rules(ctx) {
  const year = new Date().getFullYear();
  return `RÈGLES YOUTUBE / GOOGLE (obligatoires — politique « Spam, pratiques trompeuses », hashtags, chapitres) :
- Titre ≤ ${P.LIMITS.title} caractères (idéal 40-70), mot-clé principal dans la première moitié, sans < ni >.
- L'accroche doit être VRAIE : elle promet uniquement ce que la vidéo contient (pas de piège à clics trompeur).
- Pas de titre en MAJUSCULES (1-2 mots en capitales au plus), pas de « !!! », 0 à 2 emojis d'émotion.
- ${ctx.profile?.officialArtist ? '« Officiel » autorisé (chaîne officielle de l\'artiste).' : 'Jamais « officiel / official / رسمي » (ce n\'est pas une chaîne d\'artiste officielle).'}
- Aucun nom d'artiste, de chanson ou de marque réels qui ne sont pas DANS la vidéo (métadonnées trompeuses interdites)${ctx.isCover ? ' — exception : créditer l\'original d\'une reprise, sans « feat. » ni « officiel »' : ''}.
- Pas de « sub4sub », « téléchargement gratuit », fausses promesses, ni de liste de mots-clés en vrac dans la description.
- Description ≤ ${P.LIMITS.description} caractères ; les 2 premières lignes contiennent le mot-clé principal de façon naturelle.
- Tags : total ≤ ${P.LIMITS.tags} caractères, pertinents, du plus important au plus précis, sans marques ni artistes absents.
- Hashtags : 3 à 5, sans espace, pertinents (les 3 premiers s'affichent au-dessus du titre).
- Chapitres : premier à 0 s, au moins 3, chacun ≥ 10 s, ordre croissant.
- Ne recopie jamais les paroles d'une chanson qui n'appartient pas à la chaîne.
- Année en cours : ${year} (n'écris jamais une année passée comme si elle était actuelle).`;
}

function profileBlock(p = {}) {
  return `PROFIL DE LA CHAÎNE :
- Nom : ${p.name || '—'}${p.handle ? ` (${p.handle})` : ''}
- Niche : ${p.niche || '—'}${p.genre ? ` · styles publiés : ${p.genre}` : ''}
${p.artistName ? `- Nom d'artiste de la chaîne (autorisé dans les titres et tags) : ${p.artistName}` : ''}
- Langues des métadonnées : ${p.languages || 'fr'} (la 1re est la langue principale des titres)
- Pays du public : ${p.country || '—'}
- Public : ${p.audience || '—'}
- Ton : ${p.tone || '—'}
- Musique / voix générées par IA : ${p.aiGenerated ? 'oui' : 'non'}
${p.notes ? `- Notes : ${p.notes}` : ''}`.trim();
}

function videoBlock(ctx) {
  const lines = [
    ctx.fileName ? `- Nom du fichier : « ${ctx.fileName} »${ctx.cleanTitle ? ` → titre probable : « ${ctx.cleanTitle} »` : ''}` : '',
    ctx.duration ? `- Durée : ${F.dur(ctx.duration)} (${Math.round(ctx.duration)} s)` : '',
    ctx.isShort ? '- Format : YouTube Short (vertical)' : '',
    ctx.currentTitle && ![ctx.fileName, String(ctx.fileName || '').replace(/\.[^.]+$/, '')].includes(ctx.currentTitle) ? `- Titre actuel : « ${ctx.currentTitle} »` : '',
    ctx.currentDescription ? `- Description actuelle (extrait) : « ${ctx.currentDescription.slice(0, 600)} »` : '',
    ctx.currentTags?.length ? `- Tags actuels : ${ctx.currentTags.join(', ')}` : '',
    ctx.localBpm ? `- Tempo mesuré sur l'ordinateur : ~${ctx.localBpm} BPM (vérifie, il peut être doublé ou divisé par 2)` : '',
    ctx.keyword ? `- Mot-clé voulu par le créateur : « ${ctx.keyword} »` : '',
    ctx.notes ? `- Notes du créateur : ${ctx.notes}` : '',
    ctx.lyrics ? `- Paroles fournies par le créateur :\n${ctx.lyrics.slice(0, 4000)}` : ''
  ].filter(Boolean);
  return lines.length ? 'VIDÉO :\n' + lines.join('\n') : '';
}

/* ---------- 1. Analyse audio / vidéo ---------- */
export function analysisPrompt(ctx) {
  const system = `Tu es à la fois ethnomusicologue (toutes les musiques du monde : Golfe, Irak, Yémen, Levant, Égypte, Maghreb, Afrique, Turquie, urbain, jazz, RnB…), ingénieur du son et analyste YouTube.
Tu ANALYSES le média joint : tu l'écoutes et tu le regardes EN ENTIER avant de répondre.
Méthode : 1) structure horodatée (intro, couplets, refrains, pont, drop, solo, outro — ou pistes d'une compilation) ; 2) paroles entendues ; 3) phrase qui se répète le plus = refrain ; 4) langue et dialecte AVEC preuves ; 5) rythme selon la MÉTHODE du guide ; 6) style principal, candidats écartés et fusion ; 7) les 2 à 5 MEILLEURS moments (refrain le plus fort, drop, montée, solo, changement de beat) ; 8) public, pays et recherches qu'il tape ; 9) meilleur extrait de 15-45 s pour un Short ; 10) vérification finale.
N'invente rien : si tu n'entends pas une information, laisse le champ vide et note-la dans « uncertain ». N'identifie aucune personne réelle d'après son visage ou sa voix.
Les champs explicatifs (summary, evidence, why, audience, uncertain, reason) sont en FRANÇAIS ; hook_line, song_title_guess, lyrics, labels, genre_search_terms et search_queries restent dans la langue et l'écriture du public.
Réponds uniquement avec le JSON demandé.`;
  const text = `${WORLD_MUSIC_GUIDE}

${profileBlock(ctx.profile)}

${videoBlock(ctx)}

CONSIGNES :
- Timeline : couvre toute la durée, repères en secondes, libellés courts et attirants dans la langue de la chanson (ils deviennent les chapitres « 00:05 Refrain » de la description).
- highlights : les meilleurs moments, horodatés à la seconde près (début du refrain, du drop, de la montée…).
- Si c'est une compilation / un mix : remplis « tracks » avec le début de chaque morceau.
- ${ctx.transcribeLyrics ? 'Transcris les paroles entendues dans « lyrics » (écriture d\'origine, une ligne par vers).' : 'Laisse « lyrics » vide.'}
- target_countries et search_language : d'après le STYLE et le DIALECTE entendus (ex. khaliji → SA, KW, AE ; rap irakien → IQ ; chaabi → MA).
- search_queries et genre_search_terms : ce que ce public tape vraiment (dialecte, fautes courantes, écriture latine type « 3arbizi » si utilisée).
- Durée réelle en secondes dans « duration_seconds ».`;
  return { system, text };
}

/* ---------- 2. Pack SEO ---------- */
function keywordBlock(kw) {
  if (!kw?.items?.length) return '';
  const where = kw.locale ? ` — langue « ${kw.locale.hl} », pays ${kw.locale.gl || '—'}` : '';
  const lines = kw.items.slice(0, 45).map((k) => `  • ${k.kw} — popularité ${k.popularity}/100`);
  const compared = (kw.compared || []).map((c) => `  • « ${c.kw} » : score ${c.overall}/100 (demande ${c.demand}, concurrence ${c.competition})`);
  return `RECHERCHES RÉELLES SUR YOUTUBE${where} (suggestions de la barre de recherche, popularité estimée, les plus demandées en premier) :
${lines.join('\n')}${compared.length ? `\nMOTS-CLÉS COMPARÉS SUR YOUTUBE (vues du top 15 et taille des concurrents) :\n${compared.join('\n')}` : ''}`;
}

function trendsBlock(t) {
  if (!t) return '';
  const yt = t.youtube;
  const web = t.web;
  const parts = [];
  if (yt?.hashtags?.length || yt?.tags?.length) {
    parts.push(`- YouTube Tendances Musique (${yt.region}) — hashtags : ${(yt.hashtags || []).slice(0, 20).map((h) => `${h.tag} ×${h.n}`).join(', ') || '—'}`);
    if (yt.tags?.length) parts.push(`- Tags fréquents des vidéos en tendance : ${yt.tags.slice(0, 20).map((x) => x.tag).join(', ')}`);
    if (yt.words?.length) parts.push(`- Mots des titres en tendance : ${yt.words.slice(0, 15).map((w) => w.k).join(', ')}`);
  }
  if (web && (web.keywords?.length || web.hashtags?.length)) {
    parts.push(`- Tendances web du moment (Google) — recherches : ${(web.keywords || []).slice(0, 15).join(', ') || '—'}`);
    parts.push(`- Hashtags qui circulent : ${(web.hashtags || []).slice(0, 15).join(', ') || '—'}`);
    if (web.title_patterns?.length) parts.push(`- Formules de titres du moment : ${web.title_patterns.slice(0, 6).join(' | ')}`);
  }
  if (!parts.length) return '';
  return `TENDANCES ACTUELLES :\n${parts.join('\n')}\n→ Utilise une tendance SEULEMENT si elle correspond vraiment à cette chanson (un hashtag ou tag sans rapport = métadonnées trompeuses).`;
}

function competitionBlock(c) {
  if (!c?.videos?.length) return '';
  const vids = c.videos.slice(0, 10).map((v) => `  • « ${v.title} » — ${F.num(v.views)} vues, ${F.num(v.subs || 0)} abonnés, ${Math.round(v.ageDays)} j`);
  const hooks = (c.patterns?.hooks || []).slice(0, 5).map((h) => `${h.k} ${h.pct}%`).join(', ');
  const tags = (c.tags || []).slice(0, 25).map((t) => t.tag).join(', ');
  return `CONCURRENCE SUR « ${c.kw} » (demande ${c.demand}/100, concurrence ${c.competition}/100) :
${vids.join('\n')}
  Accroches les plus utilisées : ${hooks || '—'} · longueur moyenne ${c.patterns?.avgLength || '?'} car.
  Tags des concurrents : ${tags || '—'}
→ Inspire-toi des FORMULES qui marchent, jamais d'un titre mot pour mot ; démarque-toi.`;
}

export function seoPrompt(ctx, analysis, kw, comp, trends) {
  const langs = String(ctx.profile?.languages || 'fr');
  const system = `Tu es le meilleur stratège SEO YouTube pour les chaînes ${ctx.profile?.niche || 'musicales'} de tous les styles du monde (khaliji, sheilat, rap irakien, yéménite, égyptien, maghrébin, RnB, jazz, afro…) : titres à très forte accroche (psychologie du public), descriptions riches en mots-clés naturels, tags et hashtags qui visent les recherches LES PLUS DEMANDÉES — en respectant strictement le règlement YouTube / Google.
Tu t'appuies sur les DONNÉES RÉELLES fournies (recherches YouTube, concurrents, tendances) plutôt que sur des suppositions.
Langue des métadonnées : celle du PUBLIC de la chanson (dialecte entendu) ; langues de la chaîne : ${langs}. La description peut ajouter une courte partie dans les autres langues. Les champs explicatifs (angle, audience_insight, keyword_strategy, compliance_notes, concept) sont en français.
Réponds uniquement avec le JSON demandé.`;
  const text = `${profileBlock(ctx.profile)}

${videoBlock(ctx)}

${analysis ? `ANALYSE DE LA VIDÉO PAR ÉCOUTE (JSON) :\n${JSON.stringify(slimAnalysis(analysis))}` : 'Pas d\'écoute : travaille à partir du nom du fichier, des notes et des paroles fournies. N\'invente ni style ni paroles.'}

${keywordBlock(kw)}

${competitionBlock(comp)}

${trendsBlock(trends)}

${rules(ctx)}

${seoTasks(ctx, analysis)}`;
  return { system, text };
}

function seoTasks(ctx, analysis, { listened = !!analysis } = {}) {
  const n = ctx.titleCount || 8;
  const hook = analysis?.music?.hook_line;
  const artist = ctx.profile?.artistName;
  return `À PRODUIRE (comme un expert SEO YouTube professionnel) :
1. main_keyword : parmi les RECHERCHES RÉELLES, la plus demandée qui correspond vraiment à cette chanson (titre de la chanson, style + pays, ou refrain). Elle va dans le titre n°1 (dans les 50 premiers caractères), la 1re ligne de la description, le 1er tag et, si elle est courte, un hashtag. secondary_keywords : 5 à 10 autres recherches réelles. keyword_strategy : explique le choix.
2. titles : ${n} titres, chacun avec un levier différent :
   a) recherche + émotion : « [titre / refrain] [emoji] [style + pays] » ;
   b) adresse directe : « للي… / À toi qui… / For the one who… » ;
   c) déclencheur de partage : « صيفطها / ابعثها / Envoie-la à… » ;
   d) moment d'écoute / appartenance : jalsa, route de nuit, mariage, sahra… ;
   e) curiosité / boucle ouverte (VRAIE : ce qui est promis est dans la vidéo, ex. le meilleur moment) ;
   f) contraste ou fusion (« khaliji mais en trap », « jazz × chaabi ») ;
   g) question émotionnelle ;
   h) mot-clé pur : « [style] [pays] ${new Date().getFullYear()} | [titre] ».
   ${hook ? `Au moins la moitié commencent par la phrase du refrain « ${hook} » ou le titre de la chanson (c'est ce que les gens tapent après l'avoir entendue).` : 'Si la vidéo est une chanson, au moins la moitié des titres commencent par la phrase du refrain ou le titre de la chanson.'}${artist ? ` 2 titres au format « ${artist} - [titre] … ».` : ''} Écris dans le dialecte du public ; 1-2 emojis d'émotion au plus.
3. ab_titles : 3 titres très différents pour le test A/B « Tester et comparer ».
4. description_intro : 2 lignes fortes (refrain / titre + mot-clé principal + promesse émotionnelle). description_body : 150-300 mots — histoire et émotion, style et rythme, quand l'écouter, mots-clés secondaires naturels (jamais en liste), crédits connus${ctx.profile?.aiGenerated ? ', mention transparente de la création assistée par IA' : ''}. lyrics_section : court extrait du refrain seulement si la chanson appartient à la chaîne. cta : abonnement + commentaire + partage.
5. chapters : ${listened ? 'la timeline complète « 00:05 Refrain » : un repère par partie (intro, couplets, refrains, drop, pont, outro), libellés courts et attirants dans la langue de la chanson, premier à 0, chacun ≥ 10 s ; les meilleurs moments sont repérés à la seconde près.' : 'laisse la liste VIDE (sans écoute, les horodatages seraient inventés).'}
6. tags : 25-40, du plus important au plus précis : mot-clé principal, titre de la chanson (écriture d'origine + latine), style + pays, noms du style dans la recherche, variantes d'écriture et fautes courantes, longue traîne, recherches réelles${artist ? ', nom d\'artiste de la chaîne' : ''}. Jamais d'artiste ou de marque absents de la vidéo.
7. hashtags : 3 à 5 — #titre de la chanson, #style, 1-2 hashtags TENDANCE pertinents, sans espace. pinned_comment : une question qui fait raconter au public sa propre histoire + renvoi au meilleur moment (« 🔥 01:12 »).
8. thumbnail : 3 textes courts (2-4 mots), un concept, un prompt d'image. short : titre + description pour un Short tiré du meilleur extrait.
9. compliance_notes : ce que le créateur doit vérifier (IA, reprise, droits…).
Vérifie avant de répondre : longueurs, mot-clé principal en tête, vérité de l'accroche, pas de nom trompeur, hashtags pertinents.`;
}

// Analyse allégée pour la 2e demande (sans paroles complètes pour économiser les jetons)
function slimAnalysis(a) {
  const m = a.music || {};
  return {
    content_type: a.content_type, summary: a.summary, language: a.language, language_code: a.language_code, dialect: a.dialect,
    target_countries: a.target_countries, search_language: a.search_language,
    is_cover: a.is_cover, cover_original: a.cover_original,
    music: { primary_genre: m.primary_genre, subgenres: m.subgenres, fusion: m.fusion, regional_style: m.regional_style, genre_search_terms: m.genre_search_terms, pulse: m.pulse, percussion: m.percussion, bpm: m.bpm, time_signature: m.time_signature, key: m.key, scale_or_maqam: m.scale_or_maqam, rhythm_pattern: m.rhythm_pattern, mood: m.mood, energy: m.energy, instruments: m.instruments, vocals: m.vocals, hook_line: m.hook_line, song_title_guess: m.song_title_guess, lyrics_theme: m.lyrics_theme, lyrics_excerpt: String(m.lyrics || '').split('\n').slice(0, 8).join('\n'), listening_moments: m.listening_moments, similar_styles: m.similar_styles },
    timeline: a.timeline, highlights: a.highlights, tracks: a.tracks, best_short: a.best_short, visual: a.visual, audience: a.audience,
    search_queries: a.search_queries, topics: a.topics, duration_seconds: a.duration_seconds
  };
}

/* ---------- Tendances web (Google Search via Gemini) ---------- */
export function trendsPrompt({ genre, countries, language, terms }) {
  const d = new Date();
  const month = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return `Cherche sur Google ce qui est en tendance EN CE MOMENT (${month}) sur YouTube, TikTok et Instagram pour la musique « ${genre} »${terms?.length ? ` (${terms.join(', ')})` : ''} dans ${countries?.length ? countries.join(', ') : 'le monde arabe'}, langue « ${language || 'ar'} ».
Donne : les recherches / expressions en hausse, les hashtags qui circulent vraiment, et les formules de titres qui marchent. Uniquement des éléments trouvés dans tes recherches, jamais inventés ; pas de noms d'artistes.
Réponds UNIQUEMENT avec un objet JSON : {"keywords": [], "hashtags": [], "title_patterns": [], "notes": ""}`;
}

/* ---------- 3. Accroches des concurrents ---------- */
export function hooksPrompt(titles, ctx = {}) {
  const system = `Tu es analyste YouTube spécialisé dans les accroches de titres (psychologie, curiosité, émotion). Réponds en français, uniquement en JSON. Les exemples et idées de titres restent dans la langue des titres analysés.`;
  const text = `${profileBlock(ctx.profile)}

TITRES QUI MARCHENT (vues entre parenthèses) :
${titles.slice(0, 40).map((t) => `- ${t.title}${t.views ? ` (${F.num(t.views)} vues)` : ''}`).join('\n')}

Dégage les formules d'accroche (modèle générique avec [variables]), les mots puissants, l'usage des emojis, la longueur idéale, puis propose 8 idées de titres ORIGINALES (jamais copiées) pour ${ctx.topic ? `« ${ctx.topic} »` : 'la chaîne'}.
${rules(ctx)}`;
  return { system, text };
}

/* ---------- 4. Mode abonnement : gemini.google.com piloté par l'extension ---------- */
// Modèle JSON lisible tiré d'un schéma (Gemini web n'accepte pas de schéma imposé)
export function jsonExample(schema) {
  switch (schema.type) {
    case 'OBJECT': return Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, jsonExample(v)]));
    case 'ARRAY': return [jsonExample(schema.items)];
    case 'NUMBER': case 'INTEGER': return 0;
    case 'BOOLEAN': return false;
    default: return schema.enum ? schema.enum.join(' | ') : (schema.description ? `<${schema.description}>` : '');
  }
}

export const jsonFormat = (schema) => `FORMAT DE RÉPONSE OBLIGATOIRE : UN SEUL bloc de code JSON valide, sans aucun texte avant ni après, avec exactement ces clés (les <…> décrivent ce qu'il faut mettre) :
\`\`\`json
${JSON.stringify(jsonExample(schema), null, 1)}
\`\`\``;

export function webAnalysisPrompt(ctx, { link = '' } = {}) {
  const a = analysisPrompt(ctx);
  return `${a.system}

${link ? `VIDÉO À ANALYSER : ${link}
Ouvre cette vidéo YouTube avec ton outil YouTube, regarde-la et écoute-la EN ENTIER.` : 'Le fichier audio joint est la bande-son complète de la vidéo : écoute-le EN ENTIER.'}
Si tu ne peux PAS accéder à la vidéo ou au son, réponds uniquement : {"error": "no_access"}

${a.text}

${jsonFormat(ANALYSIS_SCHEMA)}`;
}

export function webSeoPrompt(ctx, analysis, kw, comp, trends) {
  const s = seoPrompt(ctx, analysis, kw, comp, trends);
  return `${s.system}

${s.text}

RECHERCHE DE TENDANCES : avant d'écrire, fais une recherche Google sur les hashtags et les recherches en hausse CE MOIS-CI pour ce style dans ces pays (YouTube, TikTok, Instagram). Mets ce que tu trouves dans « trends_found » et n'utilise que ce qui correspond vraiment à cette chanson.

${jsonFormat(SEO_SCHEMA)}`;
}

// Une seule demande (analyse + SEO) : plus rapide, un peu moins précis sur les mots-clés
export function webSinglePrompt(ctx, { link = '', kwData = null } = {}) {
  const a = analysisPrompt(ctx);
  const s = seoPrompt(ctx, null, kwData, null, null);
  return `${a.system}

${link ? `VIDÉO À ANALYSER : ${link}
Ouvre cette vidéo YouTube avec ton outil YouTube, regarde-la et écoute-la EN ENTIER.` : 'Le fichier audio joint est la bande-son complète de la vidéo : écoute-le EN ENTIER.'}
Si tu ne peux PAS accéder à la vidéo ou au son, réponds uniquement : {"error": "no_access"}

Fais DEUX choses : A) l'analyse musicale et vidéo (clé « analysis ») ; B) le pack SEO YouTube basé sur cette analyse (clé « seo »).

${s.system.replace('Réponds uniquement avec le JSON demandé.', '')}

${a.text}

${keywordBlock(kwData)}

${rules(ctx)}

RECHERCHE DE TENDANCES : fais une recherche Google sur les hashtags et recherches en hausse ce mois-ci pour ce style ; mets-les dans « seo.trends_found ».

PARTIE B — ${seoTasks(ctx, null, { listened: true })}

FORMAT DE RÉPONSE OBLIGATOIRE : UN SEUL bloc de code JSON valide, sans texte autour :
\`\`\`json
${JSON.stringify({ analysis: jsonExample(ANALYSIS_SCHEMA), seo: jsonExample(SEO_SCHEMA) }, null, 1)}
\`\`\``;
}

/* ---------- 5. Mode manuel (copier-coller dans gemini.google.com) ---------- */
export function manualPrompt(ctx) {
  const a = analysisPrompt(ctx);
  const s = seoPrompt(ctx, null, ctx.kwData, null, null);
  return `${a.system}

J'ai joint ma vidéo (ou son audio). Écoute-la et regarde-la en entier, puis fais DEUX choses :
A) l'analyse musicale et vidéo (clé « analysis ») ;
B) le pack SEO YouTube basé sur cette analyse (clé « seo »).

${s.system.replace('Réponds uniquement avec le JSON demandé.', '')}

${a.text}

${keywordBlock(ctx.kwData)}

${rules(ctx)}

PARTIE B — ${seoTasks(ctx, null, { listened: true })}

FORMAT DE RÉPONSE : UN SEUL bloc de code JSON, sans texte autour :
{
  "analysis": { "content_type": "", "summary": "", "language": "", "language_code": "", "dialect": "", "target_countries": [], "search_language": "", "is_cover": false, "cover_original": "",
    "music": { "primary_genre": "", "subgenres": [], "fusion": "", "regional_style": "", "rhythm_candidates": [{ "name": "", "confidence": 0, "evidence": "" }], "bpm": 0, "time_signature": "", "pulse": "", "rhythm_pattern": "", "percussion": [], "key": "", "scale_or_maqam": "", "mood": [], "energy": 5, "instruments": [], "vocals": "", "hook_line": "", "hook_start": 0, "song_title_guess": "", "lyrics_theme": "", "lyrics": "", "listening_moments": [], "genre_search_terms": [] },
    "timeline": [{ "start": 0, "end": 0, "label": "", "kind": "" }], "highlights": [{ "start": 0, "end": 0, "label": "", "kind": "", "why": "" }], "tracks": [], "best_short": { "start": 0, "end": 0, "reason": "" },
    "visual": { "description": "" }, "audience": "", "search_queries": [], "duration_seconds": 0, "confidence": 0.8, "uncertain": [] },
  "seo": { "main_keyword": "", "secondary_keywords": [], "keyword_strategy": "", "audience_insight": "", "titles": [{ "text": "", "hook_type": "", "angle": "" }], "ab_titles": [],
    "description_intro": "", "description_body": "", "lyrics_section": "", "cta": "", "chapters": [{ "start": 0, "label": "" }],
    "tags": [], "hashtags": [], "pinned_comment": "", "thumbnail": { "texts": [], "concept": "", "prompt": "" }, "short": { "title": "", "description": "" }, "compliance_notes": [] }
}`;
}
