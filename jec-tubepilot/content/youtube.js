// TubePilot — page vidéo YouTube : tags, vues/heure, score SEO, accroches et engagement de n'importe quelle vidéo
(function () {
  'use strict';
  if (window.__tpWatchAlive?.()) return;
  const UI = globalThis.TPUI, F = globalThis.TPF, P = globalThis.TPPolicy, S = globalThis.TPSeo;
  const t = (k, v) => globalThis.TPI18n.t(k, v);
  window.__tpWatchAlive = UI.alive;
  const esc = F.esc;

  let enabled = true, data = null, stats = null, card = null, collapsed = false;
  try { collapsed = localStorage.getItem('tp-watch-collapsed') === '1'; } catch (e) { /* stockage bloqué */ }

  chrome.storage.local.get('settings').then(({ settings }) => { TPI18n.setLang(settings?.uiLang || 'auto'); enabled = settings?.watchCard !== false; if (!enabled) card?.host.remove(); else render(); });

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
    card.body.dir = TPI18n.dir();
    const I = globalThis.TPIcons;
    const ic = (n, sz = 14) => I.icon(n, sz);
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
    const kpi = (val, label) => `<div class="tp-kpi"><b>${val}</b><span>${esc(label)}</span></div>`;
    card.body.innerHTML = `<div class="tp-card tp-watch">
      <div class="tp-card__head">${I.logo(20)}<b class="tp-brand">TubePilot</b>${I.ring(sc.score, 32, t('score.overall'))}
        <div class="tp-subscores"><span>${esc(t('score.titleShort'))} <b>${sc.title.score}</b></span><span>${esc(t('score.descShort'))} <b>${sc.description.score}</b></span><span>${esc(t('score.tagsShort'))} <b>${sc.tags.score}</b></span></div>
        <span class="tp-grow"></span><button class="tp-btn tp-btn--ghost tp-btn--icon tp-btn--sm" data-act="collapse" title="${esc(collapsed ? t('common.expand') : t('common.collapse'))}">${ic(collapsed ? 'down' : 'x')}</button></div>
      <div class="tp-card__body ${collapsed ? 'tp-hidden' : ''}">
        <button class="tp-btn tp-btn--primary tp-btn--block" data-act="analyze" title="${esc(t('watch.analyzeHint'))}">${ic('sparkles', 15)} ${esc(t('watch.analyze'))}</button>
        <div class="tp-kpis">
          ${kpi(F.num(views), t('watch.views'))}
          ${kpi(F.num(perHour), t('watch.vph'))}
          ${kpi(published ? esc(F.ago(published)) : '—', t('watch.age'))}
          ${v ? kpi(v.engagement.toFixed(1) + '%', t('watch.engagement')) + kpi(F.num(v.likes), t('watch.likes')) + kpi(F.num(v.comments), t('watch.comments')) : ''}
          ${ch ? kpi(ch.hiddenSubs ? '—' : F.num(ch.subs), t('watch.subs')) + kpi(outlier ? '×' + (outlier >= 10 ? Math.round(outlier) : outlier.toFixed(1)) : '—', t('watch.outlier')) : ''}
        </div>
        ${!stats ? `<div class="tp-tiny tp-faint">${esc(t('watch.needKey'))}</div>` : ''}
        <div class="tp-row tp-small">${ic('target')}<span class="tp-muted">${esc(t('watch.hooks'))}</span>${hooks.length ? hooks.map((h) => `<span class="tp-chip tp-chip--accent">${esc(t('hook.' + h))}</span>`).join('') : `<span class="tp-faint">${esc(t('watch.noHook'))}</span>`}</div>
        <div class="tp-row tp-small tp-muted">${ic('hash')} ${esc(t('watch.hashtags', { n: hashtags.length }))} · ${ic('clock')} ${esc(chapters.length ? t('watch.chapters', { n: chapters.length }) : t('watch.noChapters'))}</div>
        <div class="tp-stack tp-stack--sm">
          <div class="tp-row"><b class="tp-small">${ic('tag')} ${esc(t('watch.tags', { n: tags.length, len: P.tagsLength(tags) }))}</b><span class="tp-grow"></span>${tags.length ? `<button class="tp-btn tp-btn--sm" data-act="copytags">${ic('copy', 13)} ${esc(t('common.copy'))}</button>` : ''}</div>
          <div class="tp-chips">${tags.length ? tags.map((x) => `<button class="tp-chip tp-chip--click tp-bidi" data-act="kw" data-kw="${esc(x)}" title="${esc(t('watch.analyzeKeyword'))}">${esc(x)}</button>`).join('') : `<span class="tp-small tp-faint">${esc(t('watch.noTags'))}</span>`}</div>
        </div>
        <div class="tp-row">
          <button class="tp-btn tp-btn--sm" data-act="follow">${ic('users', 13)} ${esc(t('watch.follow'))}</button>
          <button class="tp-btn tp-btn--sm" data-act="hooks">${ic('target', 13)} ${esc(t('watch.hookFormulas'))}</button>
          <button class="tp-btn tp-btn--sm" data-act="kw" data-kw="${esc(tags[0] || d.title)}">${ic('key', 13)} ${esc(t('watch.keywords'))}</button>
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
        UI.toast(t('toast.copied'));
      } else if (act === 'analyze') {
        UI.openPanel({ tab: 'video', url: 'https://www.youtube.com/watch?v=' + data.videoId, autorun: true });
      } else if (act === 'kw') {
        UI.openPanel({ tab: 'keywords', keyword: b.dataset.kw });
      } else if (act === 'hooks') {
        UI.openPanel({ tab: 'competitors', channelId: data.channelId, videoTitle: data.title });
      } else if (act === 'follow') {
        const c = await UI.send('addCompetitor', { channel: data.channelId });
        UI.toast(t('toast.followed', { name: c.title }));
      }
    } catch (e) {
      UI.toast(e.message, 5000, 'alert');
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
