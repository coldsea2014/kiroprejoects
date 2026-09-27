// TubePilot — vérifie que chaque clé de traduction utilisée dans le code existe dans toutes les langues
// usage : node tools/check-i18n.mjs [--list]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', 'tests', 'tools', 'locales', 'docs', '_locales']);
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!SKIP.has(f)) walk(p); }
    else if (/\.(js|html)$/.test(f)) files.push(p);
  }
})(root);

const used = new Map();
const prefixes = new Set();
const add = (k, f) => { if (!used.has(k)) used.set(k, new Set()); used.get(k).add(f.slice(root.length + 1)); };
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\b(?:t|T|TPI18n\.t|I18n\.t)\(\s*(['"`])([a-zA-Z][\w.]*)\1/g)) {
    if (m[1] === '`' && m[2].includes('${')) continue;
    if (!m[2].endsWith('.')) add(m[2], f);
  }
  // clés construites : t('hook.' + id), t(`step.${s}`)
  for (const m of src.matchAll(/\b(?:t|T)\(\s*(?:'([a-z][\w.]*\.)'\s*\+|`([a-z][\w.]*\.)\$\{)/g)) prefixes.add(m[1] || m[2]);
  for (const m of src.matchAll(/data-i18n(?:-html|-ph|-title)?="([^"]+)"/g)) add(m[1], f);
  // listes de clés déclarées avec le commentaire  // i18n-keys: a.b c.d
  for (const m of src.matchAll(/i18n-keys:\s*([^\n*]+)/g)) for (const k of m[1].trim().split(/\s+/)) add(k, f);
}

globalThis.TP_LOCALES = {};
const LANGS = ['en', 'fr', 'ar'];
for (const l of LANGS) await import(join(root, 'lib/locales', l + '.js'));
const L = globalThis.TP_LOCALES;

let bad = 0;
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [k, where] of [...used].sort()) {
  for (const l of LANGS) {
    if (!(k in (L[l] || {}))) { console.log(`manque  ${l}  ${k}   (${[...where].join(', ')})`); bad++; }
  }
  if (L.en?.[k] != null) for (const l of LANGS.slice(1)) {
    if (L[l]?.[k] != null && vars(L[l][k]) !== vars(L.en[k])) { console.log(`variables ${l} ${k}: {${vars(L[l][k])}} ≠ en {${vars(L.en[k])}}`); bad++; }
  }
}
for (const p of prefixes) {
  const n = Object.keys(L.en || {}).filter((k) => k.startsWith(p)).length;
  if (!n) { console.log(`préfixe sans clé : ${p}`); bad++; }
  for (const l of LANGS.slice(1)) for (const k of Object.keys(L.en || {}).filter((k) => k.startsWith(p))) {
    if (!(k in (L[l] || {}))) { console.log(`manque  ${l}  ${k}   (préfixe ${p})`); bad++; }
  }
}
// clés passées indirectement : T(cond ? 'a.b' : 'a.c')
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/'([a-z][\w]*\.[\w.]+)'/g)) if (L.en && m[1] in L.en && !used.has(m[1])) add(m[1], f);
const allUsed = new Set(used.keys());
const unused = Object.keys(L.en || {}).filter((k) => !allUsed.has(k) && ![...prefixes].some((p) => k.startsWith(p)));
for (const l of LANGS.slice(1)) for (const k of Object.keys(L[l] || {})) if (!(k in L.en)) { console.log(`en trop ${l}  ${k}`); }
if (process.argv.includes('--list')) { console.log([...used.keys()].sort().join('\n')); console.log('prefixes:', [...prefixes].join(' ')); }
if (unused.length) console.log(`(info) ${unused.length} clés en anglais non repérées dans le code : ${unused.slice(0, 40).join(' ')}${unused.length > 40 ? ' …' : ''}`);
console.log(bad ? `✗ ${bad} problème(s) — ${used.size} clés utilisées` : `✓ ${used.size} clés utilisées, présentes dans ${LANGS.join('/')}`);
process.exit(bad ? 1 : 0);
