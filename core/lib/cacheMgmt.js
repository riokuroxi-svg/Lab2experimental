// ════════════════════════════════════════════════════════════════════
//  cacheMgmt.js — Gestión de caché en disco (Bloque B.5)
//
//  El bot guarda varios cachés en disco. Este módulo los enumera y los
//  limpia de forma SEGURA (nunca borra los assets de media/ que son parte
//  del bot, ni la sesión ni la base de datos).
//
//  Directorios de caché conocidos:
//   · tmp/                      → archivos temporales (borrado horario en index.js)
//   · media/cache-ytdlp         → caché de audio/video de ytdlp (.ytdlp)
//   · cache/play-audio          → caché MP3 de .play/.mp3
//
//  ATENCIÓN: `media/` contiene ASSETS del bot (menu.jpg, audio-cover.jpg,
//  code-banner.jpg). NUNCA se vacía completo; solo la subcarpeta cache-ytdlp.
// ════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const root = process.cwd();

// Especificación de los cachés conocidos. `base` es relativo a la raíz.
export const CACHE_DIRS = [
  { key: 'tmp', name: 'Temp', base: path.join(root, 'tmp'), kind: 'temp' },
  { key: 'ytdlp', name: 'yt-dlp', base: path.join(root, 'media', 'cache-ytdlp'), kind: 'download' },
  { key: 'play', name: 'Play/MP3', base: path.join(root, 'cache', 'play-audio'), kind: 'download' },
];

// Formatea bytes a humano (KB/MB/GB), igual que el resto del bot.
export function formatBytes(bytes = 0) {
  if (!bytes || Number.isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(bytes);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function dirSize(dir) {
  let total = 0;
  let files = 0;
  try {
    if (!fs.existsSync(dir)) return { size: 0, files: 0 };
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, entry.name);
        try {
          if (entry.isDirectory()) stack.push(full);
          else {
            const st = fs.statSync(full);
            if (st.isFile()) { total += st.size; files++; }
          }
        } catch { /* un archivo en uso no debe tumbar el comando */ }
      }
    }
  } catch { /* dir no accesible */ }
  return { size: total, files };
}

// Escanea todos los cachés conocidos y devuelve su estado + total.
export function scanCaches() {
  const items = CACHE_DIRS.map((c) => {
    const { size, files } = dirSize(c.base);
    return { ...c, size, files, exists: fs.existsSync(c.base) };
  });
  const totalSize = items.reduce((s, c) => s + c.size, 0);
  const totalFiles = items.reduce((s, c) => s + c.files, 0);
  return { items, totalSize, totalFiles };
}

// Limpia un caché específico por su `key` (tmp|ytdlp|play).
// Devuelve cuántos bytes se liberaron. Es defensivo: nunca lanza.
export function clearCacheDir(key) {
  const spec = CACHE_DIRS.find((c) => c.key === key);
  if (!spec) return { ok: false, freed: 0, error: `Caché desconocido: ${key}` };
  const before = dirSize(spec.base);
  try {
    if (!fs.existsSync(spec.base)) return { ok: true, freed: 0 };
    for (const entry of fs.readdirSync(spec.base, { withFileTypes: true })) {
      const full = path.join(spec.base, entry.name);
      try {
        if (entry.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
        else fs.unlinkSync(full);
      } catch { /* mantener limpio: si falla uno, seguimos */ }
    }
    return { ok: true, freed: before.size };
  } catch (e) {
    return { ok: false, freed: 0, error: e.message };
  }
}

// Limpia TODOS los cachés conocidos (temp + descargas). No toca assets de media/.
export function clearAllCaches() {
  let totalFreed = 0;
  const results = {};
  for (const c of CACHE_DIRS) {
    const r = clearCacheDir(c.key);
    totalFreed += r.freed || 0;
    results[c.key] = r;
  }
  return { ok: true, totalFreed, results };
}

// Comprueba si hay cachés por encima de un umbral (por si se quiere avisar).
export function overLimit(limitBytes) {
  const { totalSize } = scanCaches();
  return { over: totalSize > limitBytes, totalSize, limitBytes };
}
