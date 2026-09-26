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
  language: STR('langue et dialecte entendus, en français (ex. « Arabe — darija marocaine »)'),
  language_code: STR('code ISO 639-1 de la langue principale'),
  language_evidence: STR('mots entendus qui prouvent la langue / le dialecte'),
  is_cover: BOOL('true seulement si c\'est une reprise d\'une chanson existante que tu reconnais avec certitude'),
  cover_original: STR('« titre — interprète original » si reprise certaine, sinon vide'),
  music: OBJ({
    primary_genre: STR('style musical principal (ex. chaabi, raï, pop, trap, lo-fi, gnawa, khaliji…)'),
    subgenres: ARR(STR()),
    regional_style: STR('pays / région du style (ex. Maroc, Algérie, Golfe, international)'),
    genre_confidence: NUM('0 à 1'),
    genre_evidence: STR('preuves entendues : rythme, instruments, gamme, voix'),
    bpm: NUM('tempo compté (battements par minute)'),
    time_signature: STR('ex. 4/4, 6/8'),
    key: STR('tonalité (ex. La mineur) si audible'),
    scale_or_maqam: STR('gamme ou maqam (ex. Hijaz, Bayati, Nahawand, mineur harmonique)'),
    rhythm_pattern: STR('cycle rythmique (ex. 6/8 marocain, maqsum, dembow, trap hi-hats)'),
    mood: ARR(STR()),
    energy: INT('1 (calme) à 10 (très énergique)'),
    instruments: ARR(STR()),
    vocals: STR('type de voix (homme, femme, duo, instrumental), technique, effets (autotune…)'),
    production: STR('qualité / style de production'),
    hook_line: STR('la phrase chantée qui se répète le plus (refrain), dans sa langue et son écriture d\'origine'),
    hook_start: NUM('seconde où le refrain commence la première fois'),
    song_title_guess: STR('titre le plus probable de la chanson (souvent la phrase du refrain)'),
    lyrics_theme: STR('thème des paroles en français'),
    lyrics: STR('transcription des paroles si demandée, sinon vide'),
    listening_moments: ARR(STR(), 'moments d\'écoute (nuit, route, mariage, sport…)'),
    similar_styles: ARR(STR(), 'styles proches (jamais des noms d\'artistes)')
  }, ['primary_genre', 'mood', 'energy', 'instruments', 'vocals', 'hook_line']),
  timeline: ARR(OBJ({ start: NUM('secondes'), end: NUM('secondes'), label: STR('libellé court'), kind: STR('intro, couplet, refrain, pont, drop, solo, outro, sujet, piste…') }, ['start', 'label']), 'structure horodatée de TOUTE la vidéo'),
  tracks: ARR(OBJ({ start: NUM(), title: STR() }), 'pour une compilation / mix : début de chaque morceau'),
  best_short: OBJ({ start: NUM(), end: NUM(), reason: STR() }),
  thumbnail_moment: NUM('seconde de l\'image la plus forte pour une miniature'),
  visual: OBJ({ description: STR(), colors: ARR(STR()), on_screen_text: STR(), people: STR('personnes visibles, sans les identifier') }, ['description']),
  audience: STR('public visé et ce qu\'il ressent (français)'),
  search_queries: ARR(STR(), '8 à 15 recherches que ce public tape vraiment sur YouTube, dans sa langue + écriture latine si utile'),
  topics: ARR(STR()),
  duration_seconds: NUM(),
  confidence: NUM('0 à 1 : confiance globale de l\'analyse'),
  uncertain: ARR(STR(), 'points incertains (français)')
}, ['content_type', 'summary', 'language', 'language_code', 'music', 'timeline', 'search_queries', 'confidence']);

