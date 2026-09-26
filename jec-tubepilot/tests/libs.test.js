import test from 'node:test';
import assert from 'node:assert/strict';
import '../lib/format.js';
import '../lib/policy.js';
import '../lib/seo.js';
import '../lib/postprocess.js';
import '../lib/jsonparse.js';

const F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo, Post = globalThis.TPPost;

test('format : durées, horodatages, nombres', () => {
  assert.equal(F.dur(187), '3:07');
  assert.equal(F.dur(3723), '1:02:03');
  assert.equal(F.parseTs('1:02:03'), 3723);
  assert.equal(F.parseTs('02:05'), 125);
  assert.equal(F.isoDur('PT1H2M3S'), 3723);
  assert.equal(F.num(1234), '1,2 k');
  assert.equal(F.num(3400000), '3,4 M');
});

test('format : horodatage de chapitre 00:05', () => {
  assert.equal(F.ts(5), '00:05');
  assert.equal(F.ts(192), '03:12');
  assert.equal(F.ts(3723), '1:02:03');
  assert.equal(F.parseTs('00:05'), 5);
});

test('format : nom de fichier → titre', () => {
  assert.equal(F.cleanFileName('قُولْهَا-لِيَّا [usesuno.com].webm'), 'قولها ليا');
  assert.equal(F.cleanFileName('VID_20260923_183012.mp4'), '');
  assert.equal(F.cleanFileName('Track 01.mp3'), '');
  assert.equal(F.cleanFileName('ya_lalla-mix.mp4'), 'ya lalla mix');
});

test('format : normalisation arabe et latin', () => {
  assert.equal(F.norm('Éété  Chaâbi!'), 'eete chaabi');
  assert.equal(F.norm('أُغْنِيَة'), 'اغنيه');
  assert.equal(F.script('اغاني مغربية 2026'), 'arabic');
});

test('policy : longueur des tags comptée comme YouTube', () => {
  assert.equal(P.tagsLength(['a', 'b c']), 1 + 3 + 2 + 1);
  const many = Array.from({ length: 80 }, (_, i) => 'mot clé numéro ' + i);
  const fit = P.fitTags(many);
  assert.ok(P.tagsLength(fit) <= 500);
  assert.deepEqual(P.fitTags(['Chaabi', 'chaabi', '#Raï', '<x>']), ['Chaabi', 'Raï', 'x']);
});

test('policy : chapitres valides (0:00, ≥ 3, ≥ 10 s)', () => {
  const ch = P.buildChapters([{ start: 5, label: 'Couplet' }, { start: 12, label: 'trop proche' }, { start: 40, label: 'Refrain' }, { start: 95, label: 'Pont' }, { start: 170, label: 'fin' }], 180);
  assert.equal(ch[0].t, 0);
  assert.ok(ch.length >= 3);
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].t - ch[i - 1].t >= 10);
  assert.ok(ch.every((c) => c.t <= 170));
  assert.deepEqual(P.validateChapters(ch, 180), []);
  // premier repère tardif : une intro est ajoutée à 0:00
  const late = P.buildChapters([{ start: 20, label: 'A' }, { start: 60, label: 'B' }, { start: 100, label: 'C' }], 200, 'مقدمة');
  assert.deepEqual(late.map((c) => c.t), [0, 20, 60, 100]);
  assert.equal(late[0].label, 'مقدمة');
  assert.deepEqual(P.buildChapters([{ start: 0, label: 'A' }, { start: 30, label: 'B' }], 60), []);
  const parsed = P.parseChapters('Intro\n0:00 Début\n1:05 - Refrain\n(2:30) Fin');
  assert.deepEqual(parsed.map((c) => c.t), [0, 65, 150]);
  assert.match(P.validateChapters([{ t: 5, label: 'x' }, { t: 20, label: 'y' }, { t: 25, label: 'z' }])[0], /0:00/);
});

test('policy : contrôles du règlement', () => {
  const t = P.checkTitle('MEILLEURE CHANSON OFFICIELLE DE TOUS LES TEMPS !!!', {});
  const codes = t.map((i) => i.code);
  assert.ok(codes.includes('caps'));
  assert.ok(codes.includes('punct'));
  assert.ok(codes.includes('official'));
  assert.ok(!P.checkTitle('Clip officiel', { officialArtist: true }).some((i) => i.code === 'official'));
  assert.ok(P.checkTitle('x'.repeat(120)).some((i) => i.code === 'long'));
  const d = P.checkDescription(Array.from({ length: 70 }, (_, i) => '#tag' + i).join(' '));
  assert.ok(d.some((i) => i.code === 'too-many'));
  const d2 = P.checkDescription('#a #b #c ' + Array.from({ length: 14 }, (_, i) => '#x' + i).join(' '));
  assert.ok(d2.some((i) => i.code === 'many'));
  assert.ok(P.checkDescription('Téléchargez ici bit.ly/abc sub4sub').some((i) => i.code === 'spam'));
  assert.equal(P.sanitizeTitle('a <b> c').includes('<'), false);
  assert.ok(P.sanitizeTitle('mot '.repeat(40)).length <= 100);
  assert.equal(P.normalizeHashtag('# musique marocaine!'), '#musiquemarocaine');
});

