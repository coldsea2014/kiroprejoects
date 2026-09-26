// JEC TubePilot — client de l'API Gemini (Google AI Studio) : modèles, envoi de fichiers, génération JSON structurée
const API = 'https://generativelanguage.googleapis.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GeminiError extends Error {
  constructor(message, { status = 0, reason = '', retryable = false, daily = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.reason = reason;
    this.retryable = retryable;
    this.daily = daily;
  }
}

// Erreur HTTP de Google → message clair en français
async function toError(res, model) {
  let body = {};
  try { body = await res.json(); } catch (e) { /* réponse non JSON */ }
  const err = body.error || {};
  const msg = String(err.message || res.statusText || '');
  const details = err.details || [];
  const reason = details.map((d) => d.reason).find(Boolean) || err.status || '';
  if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg + reason)) return new GeminiError('Clé Gemini invalide : vérifiez-la dans Réglages (elle commence par « AIza »).', { status: 400, reason: 'key' });
  if (res.status === 403) return new GeminiError('Clé Gemini refusée : activez « Generative Language API » pour ce projet ou retirez les restrictions de la clé.', { status: 403, reason: 'forbidden' });
  if (res.status === 404) return new GeminiError(`Modèle « ${model || '?'} » introuvable : choisissez un autre modèle dans Réglages.`, { status: 404, reason: 'model' });
  if (res.status === 429) {
    const retry = details.find((d) => /RetryInfo/.test(d['@type'] || ''))?.retryDelay || '';
    const quotaIds = details.flatMap((d) => (d.violations || []).map((v) => v.quotaId || '')).join(' ');
    const daily = /PerDay/i.test(quotaIds);
    const wait = parseFloat(retry) || 0;
    return new GeminiError(daily
      ? `Quota journalier Gemini atteint pour « ${model} ». Choisissez un modèle Flash dans Réglages, attendez demain, ou activez la facturation dans Google AI Studio.`
      : `Trop de demandes à Gemini (limite par minute)${wait ? ` : nouvel essai dans ${Math.ceil(wait)} s` : ''}.`, { status: 429, reason: 'quota', retryable: !daily, daily, wait });
  }
  if (res.status >= 500) return new GeminiError(`Gemini est surchargé (${res.status}). Nouvel essai…`, { status: res.status, reason: 'server', retryable: true });
  return new GeminiError(`Gemini a refusé la demande (${res.status}) : ${msg.slice(0, 300)}`, { status: res.status, reason: 'bad-request' });
}