export const SEO_SCHEMA = OBJ({
  main_keyword: STR('mot-clé principal choisi parmi les recherches réelles'),
  secondary_keywords: ARR(STR()),
  audience_insight: STR('psychologie du public en 1-2 phrases (français)'),
  titles: ARR(OBJ({ text: STR(), hook_type: STR('curiosité, émotion, adresse directe, partage, contraste, moment d\'écoute, question, mot-clé pur…'), angle: STR('pourquoi ce titre marchera (français, court)') }, ['text', 'hook_type'])),
  ab_titles: ARR(STR(), '3 titres très différents pour « Tester et comparer »'),
  description_intro: STR('2 premières lignes : accroche + mot-clé principal naturel'),
  description_body: STR('corps de la description (sans chapitres ni hashtags)'),
  lyrics_section: STR('extrait du refrain (paroles de la chaîne uniquement) ou vide'),
  cta: STR('appel à l\'action : abonnement, commentaire, partage'),
  chapters: ARR(OBJ({ start: NUM('secondes'), label: STR() }), 'chapitres dans la langue de la vidéo'),
  tags: ARR(STR(), '25 à 40 tags classés par importance'),
  hashtags: ARR(STR(), '3 à 5 hashtags'),
  pinned_comment: STR(),
  thumbnail: OBJ({ texts: ARR(STR(), '3 textes de miniature de 2 à 4 mots'), concept: STR(), prompt: STR('prompt d\'image IA (anglais), sans visage de célébrité ni logo') }),
  short: OBJ({ title: STR(), description: STR() }),
  compliance_notes: ARR(STR(), 'points de règlement YouTube à vérifier (français)')
}, ['main_keyword', 'titles', 'ab_titles', 'description_intro', 'description_body', 'cta', 'tags', 'hashtags', 'pinned_comment', 'thumbnail']);

export const HOOKS_SCHEMA = OBJ({
  formulas: ARR(OBJ({ name: STR(), template: STR(), example: STR(), why: STR() }, ['name', 'template', 'why'])),
  power_words: ARR(STR()),
  emoji_usage: STR(),
  ideal_length: STR(),
  recommendations: ARR(STR()),
  title_ideas: ARR(OBJ({ text: STR(), hook_type: STR() }, ['text', 'hook_type']))
});

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
- Niche : ${p.niche || '—'}${p.genre ? ` · style habituel : ${p.genre}` : ''}
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
  const system = `Tu es à la fois ethnomusicologue (toutes les musiques du monde, dont maghrébines, arabes, africaines, latines, urbaines), ingénieur du son et analyste YouTube.
Tu ANALYSES le média joint : tu l'écoutes et tu le regardes en entier avant de répondre.
Méthode : 1) structure horodatée (intro, couplets, refrains, pont, drop, outro — ou sujets / pistes pour une compilation) ; 2) paroles entendues ; 3) phrase qui se répète le plus = refrain ; 4) langue et dialecte AVEC preuves ; 5) musique avec preuves : tempo compté, mesure, cycle rythmique, gamme / maqam, instruments, voix, production ; 6) style principal et styles proches (jamais « pays inventé » : le style ≠ la nationalité) ; 7) public et recherches qu'il tape ; 8) meilleur extrait de 15-45 s pour un Short ; 9) vérification finale.
N'invente rien : si tu n'entends pas une information, laisse le champ vide et note-la dans « uncertain ». N'identifie aucune personne réelle d'après son visage ou sa voix.
Les champs explicatifs (summary, evidence, audience, uncertain, reason) sont en FRANÇAIS ; hook_line, song_title_guess, lyrics et search_queries restent dans la langue et l'écriture d'origine.
Réponds uniquement avec le JSON demandé.`;
  const text = `${profileBlock(ctx.profile)}

${videoBlock(ctx)}

CONSIGNES :
- Timeline : couvre toute la durée, repères en secondes, libellés courts (ils serviront de chapitres).
- Si c'est une compilation / un mix : remplis « tracks » avec le début de chaque morceau.
- ${ctx.transcribeLyrics ? 'Transcris les paroles entendues dans « lyrics » (écriture d\'origine, une ligne par vers).' : 'Laisse « lyrics » vide.'}
- « search_queries » : ce que le public tape vraiment (dialecte, fautes courantes, écriture latine type « 3arbizi » si le public l'utilise).
- Durée réelle en secondes dans « duration_seconds ».`;
  return { system, text };
}

