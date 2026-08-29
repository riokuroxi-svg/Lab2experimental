// ════════════════════════════════════════════════════════════════════
//  diagnostics.js — Utilidades de salud y registro de errores (Lab2)
//
//  Propósito: darle al comando `.health` / `.statsbot` datos reales de
//  RAM, uptime, estado de yt-dlp/ffmpeg y un listado de los últimos
//  errores. NO cambia el comportamiento del bot: solo guarda en memoria.
//
//  Seguridad:
//   · Es 100% aditivo. No toca index.js ni main.js (archivos protegidos).
//   · El "recorder" de procesos solo AÑADE a una lista en memoria. No
//     llama a process.exit, no suprime errores ni altera la lógica del
//     supervisor existente (processGuard en index.js sigue mandando).
//   · Buffer acotado (máx. MAX_ERRORS) para no acumular memoria.
// ════════════════════════════════════════════════════════════════════

const MAX_ERRORS = 20;
const errors = [];
let recorderInstalled = false;

function push(level, scope, message) {
  if (typeof message !== 'string' || !message.trim()) return;
  errors.push({ level, scope, message, ts: Date.now() });
  if (errors.length > MAX_ERRORS) errors.shift();
}

// Registra un error técnico interno (para mostrarlo en .health)
export function logBotError(scope, err, level = 'technical') {
  const raw = err && (err.stack || err.message) ? null : err;
  const message = raw ? String(raw) : (err?.stack || err?.message || String(err));
  push(level, scope, message);
}

// Devuelve los últimos N errores, del más reciente al más viejo
export function getBotErrors(n = 10) {
  return errors.slice(-n).reverse();
}

// Borra el historial (lo usa .health clear)
export function clearBotErrors() {
  errors.length = 0;
}

export function getBotErrorCount() {
  return errors.length;
}

// Escucha pasiva de errores no capturados para que .health los muestre.
// Registrado una sola vez (guard). Solo guarda: no toca el flujo de
// errores del bot, que sigue controlado por index.js / processGuard.
export function installPassiveErrorRecorder() {
  if (recorderInstalled) return;
  recorderInstalled = true;
  process.on('uncaughtException', (e) => {
    try { push('technical', 'uncaughtException', e?.stack || e?.message || String(e)); } catch {}
  });
  process.on('unhandledRejection', (r) => {
    try { push('technical', 'unhandledRejection', r?.stack || r?.message || String(r)); } catch {}
  });
}

// Formatea segundos a "Xd Yh Zm Ws" (parecido al resto del bot)
export function formatUptime(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

// Trunca un stack largo para que el mensaje no se haga enorme
export function truncateError(text, max = 240) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}