async function call(key, path, { method = 'GET', body, signal, timeoutMs = 60000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(API + path, {
      method,
      headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) throw await toError(res, path.match(/models\/([^:/?]+)/)?.[1]);
    return res.status === 204 ? {} : await res.json();
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if (signal?.aborted) throw new GeminiError('Annulé.', { reason: 'abort' });
    if (ctrl.signal.aborted) throw new GeminiError('Gemini ne répond pas (délai dépassé).', { reason: 'timeout', retryable: true });
    throw new GeminiError('Réseau : impossible de joindre Gemini (' + (e.message || e) + ').', { reason: 'network', retryable: true });
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ---------- Modèles ---------- */
export async function listModels(key) {
  const out = [];
  let token = '';
  for (let i = 0; i < 5; i++) {
    const r = await call(key, `/v1beta/models?pageSize=200${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
    (r.models || []).forEach((m) => out.push(m));
    token = r.nextPageToken;
    if (!token) break;
  }
  return out
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name, input: m.inputTokenLimit || 0, output: m.outputTokenLimit || 0 }))
    .filter((m) => /^gemini/i.test(m.id) && !/(tts|image|embedding|live|native-audio|computer-use|robotics|aqa|veo|imagen)/i.test(m.id));
}

// Classe les modèles : version la plus récente d'abord, stable avant preview à version égale
export function rankModels(models) {
  const info = (id) => {
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(?:-(.+))?$/i);
    if (!m) {
      const alias = id.match(/^gemini-(pro|flash-lite|flash)-latest$/i);
      return alias ? { v: 0.5, tier: alias[1].toLowerCase(), stable: 1 } : null;
    }
    const suffix = m[3] || '';
    return { v: parseFloat(m[1]), tier: m[2].toLowerCase(), stable: !suffix || /^\d{3}$/.test(suffix) ? 2 : /preview/i.test(suffix) ? 1 : 0 };
  };
  const scored = models.map((m) => ({ ...m, info: info(m.id) })).filter((m) => m.info);
  scored.sort((a, b) => b.info.v - a.info.v || b.info.stable - a.info.stable || a.id.length - b.id.length);
  const best = (tier) => scored.find((m) => m.info.tier === tier)?.id || '';
  return { pro: best('pro'), flash: best('flash'), lite: best('flash-lite'), all: scored.map(({ info, ...m }) => m) };
}

/* ---------- Réponse → JSON ---------- */
export function parseJSONLoose(text) {
  if (text && typeof text === 'object') return text;
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const tryParse = (x) => { try { return JSON.parse(x); } catch (e) { return undefined; } };
  let v = tryParse(s);
  if (v !== undefined) return v;
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const body = s.slice(a, b + 1);
    v = tryParse(body) ?? tryParse(body.replace(/,\s*([}\]])/g, '$1'));
    if (v !== undefined) return v;
  }
  return undefined;
}

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

/* ---------- Génération ---------- */
// parts : [{ text } | { fileData: { fileUri, mimeType } } | { inlineData }]
export async function generate({ key, model, parts, system, schema, temperature = 0.7, maxOutputTokens = 32768, tools, mediaResolution, signal, timeoutMs = 300000, onRetry }) {
  if (!key) throw new GeminiError('Ajoutez votre clé Gemini dans Réglages (gratuite sur aistudio.google.com).', { reason: 'key' });
  if (!model) throw new GeminiError('Aucun modèle Gemini choisi : ouvrez Réglages et cliquez « Tester la clé ».', { reason: 'model' });
  let useSchema = !!schema && !(tools && tools.length);
  let maxTok = maxOutputTokens;
  for (let attempt = 0; attempt < 4; attempt++) {
    const generationConfig = { temperature, maxOutputTokens: maxTok };
    if (useSchema) { generationConfig.responseMimeType = 'application/json'; generationConfig.responseSchema = schema; }
    if (mediaResolution) generationConfig.mediaResolution = mediaResolution;
    const body = { contents: [{ role: 'user', parts }], generationConfig, safetySettings: SAFETY };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (tools && tools.length) body.tools = tools;
    let r;
    try {
      r = await call(key, `/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body, signal, timeoutMs });
    } catch (e) {
      // modèle ancien : limite de sortie plus basse, ou schéma refusé → on réessaie sans
      if (e.status === 400 && /max_?output_?tokens|maxOutputTokens/i.test(e.message) && maxTok > 8192) { maxTok = 8192; continue; }
      if (e.status === 400 && useSchema && /schema|response_?mime|responseSchema/i.test(e.message)) { useSchema = false; continue; }
      if (e.retryable && attempt < 3 && !signal?.aborted) {
        const wait = e.wait ? Math.min(65, e.wait + 1) * 1000 : 3000 * (attempt + 1);
        onRetry?.(e, wait);
        await sleep(wait);
        continue;
      }
      throw e;
    }
    if (r.promptFeedback?.blockReason) throw new GeminiError(`Gemini a bloqué la demande (${r.promptFeedback.blockReason}).`, { reason: 'blocked' });
    const cand = r.candidates?.[0];
    if (!cand) throw new GeminiError('Réponse vide de Gemini.', { reason: 'empty', retryable: true });
    const text = (cand.content?.parts || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    const json = parseJSONLoose(text);
    if (cand.finishReason === 'SAFETY' && !text) throw new GeminiError('Gemini a bloqué la réponse (filtre de sécurité).', { reason: 'blocked' });
    if ((schema && json === undefined) && attempt < 2) {
      // réponse coupée (MAX_TOKENS) ou pas en JSON : on redemande une fois
      onRetry?.(new GeminiError('Réponse incomplète, nouvelle demande…'), 0);
      if (cand.finishReason === 'MAX_TOKENS') maxTok = Math.min(65536, maxTok * 2);
      continue;
    }
    return {
      text,
      json,
      finishReason: cand.finishReason,
      usage: r.usageMetadata || {},
      grounding: cand.groundingMetadata || null
    };
  }
  throw new GeminiError('Gemini n\'a pas renvoyé de JSON valide. Réessayez ou changez de modèle.', { reason: 'json' });
}

/* ---------- Fichiers (vidéo / audio) ---------- */
// Envoi « resumable » en 2 temps ; XHR dans les pages pour suivre la progression
export async function uploadFile({ key, blob, mimeType, displayName, onProgress, signal }) {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(blob.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: String(displayName || 'tubepilot').slice(0, 120) } }),
    signal
  }).catch((e) => { throw new GeminiError('Réseau : envoi du fichier impossible (' + e.message + ').', { reason: 'network' }); });
  if (!start.ok) throw await toError(start);
  const url = start.headers.get('x-goog-upload-url');
  if (!url) throw new GeminiError('Google n\'a pas ouvert l\'envoi du fichier (URL manquante).', { reason: 'upload' });

  if (typeof XMLHttpRequest === 'undefined') {
    const res = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: blob, signal });
    if (!res.ok) throw await toError(res);
    return (await res.json()).file;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).file); } catch (e) { reject(new GeminiError('Réponse d\'envoi illisible.', { reason: 'upload' })); }
      } else reject(new GeminiError(`Envoi du fichier refusé (${xhr.status}).`, { status: xhr.status, reason: 'upload' }));
    };
    xhr.onerror = () => reject(new GeminiError('Réseau : envoi du fichier interrompu.', { reason: 'network' }));
    signal?.addEventListener('abort', () => { xhr.abort(); reject(new GeminiError('Annulé.', { reason: 'abort' })); }, { once: true });
    xhr.send(blob);
  });
}

export const getFile = (key, name) => call(key, `/v1beta/${name}`);

export async function deleteFile(key, name) {
  try { await call(key, `/v1beta/${name}`, { method: 'DELETE' }); return true; } catch (e) { return false; }
}

// Les vidéos sont traitées par Google avant d'être lisibles (état PROCESSING → ACTIVE)
export async function waitActive(key, file, { signal, onTick, timeoutMs = 15 * 60000 } = {}) {
  const t0 = Date.now();
  let f = file;
  while (f.state === 'PROCESSING' || !f.state) {
    if (signal?.aborted) throw new GeminiError('Annulé.', { reason: 'abort' });
    if (Date.now() - t0 > timeoutMs) throw new GeminiError('Google traite encore la vidéo (plus de 15 min). Réessayez plus tard ou utilisez le mode « audio ».', { reason: 'timeout' });
    onTick?.(Date.now() - t0);
    await sleep(2500);
    f = await getFile(key, f.name);
  }
  if (f.state !== 'ACTIVE') throw new GeminiError(`Google n'a pas pu lire ce fichier (${f.state}${f.error?.message ? ' : ' + f.error.message : ''}).`, { reason: 'file' });
  return f;
}