test('seo : score de titre et accroches', () => {
  const good = S.scoreTitle('قولها ليا 💔 أغنية مغربية حزينة للي فارق حبيبو', { keyword: 'أغنية مغربية حزينة' });
  const bad = S.scoreTitle('video', { keyword: 'أغنية مغربية حزينة' });
  assert.ok(good.score > bad.score + 30, `${good.score} vs ${bad.score}`);
  assert.ok(good.hooks.includes('émotion'));
  assert.ok(S.detectHooks('Why nobody talks about this?').includes('question'));
  assert.ok(S.detectHooks('Why nobody talks about this?').includes('curiosité'));
  const caps = S.scoreTitle('THE BEST SONG EVER MADE IN THE WORLD', {});
  assert.ok(caps.score < 70);
});

test('seo : score global et motifs des concurrents', () => {
  const s = S.scoreAll({ title: 'Chaabi mariage 2026 🎉 ambiance marocaine', description: 'Chaabi mariage : la meilleure ambiance.\n\n' + 'mot '.repeat(160) + '\n0:00 Intro\n0:30 Refrain\n1:20 Fin\nAbonnez-vous https://x.y\n#chaabi #mariage #maroc', tags: ['chaabi mariage', 'chaabi', 'musique marocaine', 'ambiance mariage marocain', 'chaabi 2026', 'nayda', 'marocain', 'fete'] }, { keyword: 'chaabi mariage', duration: 200 });
  assert.ok(s.score >= 70, String(s.score));
  const pat = S.titlePatterns(['Chaabi nayda 2026 🔥', 'Chaabi nayda mariage', 'Top chaabi nayda ❤️']);
  assert.equal(pat.traits.emoji, 67);
  assert.ok(pat.words.some((w) => w.k === 'chaabi nayda'));
});

