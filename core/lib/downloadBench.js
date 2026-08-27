import { performance } from 'node:perf_hooks';

export function normalizeBenchmarkMode(mode = 'fast') {
  const raw = String(mode || 'fast').trim().toLowerCase();
  if (['mp3', '320', '320k', 'alta'].includes(raw)) return 'mp3';
  if (['normal', '128', '128k', 'medio'].includes(raw)) return 'normal';
  return 'fast';
}

export function isYouTubeUrl(url = '') {
  return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+/i.test(String(url || '').trim());
}

export function getYouTubeVideoId(input = '') {
  const raw = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}


export function validateBenchUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return { ok: false, reason: 'Falta la URL de YouTube.' };
  if (!/^https?:\/\//i.test(raw)) return { ok: false, reason: 'La URL debe empezar con http:// o https://.' };
  if (!isYouTubeUrl(raw)) return { ok: false, reason: 'Solo se aceptan enlaces de YouTube para este benchmark.' };
  if (/VIDEO_ID/i.test(raw)) return { ok: false, reason: 'Ese es el ejemplo literal. Reemplaza VIDEO_ID por un enlace real de YouTube.' };
  const videoId = getYouTubeVideoId(raw);
  if (!videoId) return { ok: false, reason: 'No pude detectar un ID válido de YouTube. Debe tener 11 caracteres.' };
  return { ok: true, videoId, url: raw };
}

export function formatMs(ms = 0) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`;
}

export function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export async function measureStep(label, fn) {
  const started = performance.now();
  try {
    const value = await fn();
    return {
      label,
      ok: true,
      ms: performance.now() - started,
      value,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      ms: performance.now() - started,
      error: error?.message || String(error),
    };
  }
}

export function renderBenchReport({ url, mode, steps = [], audioBytes = 0, mp3Valid = false, title = '' } = {}) {
  const lines = [
    '🧪 *BenchDL · Lab2*',
    '',
    `• Modo: *${mode || 'fast'}*`,
    title ? `• Título: ${title}` : null,
    `• URL: ${url}`,
    '',
    '*Tiempos:*',
    ...steps.map((step) => {
      const status = step.ok ? '✅' : '❌';
      const extra = step.ok ? '' : ` — ${String(step.error || '').slice(0, 120)}`;
      return `${status} ${step.label}: *${formatMs(step.ms)}*${extra}`;
    }),
    '',
    audioBytes ? `• Audio descargado: *${formatBytes(audioBytes)}*` : null,
    audioBytes ? `• MP3 válido: *${mp3Valid ? 'sí' : 'no'}*` : null,
    '',
    '_No envía archivo: solo mide para no tocar .play/.mp3._',
  ].filter(Boolean);
  return lines.join('\n');
}
