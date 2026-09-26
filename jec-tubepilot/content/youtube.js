// JEC TubePilot — page vidéo YouTube : tags, vues/heure, score SEO, accroches et engagement de n'importe quelle vidéo
(function () {
  'use strict';
  if (window.__tpWatchAlive?.()) return;
  const UI = globalThis.TPUI, F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo;
  window.__tpWatchAlive = UI.alive;
  const esc = F.esc;

  let enabled = true, data = null, stats = null, card = null, collapsed = false;
  try { collapsed = localStorage.getItem('tp-watch-collapsed') === '1'; } catch (e) { /* stockage bloqué */ }

  chrome.storage.local.get('settings').then(({ settings }) => { enabled = settings?.watchCard !== false; if (!enabled) card?.host.remove(); });

  function container() {
    const sec = document.querySelector('#secondary-inner');
    if (sec && sec.getClientRects().length) return { el: sec, where: 'afterbegin' };
    const below = document.querySelector('ytd-watch-flexy #below');
    return below ? { el: below, where: 'afterbegin' } : null;
  }

  function render() {
    if (!enabled || !data || !UI.alive()) return;
    const c = container();
    if (!c) { setTimeout(render, 700); return; }
    if (!card) {
      card = UI.shadow('tp-watch-card');
      card.body.addEventListener('click', onClick);
    }
    if (!card.host.isConnected || card.host.parentElement !== c.el) c.el.insertAdjacentElement(c.where, card.host);
    card.host.classList.toggle('dark', UI.isDark());
    const d = data;
    const v = stats?.video;
    const ch = stats?.channel;
    const views = v?.views || d.viewCount;
    const published = v?.publishedAt || d.publishDate;
    const perHour = F.vph(views, published);
    const tags = v?.tags?.length ? v.tags : d.keywords;
    const desc = v?.description || d.description;
    const sc = S.scoreAll({ title: d.title, description: desc, tags }, { keyword: tags[0] || '', duration: d.lengthSeconds });
    const hooks = S.detectHooks(d.title);
    const hashtags = P.extractHashtags(desc);
    const chapters = P.parseChapters(desc);
    const outlier = ch?.subs ? views / ch.subs : 0;
    card.body.innerHTML = `<div class="tp-card tp-watch">
      <div class="tp-head">${UI.logo()}<b>JEC TubePilot</b>${UI.badge(sc.score, 'Score SEO de cette vidéo')}
        <span class="tp-sub"><span>Titre <b>${sc.title.score}</b></span><span>Desc. <b>${sc.description.score}</b></span><span>Tags <b>${sc.tags.score}</b></span></span>
        <span class="tp-sp"></span><button class="tp-ghost" data-act="collapse">${collapsed ? '▸' : '▾'}</button></div>
      <div class="tp-body ${collapsed ? 'tp-hidden' : ''}">
        <div class="tp-stat">
          <div><b>${F.num(views)}</b><span>vues</span></div>
          <div><b>${F.num(perHour)}</b><span>vues / heure</span></div>
          <div><b>${published ? esc(F.ago(published).replace('il y a ', '')) : '—'}</b><span>âge</span></div>
          ${v ? `<div><b>${v.engagement.toFixed(1).replace('.', ',')} %</b><span>engagement</span></div>
          <div><b>${F.num(v.likes)}</b><span>j'aime</span></div>
          <div><b>${F.num(v.comments)}</b><span>commentaires</span></div>` : ''}
          ${ch ? `<div><b>${ch.hiddenSubs ? '—' : F.num(ch.subs)}</b><span>abonnés</span></div>
          <div><b>${outlier ? '×' + (outlier >= 10 ? Math.round(outlier) : outlier.toFixed(1).replace('.', ',')) : '—'}</b><span>vues / abonnés</span></div>` : ''}
          <div><b>${F.dur(d.lengthSeconds)}</b><span>${esc(d.category || 'durée')}</span></div>
        </div>
        ${!stats ? '<div class="tp-muted tp-small">Ajoutez une clé YouTube Data API dans les réglages pour voir j\'aime, commentaires, abonnés et le ratio vues/abonnés.</div>' : ''}
        <div class="tp-small">🧠 Accroches du titre : ${hooks.length ? hooks.map((h) => `<span class="tp-chip">${esc(h)}</span>`).join(' ') : '<span class="tp-muted">aucune détectée</span>'}</div>
        <div class="tp-small">#️⃣ ${hashtags.length} hashtag(s) · ⏱️ ${chapters.length ? chapters.length + ' chapitres' : 'pas de chapitres'} · ${d.title.length} car. dans le titre</div>
        <div>
          <div class="tp-row"><b class="tp-small">🏷️ Tags (${tags.length} · ${P.tagsLength(tags)}/500)</b><span class="tp-sp"></span>${tags.length ? '<button data-act="copytags">Copier les tags</button>' : ''}</div>
          <div class="tp-chips">${tags.length ? tags.map((t) => `<button class="tp-chip" data-act="kw" data-kw="${esc(t)}" title="Analyser ce mot-clé">${esc(t)}</button>`).join('') : '<span class="tp-muted tp-small">Aucun tag public sur cette vidéo.</span>'}</div>
        </div>
        <div class="tp-row">
          <button class="tp-primary" data-act="analyze" title="Gemini écoute ce clip public et prépare titres, timeline, tags et hashtags">🎧 Analyser ce clip avec Gemini</button>
          <button data-act="follow">➕ Suivre la chaîne</button>
          <button data-act="hooks">🧠 Formules d'accroche</button>
          <button data-act="kw" data-kw="${esc(tags[0] || d.title)}">🔑 Mots-clés</button>
        </div>
      </div>
    </div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b || !data) return;
    const act = b.dataset.act;
    try {
      if (act === 'collapse') {
        collapsed = !collapsed;
        try { localStorage.setItem('tp-watch-collapsed', collapsed ? '1' : '0'); } catch (e) { /* stockage bloqué */ }
        render();
      } else if (act === 'copytags') {
        const tags = stats?.video?.tags?.length ? stats.video.tags : data.keywords;
        await UI.copy(tags.join(', '));
        UI.toast('Tags copiés ✓');
      } else if (act === 'analyze') {
        UI.openPanel({ tab: 'video', url: 'https://www.youtube.com/watch?v=' + data.videoId, autorun: true });
      } else if (act === 'kw') {
        UI.openPanel({ tab: 'keywords', keyword: b.dataset.kw });
      } else if (act === 'hooks') {
        UI.openPanel({ tab: 'competitors', channelId: data.channelId, videoTitle: data.title });
      } else if (act === 'follow') {
        const c = await UI.send('addCompetitor', { channel: data.channelId });
        UI.toast(`« ${c.title} » ajoutée à vos concurrents ✓`);
      }
    } catch (e) {
      UI.toast('⚠️ ' + e.message, 5000);
    }
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.tp !== 'tp-main' || !UI.alive()) return;
    if (e.data.type === 'none') { data = null; stats = null; card?.host.remove(); return; }
    if (e.data.type !== 'player') return;
    const d = e.data.data;
    if (data?.videoId === d.videoId && card?.host.isConnected) return;
    data = d;
    stats = null;
    render();
    try {
      const r = await UI.send('videoStats', { id: d.videoId });
      if (r && data?.videoId === d.videoId) { stats = r; render(); }
    } catch (err) { /* sans clé API : infos de la page seulement */ }
  });

  window.postMessage({ tp: 'tp-req' }, location.origin);
})();
