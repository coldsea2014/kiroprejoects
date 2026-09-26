// JEC TubePilot — lecture tolérante des réponses de Gemini (bloc de code, texte autour, réponse coupée, plusieurs JSON)
(function (g) {
  'use strict';

  // retours à la ligne / tabulations bruts dans les chaînes JSON (fréquent avec des paroles) → échappés
  function repair(s) {
    let out = '', inStr = false, esc = false;
    for (const ch of String(s)) {
      if (inStr) {
        if (esc) { out += ch; esc = false; continue; }
        if (ch === '\\') { out += ch; esc = true; continue; }
        if (ch === '"') { inStr = false; out += ch; continue; }
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') continue;
        if (ch === '\t') { out += '\\t'; continue; }
        out += ch;
      } else {
        if (ch === '"') inStr = true;
        out += ch;
      }
    }
    return out;
  }

  // objets « { … } » équilibrés (les chaînes sont respectées) + le dernier objet jamais refermé (réponse coupée)
  function spans(s) {
    const closed = [];
    let open = '', from = 0;
    for (let guard = 0; from < s.length && guard < 60; guard++) {
      let depth = 0, start = -1, inStr = false, esc = false;
      for (let i = from; i < s.length; i++) {
        const ch = s[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') { if (depth > 0) inStr = true; continue; }
        if (ch === '{') { if (depth === 0) start = i; depth++; }
        else if (ch === '}' && depth > 0 && --depth === 0) { closed.push({ text: s.slice(start, i + 1), at: start }); start = -1; }
      }
      if (depth > 0 && start >= 0) {
        if (!open) open = s.slice(start);
        from = start + 1;
        continue;
      }
      break;
    }
    return { closed, open };
  }

  // JSON coupé : chaîne, tableaux et objets ouverts refermés
  function close(s) {
    let inStr = false, esc = false;
    const stack = [];
    for (const ch of s) {
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if ((ch === '}' || ch === ']') && stack.length) stack.pop();
    }
    let out = repair(s);
    if (inStr) out = out.replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/\\$/, '') + '"';
    else out = out.replace(/([\s,:[])(?:t|tr|tru|f|fa|fal|fals|n|nu|nul)$/, '$1').replace(/([\s,:[])-$/, '$1');
    out = out.replace(/,\s*"[^"]*"\s*:?\s*$/, '').replace(/[,:]\s*$/, '');
    while (stack.length) out += stack.pop() === '{' ? '}' : ']';
    return out;
  }

  // l'objet qui porte les clés attendues (ou son enfant direct : { "result": { "titles": … } })
  function withKeys(obj, keys) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (!keys.length || keys.every((k) => k in obj)) return obj;
    for (const v of Object.values(obj)) if (v && typeof v === 'object' && !Array.isArray(v) && keys.every((k) => k in v)) return v;
    return null;
  }

  function tryAll(c) {
    const fixed = c.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    for (const v of [c, fixed, repair(c), repair(fixed)]) {
      try { const o = JSON.parse(v); if (o && typeof o === 'object') return o; } catch (e) { /* suivant */ }
    }
    return null;
  }

  // → { obj, cut } ; obj = null si rien de lisible. keys : clés attendues (le bon JSON parmi plusieurs)
  function parse(text, keys = []) {
    const s = String(text || '').replace(/^\uFEFF/, '').trim();
    const found = [];
    const whole = tryAll(s);
    if (whole) found.push({ o: whole, at: 0, n: s.length });
    for (const m of s.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) { const o = tryAll(m[1].trim()); if (o) found.push({ o, at: m.index, n: m[1].length }); }
    const { closed, open } = spans(s);
    closed.forEach((c) => { const o = tryAll(c.text); if (o) found.push({ o, at: c.at, n: c.text.length }); });
    const hits = found.map((f) => ({ o: withKeys(f.o, keys), at: f.at, n: f.n })).filter((h) => h.o);
    if (hits.length) {
      // plusieurs réponses : la DERNIÈRE qui porte les clés ; à égalité, la plus longue
      hits.sort((a, b) => b.at - a.at || b.n - a.n);
      return { obj: hits[0].o, cut: false };
    }
    if (open) {
      const o = withKeys(tryAll(close(open)), keys);
      if (o) return { obj: o, cut: true };
    }
    return { obj: null, cut: false };
  }

  g.TPJson = { parse, repair, close, withKeys };
})(globalThis);
