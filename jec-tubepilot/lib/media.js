// JEC TubePilot — préparation du média sur l'ordinateur : durée, format, extraction audio (WAV 16 kHz mono) et tempo (BPM)

const GEMINI_VIDEO = /^video\/(mp4|mpeg|mov|quicktime|avi|x-msvideo|x-flv|mpg|webm|wmv|x-ms-wmv|3gpp)$/i;
const GEMINI_AUDIO = /^audio\/(wav|x-wav|mp3|mpeg|aiff|x-aiff|aac|ogg|flac|x-flac|mp4|m4a|x-m4a|webm)$/i;
const EXT_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/avi', wmv: 'video/wmv', mpeg: 'video/mpeg', mpg: 'video/mpeg', '3gp': 'video/3gpp', flv: 'video/x-flv', mkv: 'video/x-matroska', mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/m4a', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', aiff: 'audio/aiff' };

export function mimeOf(file) {
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  let type = file.type || EXT_MIME[ext] || '';
  if (type === 'video/quicktime') type = 'video/mov';
  if (type === 'audio/mpeg') type = 'audio/mp3';
  return type;
}

export const isAudio = (file) => /^audio\//.test(mimeOf(file));
export const geminiReadable = (file) => GEMINI_VIDEO.test(mimeOf(file)) || GEMINI_AUDIO.test(mimeOf(file));

// Durée et orientation (lecture des métadonnées uniquement)
export function probe(file, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(isAudio(file) ? 'audio' : 'video');
    const done = (r) => { clearTimeout(t); URL.revokeObjectURL(url); el.removeAttribute('src'); resolve(r); };
    const t = setTimeout(() => done({ duration: 0, width: 0, height: 0 }), timeoutMs);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => done({ duration: Number.isFinite(el.duration) ? el.duration : 0, width: el.videoWidth || 0, height: el.videoHeight || 0 });
    el.onerror = () => done({ duration: 0, width: 0, height: 0 });
    el.src = url;
  });
}

// Décode la piste audio (mp4, webm, mov, mp3, wav…) directement à 16 kHz pour limiter la mémoire
export async function decodeAudio(file, maxBytes = 450 * 1024 * 1024) {
  if (file.size > maxBytes) throw new Error('Fichier trop lourd pour extraire l\'audio sur l\'ordinateur.');
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
}

// AudioBuffer → mono 16 kHz (Float32Array)
export async function toMono16k(buf, maxSeconds = 3 * 3600) {
  const sr = 16000;
  const dur = Math.min(buf.duration, maxSeconds);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * sr)), sr);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, 0, dur);
  return (await off.startRendering()).getChannelData(0);
}

export function wavBlob(samples, sr = 16000) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([view.buffer], { type: 'audio/wav' });
}

// Tempo par autocorrélation de l'enveloppe d'attaques (mono 16 kHz), sur 60 s au milieu du morceau
export function estimateBpm(samples, sr = 16000) {
  const len = samples.length;
  if (len < sr * 8) return null;
  const win = Math.min(len, sr * 60);
  const start = Math.max(0, Math.floor((len - win) / 3));
  const hop = 128, frame = 512;
  const fps = sr / hop;
  const env = [];
  let prev = 0;
  for (let i = start; i + frame < start + win; i += hop) {
    let e = 0;
    for (let j = 0; j < frame; j++) { const x = samples[i + j]; e += x * x; }
    const le = Math.log(1e-9 + e);
    env.push(Math.max(0, le - prev));
    prev = le;
  }
  // lissage de l'enveloppe : un battement qui tombe entre deux trames reste corrélé
  const k = [0.06, 0.24, 0.4, 0.24, 0.06];
  const sm = env.map((_, i) => k.reduce((s, w, j) => s + w * (env[i + j - 2] || 0), 0));
  const mean = sm.reduce((a, b) => a + b, 0) / sm.length;
  const o = sm.map((x) => x - mean);
  const ac = (lag) => {
    const L = Math.floor(lag), f = lag - L;
    let a = 0, b = 0;
    for (let i = 0; i + L + 1 < o.length; i++) { a += o[i] * o[i + L]; b += o[i] * o[i + L + 1]; }
    return (a * (1 - f) + b * f) / Math.max(1, o.length - L);
  };
  let best = { bpm: 0, score: -Infinity };
  const scores = [];
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (60 * fps) / bpm;
    // la période double doit aussi corréler (évite de prendre la moitié du tempo)
    const s = ac(lag) + 0.5 * ac(lag * 2);
    // préférence douce autour de 115 BPM (tempo perçu le plus courant)
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 1.1, 2));
    const sc = s * w;
    scores.push(sc);
    if (sc > best.score) best = { bpm, score: sc };
  }
  if (!best.bpm || best.score <= 0) return null;
  const sorted = [...scores].sort((a, b) => b - a);
  const confidence = sorted.length > 10 ? Math.max(0, Math.min(1, 1 - sorted[10] / sorted[0])) : 0.5;
  // ambiguïté d'octave (85 ↔ 170) : on propose aussi l'autre lecture
  const alt = best.bpm < 95 ? Math.round(best.bpm * 2) : best.bpm > 160 ? Math.round(best.bpm / 2) : null;
  return { bpm: Math.round(best.bpm), alt, confidence: Math.round(confidence * 100) / 100 };
}

// Prépare le média pour Gemini selon le mode : 'audio' (WAV léger), 'video' (fichier tel quel) ou 'auto'
export async function prepare(file, { mode = 'auto', onStep } = {}) {
  const info = await probe(file);
  const mime = mimeOf(file);
  const audioOnly = isAudio(file);
  let wantAudio = mode === 'audio' || audioOnly;
  // décoder l'audio d'une très longue vidéo saturerait la mémoire : on envoie alors la vidéo (résolution réduite)
  const decodable = file.size <= 450 * 1024 * 1024 && (info.duration ? info.duration <= 40 * 60 : file.size <= 150 * 1024 * 1024);
  if (mode === 'auto' && !audioOnly) wantAudio = !geminiReadable(file) || file.size > 1.5 * 1024 ** 3;
  if (wantAudio && !decodable && geminiReadable(file)) wantAudio = false;
  let samples = null, bpm = null;
  // extraction locale : pour le mode audio, ou pour mesurer le tempo si le fichier est léger
  if (decodable && (wantAudio || file.size <= 300 * 1024 * 1024)) {
    try {
      onStep?.('decode');
      const buf = await decodeAudio(file);
      samples = await toMono16k(buf);
      bpm = estimateBpm(samples);
      if (!info.duration) info.duration = buf.duration;
    } catch (e) {
      if (wantAudio && !geminiReadable(file)) throw new Error('Format non lu par Chrome ni par Gemini : exportez la vidéo en MP4 ou l\'audio en MP3/WAV.');
      wantAudio = false;
    }
  } else if (wantAudio && !geminiReadable(file)) {
    throw new Error('Fichier trop long ou trop lourd pour être converti : exportez l\'audio en MP3 (ou la vidéo en MP4) et réessayez.');
  }
  if (wantAudio && samples) {
    return { blob: wavBlob(samples), mime: 'audio/wav', kind: 'audio', info, bpm, displayName: file.name.replace(/\.[^.]+$/, '') + '.wav' };
  }
  if (!geminiReadable(file)) throw new Error(`Format « ${mime || file.name} » non accepté par Gemini : utilisez MP4, MOV, WEBM, MP3 ou WAV.`);
  return { blob: file, mime: mime.startsWith('audio/') || mime.startsWith('video/') ? mime : 'video/mp4', kind: audioOnly ? 'audio' : 'video', info, bpm, displayName: file.name };
}