/* ---------- 2. Pack SEO ---------- */
function keywordBlock(kw) {
  if (!kw?.items?.length) return '';
  const lines = kw.items.slice(0, 40).map((k) => `  • ${k.kw} — popularité ${k.popularity}/100${k.source ? ` (${k.source})` : ''}`);
  return `RECHERCHES RÉELLES SUR YOUTUBE (suggestions de la barre de recherche, popularité estimée) :\n${lines.join('\n')}`;
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

export function seoPrompt(ctx, analysis, kw, comp) {
  const langs = String(ctx.profile?.languages || 'fr');
  const system = `Tu es le meilleur stratège SEO YouTube pour les chaînes ${ctx.profile?.niche || 'musicales'} : tu écris des titres à forte accroche (psychologie du public), des descriptions riches en mots-clés naturels et des tags optimisés — en respectant strictement le règlement YouTube / Google.
Tu t'appuies sur les DONNÉES RÉELLES fournies (recherches YouTube, concurrents) plutôt que sur des suppositions.
Langue des métadonnées : ${langs} — titres dans la 1re langue (dialecte de la vidéo s'il y en a un), la description peut ajouter une courte partie dans les autres langues. Les champs explicatifs (angle, audience_insight, compliance_notes, concept) sont en français.
Réponds uniquement avec le JSON demandé.`;
  const text = `${profileBlock(ctx.profile)}

${videoBlock(ctx)}

${analysis ? `ANALYSE DE LA VIDÉO PAR ÉCOUTE (JSON) :\n${JSON.stringify(slimAnalysis(analysis))}` : 'Pas d\'écoute : travaille à partir du nom du fichier, des notes et des paroles fournies. N\'invente ni style ni paroles.'}

${keywordBlock(kw)}

${competitionBlock(comp)}

${rules(ctx)}

${seoTasks(ctx, analysis)}`;
  return { system, text };
}

function seoTasks(ctx, analysis) {
  const n = ctx.titleCount || 8;
  const hook = analysis?.music?.hook_line;
  return `À PRODUIRE :
1. main_keyword : la recherche réelle la plus pertinente ET la plus demandée pour CETTE vidéo.
2. titles : ${n} titres, chacun avec un levier différent (curiosité / boucle ouverte, émotion brute, adresse directe, déclencheur de partage, contraste, moment d'écoute / appartenance, question, mot-clé pur). ${hook ? `Au moins la moitié commencent par la phrase du refrain « ${hook} » ou le titre de la chanson.` : 'Si la vidéo est une chanson, au moins la moitié des titres commencent par la phrase du refrain ou le titre de la chanson.'} Le mot-clé principal ou une recherche réelle dans chaque titre.
3. ab_titles : 3 titres très différents pour le test A/B « Tester et comparer ».
4. description_intro (2 lignes fortes), description_body (150-300 mots, mots-clés secondaires naturels, contexte, crédits${ctx.profile?.aiGenerated ? ', mention transparente de la création assistée par IA si pertinent' : ''}), lyrics_section (court extrait du refrain seulement si la chanson appartient à la chaîne), cta.
5. chapters : ${analysis ? 'à partir de la timeline, libellés courts et attractifs dans la langue de la vidéo (premier à 0).' : 'laisse la liste VIDE (sans écoute, les horodatages seraient inventés).'}
6. tags : 25-40, du plus important au plus précis : mot-clé principal, titre de la chanson, style + pays, variantes d'écriture (arabe / latin), longue traîne, recherches réelles.
7. hashtags : 3 à 5. pinned_comment : une question qui fait raconter au public sa propre histoire.
8. thumbnail : 3 textes courts, un concept, un prompt d'image. short : titre + description pour un Short tiré du meilleur extrait.
9. compliance_notes : ce que le créateur doit vérifier (IA, reprise, droits…).
Vérifie avant de répondre : longueurs, mot-clé en tête, vérité de l'accroche, pas de nom trompeur.`;
}

// Analyse allégée pour la 2e demande (sans paroles complètes pour économiser les jetons)
function slimAnalysis(a) {
  const m = a.music || {};
  return {
    content_type: a.content_type, summary: a.summary, language: a.language, language_code: a.language_code,
    is_cover: a.is_cover, cover_original: a.cover_original,
    music: { primary_genre: m.primary_genre, subgenres: m.subgenres, regional_style: m.regional_style, bpm: m.bpm, time_signature: m.time_signature, key: m.key, scale_or_maqam: m.scale_or_maqam, rhythm_pattern: m.rhythm_pattern, mood: m.mood, energy: m.energy, instruments: m.instruments, vocals: m.vocals, hook_line: m.hook_line, song_title_guess: m.song_title_guess, lyrics_theme: m.lyrics_theme, lyrics_excerpt: String(m.lyrics || '').split('\n').slice(0, 8).join('\n'), listening_moments: m.listening_moments, similar_styles: m.similar_styles },
    timeline: a.timeline, tracks: a.tracks, best_short: a.best_short, visual: a.visual, audience: a.audience,
    search_queries: a.search_queries, topics: a.topics, duration_seconds: a.duration_seconds
  };
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

/* ---------- 4. Mode manuel (abonnement Gemini dans gemini.google.com, sans clé API) ---------- */
export function manualPrompt(ctx) {
  const a = analysisPrompt(ctx);
  const s = seoPrompt(ctx, null, ctx.kwData, null);
  return `${a.system}

J'ai joint ma vidéo (ou son audio). Écoute-la et regarde-la en entier, puis fais DEUX choses :
A) l'analyse musicale et vidéo (clé « analysis ») ;
B) le pack SEO YouTube basé sur cette analyse (clé « seo »).

${s.system.replace('Réponds uniquement avec le JSON demandé.', '')}

${a.text}

${keywordBlock(ctx.kwData)}

${rules(ctx)}

PARTIE B — ${seoTasks(ctx, null)}

FORMAT DE RÉPONSE : UN SEUL bloc de code JSON, sans texte autour :
{
  "analysis": { "content_type": "", "summary": "", "language": "", "language_code": "", "is_cover": false, "cover_original": "",
    "music": { "primary_genre": "", "subgenres": [], "regional_style": "", "bpm": 0, "time_signature": "", "key": "", "scale_or_maqam": "", "rhythm_pattern": "", "mood": [], "energy": 5, "instruments": [], "vocals": "", "hook_line": "", "hook_start": 0, "song_title_guess": "", "lyrics_theme": "", "lyrics": "", "listening_moments": [] },
    "timeline": [{ "start": 0, "end": 0, "label": "", "kind": "" }], "tracks": [], "best_short": { "start": 0, "end": 0, "reason": "" },
    "visual": { "description": "" }, "audience": "", "search_queries": [], "duration_seconds": 0, "confidence": 0.8, "uncertain": [] },
  "seo": { "main_keyword": "", "secondary_keywords": [], "audience_insight": "", "titles": [{ "text": "", "hook_type": "", "angle": "" }], "ab_titles": [],
    "description_intro": "", "description_body": "", "lyrics_section": "", "cta": "", "chapters": [{ "start": 0, "label": "" }],
    "tags": [], "hashtags": [], "pinned_comment": "", "thumbnail": { "texts": [], "concept": "", "prompt": "" }, "short": { "title": "", "description": "" }, "compliance_notes": [] }
}`;
}
