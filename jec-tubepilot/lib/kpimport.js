// TubePilot — import des exports Google Ads Keyword Planner (CSV) : volumes mensuels et concurrence réels de Google
// Keyword Planner exporte en UTF-16 (tabulations) ou en UTF-8 (virgules), avec des en-têtes traduits selon la langue du compte.
import './format.js';

const F = globalThis.TPF;

const COL = {
  keyword: /^(keyword|keywords|mot[- ]?cl[ée]s?|palabra clave|parola chiave|schl[üu]sselwort|palavra-chave|anahtar kelime|الكلمة الرئيسية|الكلمات الرئيسية|كلمة رئيسية)$/i,
  volume: /(avg\.?\s*monthly searches|average monthly searches|nombre moyen de recherches mensuelles|recherches mensuelles|promedio de b[úu]squedas mensuales|ricerche mensili|durchschnittliche suchanfragen|m[ée]dia de pesquisas mensais|متوسط عمليات البحث الشهرية|متوسط عدد عمليات البحث)/i,
  competition: /^(competition|concurrence|competencia|concorrenza|wettbewerb|concorr[êe]ncia|المنافسة)$/i,
  compIndex: /(competition \(indexed value\)|concurrence \(valeur index[ée]e\)|competencia \(valor indexado\)|المنافسة \(القيمة المفهرسة\))/i,
  change3m: /(three month change|variation sur trois mois|cambio en tres meses|التغيير على مدار ثلاثة أشهر)/i,
  yoy: /(yoy change|variation sur un an|cambio interanual|التغيير على أساس سنوي)/i
};

// décode le fichier (UTF-16 LE/BE avec BOM, sinon UTF-8)
export function decode(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  // UTF-16 sans BOM : beaucoup d'octets nuls
  const zeros = u8.subarray(0, 400).filter((b) => b === 0).length;
  if (zeros > 60) return new TextDecoder('utf-16le').decode(u8);
  return new TextDecoder('utf-8').decode(u8).replace(/^\uFEFF/, '');
}

// découpe une ligne CSV / TSV en respectant les guillemets
function splitLine(line, sep) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

// « 1K – 10K », « 1 k – 10 k », « 100 – 1 000 », « 12 100 », « 1,2 M » → { min, max }
export function parseVolume(raw) {
  const s = String(raw || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // chiffres arabes orientaux
    .replace(/\u066B/g, '.').replace(/\u066C/g, ',')
    .replace(/\u00A0|\u202F/g, ' ').trim();
  if (!s || s === '-' || s === '--') return null;
  const nums = s.split(/\s+[–—-]\s+|\s*[–—]\s*|(?<=\S)-(?=\d)/).map((part) => {
    const m = part.replace(/\s/g, '').match(/^([\d.,]+)(k|m|mil|mio\.?|mn|md|ألف|الف|آلاف|مليون|ملايين)?$/i);
    if (!m) return NaN;
    const unit = (m[2] || '').toLowerCase();
    // 1,2 / 1.2 → décimale si suivie d'une unité ; sinon séparateur de milliers
    const n = unit ? Number(m[1].replace(',', '.')) : Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    const mult = /^(k|mil|ألف|الف|آلاف)$/.test(unit) ? 1e3 : /^(m|mio\.?|mn|مليون|ملايين)$/.test(unit) ? 1e6 : unit === 'md' ? 1e9 : 1;
    return n * mult;
  }).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

const LEVEL = { low: 1, faible: 1, bajo: 1, basso: 1, niedrig: 1, baixa: 1, 'منخفضة': 1, medium: 2, moyenne: 2, moyen: 2, medio: 2, mittel: 2, 'média': 2, media: 2, 'متوسطة': 2, high: 3, 'élevée': 3, elevee: 3, alto: 3, alta: 3, hoch: 3, 'عالية': 3, 'مرتفعة': 3 };

// texte d'export → [{ kw, vol: {min,max}, comp: 1|2|3|0, compIdx }]
export function parseKeywordPlanner(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  let head = -1, sep = '\t', cols = null;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    for (const s of ['\t', ',', ';']) {
      const cells = splitLine(lines[i], s);
      const k = cells.findIndex((c) => COL.keyword.test(c));
      const v = cells.findIndex((c) => COL.volume.test(c));
      if (k >= 0 && v >= 0) { head = i; sep = s; cols = { k, v, c: cells.findIndex((c) => COL.competition.test(c)), ci: cells.findIndex((c) => COL.compIndex.test(c)) }; break; }
    }
    if (head >= 0) break;
  }
  if (head < 0) throw new Error('no-header');
  const out = [];
  for (const line of lines.slice(head + 1)) {
    const cells = splitLine(line, sep);
    const kw = (cells[cols.k] || '').trim();
    if (!kw) continue;
    const vol = parseVolume(cells[cols.v]);
    const compRaw = cols.c >= 0 ? String(cells[cols.c] || '').trim().toLowerCase() : '';
    out.push({ kw, vol, comp: LEVEL[compRaw] || 0, compIdx: cols.ci >= 0 ? Number(cells[cols.ci]) || null : null });
  }
  return out;
}

/* ---------- Base locale des volumes ---------- */
export async function importKeywordPlanner(buf, { country = '', lang = '' } = {}) {
  const rows = parseKeywordPlanner(decode(buf));
  const { kpVolumes = { entries: {} } } = await chrome.storage.local.get('kpVolumes');
  const entries = kpVolumes.entries || {};
  let n = 0;
  for (const r of rows) {
    if (!r.vol) continue;
    entries[F.norm(r.kw)] = { kw: r.kw, min: r.vol.min, max: r.vol.max, comp: r.comp, compIdx: r.compIdx, country, lang, at: Date.now() };
    n++;
  }
  await chrome.storage.local.set({ kpVolumes: { updatedAt: Date.now(), entries } });
  return { imported: n, total: Object.keys(entries).length };
}

export async function kpStats() {
  const { kpVolumes } = await chrome.storage.local.get('kpVolumes');
  return { total: Object.keys(kpVolumes?.entries || {}).length, updatedAt: kpVolumes?.updatedAt || 0 };
}

export async function clearKeywordPlanner() {
  await chrome.storage.local.remove('kpVolumes');
}

let memo = null, memoAt = 0;
export async function kpLookup() {
  if (memo && Date.now() - memoAt < 30000) return memo;
  const { kpVolumes } = await chrome.storage.local.get('kpVolumes');
  memo = kpVolumes?.entries || {};
  memoAt = Date.now();
  return memo;
}

// volume représentatif d'une plage (moyenne géométrique) et libellé « 1K–10K »
export const volMid = (e) => (e ? Math.round(Math.sqrt(Math.max(1, e.min) * Math.max(1, e.max))) : 0);
export function volLabel(e) {
  if (!e) return '';
  const f = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));
  return e.min === e.max ? f(e.min) : `${f(e.min)}–${f(e.max)}`;
}
