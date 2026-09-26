// JEC TubePilot — moteur invisible intégré à YouTube Studio : reçoit le fichier importé, l'envoie à Gemini et renvoie le pack SEO.
// C'est une page de l'extension : la clé API ne quitte jamais l'extension et le fichier n'est lu que sur votre ordinateur.
import { run } from '../lib/pipeline.js';

const nonce = location.hash.slice(1);
const STUDIO = 'https://studio.youtube.com';
let current = null;

function post(msg) {
  window.parent.postMessage({ tp: 'tp-engine-out', nonce, ...msg }, STUDIO);
}

window.addEventListener('message', async (e) => {
  if (e.source !== window.parent || e.origin !== STUDIO) return;
  const m = e.data;
  if (!m || m.tp !== 'tp-engine' || m.nonce !== nonce) return;
  if (m.type === 'cancel') {
    if (current && (!m.jobId || current.jobId === m.jobId)) current.ctrl.abort();
    return;
  }
  if (m.type !== 'run') return;
  current?.ctrl.abort();
  const ctrl = new AbortController();
  const me = { jobId: m.jobId, ctrl };
  current = me;
  try {
    const pack = await run({
      file: m.file || null,
      youtubeUrl: m.youtubeUrl || '',
      ctx: m.ctx || {},
      options: m.options || {},
      signal: ctrl.signal,
      onProgress: (progress) => {
        post({ type: 'progress', jobId: m.jobId, progress });
        chrome.runtime.sendMessage({ type: 'job:progress', jobId: m.jobId, key: m.ctx?.packKey, progress }).catch(() => {});
      }
    });
    post({ type: 'done', jobId: m.jobId, pack });
  } catch (err) {
    post({ type: 'error', jobId: m.jobId, error: err?.message || String(err), reason: err?.reason || '' });
    chrome.runtime.sendMessage({ type: 'job:progress', jobId: m.jobId, key: m.ctx?.packKey, progress: { step: 'error', detail: err?.message } }).catch(() => {});
  } finally {
    if (current === me) current = null;
  }
});

post({ type: 'ready' });