test('postprocess : fiche complète conforme', () => {
  const seo = {
    main_keyword: 'اغاني مغربية',
    secondary_keywords: ['شعبي مغربي', 'اغاني اعراس'],
    titles: [{ text: 'قولها ليا 💔 اغاني مغربية حزينة', hook_type: 'émotion' }, { text: 'قولها ليا 💔 اغاني مغربية حزينة', hook_type: 'doublon' }, { text: 'x'.repeat(130), hook_type: 'long' }],
    ab_titles: ['A', 'B', 'C'],
    description_intro: 'قولها ليا — اغاني مغربية حزينة',
    description_body: 'نص '.repeat(50),
    lyrics_section: 'قولها ليا',
    cta: 'اشترك في القناة',
    chapters: [{ start: 0, label: 'مقدمة' }, { start: 30, label: 'الكوبلي' }, { start: 75, label: 'اللازمة' }],
    tags: Array.from({ length: 60 }, (_, i) => 'وسم رقم ' + i),
    hashtags: ['اغاني مغربية', '#شعبي', '#قولها_ليا', '#x', '#y', '#z'],
    pinned_comment: 'شكون فكرتك هاد الأغنية؟',
    thumbnail: { texts: ['قولها ليا'], concept: 'c', prompt: 'p' }
  };
  const pack = Post.buildPack({ key: 'file:a.mp4:1', ctx: { profile: { languages: 'ar, fr', signature: 'https://insta.com/x' }, duration: 180 }, analysis: { content_type: 'music', duration_seconds: 180, music: { song_title_guess: 'قولها ليا' } }, seo });
  assert.equal(pack.seo.titles.length, 2, 'doublon retiré');
  assert.ok(pack.seo.titles.every((t) => t.text.length <= 100));
  assert.ok(P.tagsLength(pack.seo.tags) <= 500);
  assert.equal(pack.seo.tags[0], 'اغاني مغربية');
  assert.equal(pack.seo.hashtags.length, 5);
  assert.ok(pack.seo.hashtags.every((h) => /^#\S+$/.test(h)));
  assert.match(pack.seo.description, /⏱️ التوقيتات\n00:00 مقدمة\n00:30 الكوبلي\n01:15 اللازمة/);
  assert.ok(pack.seo.description.length <= 5000);
  assert.ok(pack.seo.description.includes('https://insta.com/x'));
  assert.ok(pack.score.overall > 0);
});

test('postprocess : description trop longue raccourcie sans perdre les chapitres', () => {
  const d = Post.assembleDescription({ intro: 'intro', body: 'x '.repeat(4000), chapters: [{ t: 0, label: 'a' }, { t: 20, label: 'b' }, { t: 40, label: 'c' }], cta: 'Abonnez-vous', hashtags: ['#a'] }, 'fr');
  assert.ok(d.length <= 5000);
  assert.match(d, /00:40 c/);
  assert.match(d, /#a$/);
});

test('postprocess : réponse collée depuis Gemini', () => {
  const txt = 'Voici :\n```json\n{"analysis":{"content_type":"music"},"seo":{"titles":[{"text":"T"}],"tags":[],"hashtags":[],}}\n```';
  const r = Post.parseManual(txt);
  assert.equal(r.seo.titles[0].text, 'T');
  assert.throws(() => Post.parseManual('pas de json'), /JSON/);
});

test('postprocess : meilleurs moments 🔥 fusionnés dans une timeline valide', () => {
  const merged = Post.mergeHighlights(
    [{ start: 0, label: 'Intro' }, { start: 30, label: 'Refrain' }, { start: 80, label: 'Couplet 2' }, { start: 140, label: 'Final' }],
    [{ start: 34, label: 'Refrain', kind: 'refrain' }, { start: 110, label: 'Drop', kind: 'drop' }, { start: 175, label: 'trop tard' }],
    180
  );
  assert.deepEqual(merged.map((c) => c.label), ['Intro', '🔥 Refrain', 'Couplet 2', 'Final', '🔥 Drop']);
  const ch = P.buildChapters(merged, 180);
  assert.deepEqual(ch.map((c) => c.t), [0, 30, 80, 110, 140]);
  assert.deepEqual(P.validateChapters(ch, 180), []);
  const pack = Post.buildPack({
    key: 'k', ctx: { profile: { languages: 'fr' }, duration: 180 },
    analysis: { content_type: 'music', language_code: 'en', duration_seconds: 180, timeline: [{ start: 0, label: 'Intro' }, { start: 30, label: 'Hook' }, { start: 80, label: 'Verse 2' }], highlights: [{ start: 31, label: 'Hook', kind: 'refrain' }], music: { genre_search_terms: ['arabic rnb'] } },
    seo: { titles: [{ text: 'Titre' }], tags: ['a'], hashtags: ['#a'] }
  });
  assert.match(pack.seo.description, /⏱️ Timeline — 🔥 best moments\n00:00 Intro\n00:30 🔥 Hook\n01:20 Verse 2/);
  assert.ok(pack.seo.tags.includes('arabic rnb'));
});

test('postprocess : pas de timeline inventée sans écoute', () => {
  const pack = Post.buildPack({ key: 'k', ctx: { duration: 200 }, analysis: null, seo: { titles: [{ text: 'T' }], chapters: [{ start: 0, label: 'a' }, { start: 20, label: 'b' }, { start: 40, label: 'c' }] } });
  assert.equal(pack.seo.chapters.length, 0);
});

test('jsonparse : réponse de Gemini avec texte, paroles multilignes, JSON coupé', () => {
  const J = globalThis.TPJson;
  const r1 = J.parse('Voici :\n```json\n{"titles":[{"text":"a"}],"tags":["x"],"lyrics":"ligne 1\nligne 2"}\n```\nBonne chance !', ['titles', 'tags']);
  assert.equal(r1.obj.titles[0].text, 'a');
  assert.equal(r1.obj.lyrics, 'ligne 1\nligne 2');
  const r2 = J.parse('{"music":{"primary_genre":"khaliji"},"timeline":[{"start":0,"label":"مقدمة"},{"start":30,"lab', ['music', 'timeline']);
  assert.equal(r2.cut, true);
  assert.equal(r2.obj.music.primary_genre, 'khaliji');
  const r3 = J.parse('{"music":{}} puis {"titles":[1],"tags":[2]}', ['titles', 'tags']);
  assert.deepEqual(r3.obj.titles, [1]);
  assert.equal(J.parse('pas de json', ['titles']).obj, null);
  assert.equal(J.parse('{"error":"no_access"}', []).obj.error, 'no_access');
});
