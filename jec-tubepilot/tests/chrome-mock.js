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
  globalThis.chrome = { storage: { local: area, session: area, onChanged: { addListener() {} } }, runtime: { id: 'test' } };
  return data;
}
