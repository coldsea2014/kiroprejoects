// Faux chrome.storage pour tester les modules dans Node
export function installChrome() {
  const data = {};
  const area = {
    async get(keys) {
      if (keys == null) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(obj) { Object.entries(obj).forEach(([k, v]) => { data[k] = structuredClone(v); }); },
    async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete data[k]); }
  };
  const listeners = new Set();
  const winListeners = new Set();
  const opened = [];
  // faux gemini.google.com : responder(prompt, job) → texte de la réponse (ou { error })
  let responder = null;
  const chrome = {
    storage: { local: area, session: area, onChanged: { addListener() {} } },
    runtime: {
      id: 'test',
      onMessage: { addListener: (f) => listeners.add(f), removeListener: (f) => listeners.delete(f) },
      sendMessage: async () => undefined
    },
    windows: {
      async create(o) { const w = { id: 100 + opened.length, tabs: [{ id: 500 + opened.length }], ...o }; opened.push({ ...w, closed: false }); return w; },
      async remove(id) { const w = opened.find((x) => x.id === id); if (w) w.closed = true; winListeners.forEach((f) => f(id)); },
      async update() { return {}; },
      onRemoved: { addListener: (f) => winListeners.add(f), removeListener: (f) => winListeners.delete(f) }
    },
    tabs: {
      async getCurrent() { return { id: 1, windowId: 1, index: 0 }; },
      async query() { return [{ id: 1, windowId: 1, index: 0 }]; },
      async create(o) { const t = { id: 900 + opened.length, windowId: 1, ...o }; opened.push({ id: t.id, tabs: [t], closed: false }); return t; },
      async update() { return {}; },
      async remove() {},
      async sendMessage(tabId, m) {
        if (m.type !== 'gw:run') return { ok: true };
        const job = m.job;
        setTimeout(async () => {
          const file = job.attachKey ? (await area.get(job.attachKey))[job.attachKey] : null;
          const out = responder ? await responder(job.prompt, { ...job, file }) : '{}';
          const msg = typeof out === 'object' && out.error ? { type: 'gw:error', id: job.id, error: out.error } : { type: 'gw:done', id: job.id, text: out };
          listeners.forEach((f) => f(msg, {}));
        }, 5);
        return { ok: true };
      }
    }
  };
  globalThis.chrome = chrome;
  data.__gemini = { opened, setResponder: (f) => { responder = f; } };
  return data;
}
