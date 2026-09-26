// JEC TubePilot — lit les infos publiques de la vidéo affichée (tags, vues, date) depuis le lecteur YouTube de la page
(function () {
  'use strict';
  if (window.__tpMain) return;
  window.__tpMain = true;

  function read() {
    const url = new URL(location.href);
    const id = url.pathname === '/watch' ? url.searchParams.get('v') : null;
    if (!id) {
      window.postMessage({ tp: 'tp-main', type: 'none' }, location.origin);
      return true;
    }
    let r = null;
    try { r = document.getElementById('movie_player')?.getPlayerResponse?.() || null; } catch (e) { r = null; }
    if (!r || r.videoDetails?.videoId !== id) {
      try { if (window.ytInitialPlayerResponse?.videoDetails?.videoId === id) r = window.ytInitialPlayerResponse; } catch (e) { /* rien */ }
    }
    if (!r || r.videoDetails?.videoId !== id) return false;
    const d = r.videoDetails || {};
    const mf = r.microformat?.playerMicroformatRenderer || {};
    window.postMessage({
      tp: 'tp-main',
      type: 'player',
      data: {
        videoId: id,
        title: d.title || '',
        keywords: d.keywords || [],
        viewCount: Number(d.viewCount) || 0,
        lengthSeconds: Number(d.lengthSeconds) || 0,
        channelId: d.channelId || '',
        author: d.author || '',
        description: d.shortDescription || '',
        publishDate: mf.publishDate || mf.uploadDate || '',
        category: mf.category || '',
        isLive: !!d.isLiveContent
      }
    }, location.origin);
    return true;
  }

  let tries = 0, t = 0;
  function tryRead() {
    clearTimeout(t);
    tries = 0;
    const loop = () => { if (read() === false && ++tries < 24) t = setTimeout(loop, 500); };
    loop();
  }

  document.addEventListener('yt-navigate-finish', tryRead);
  window.addEventListener('message', (e) => { if (e.source === window && e.data?.tp === 'tp-req') tryRead(); });
  tryRead();
})();
