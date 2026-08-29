// ════════════════════════════════════════════════════════════════════
//  cooldowns.js — Cooldowns por comando (adaptado de Ruby-Hoshino-Bot)
//
//  Sin dependencias (Map en memoria, como limits.js). Evita que un usuario
//  spamee un comando: si lo vuelve a usar dentro del intervalo, se le dice
//  cuánto falta con un mensaje bonito ("espera 1 minuto y 30 segundos").
//
//  Uso en un comando:
//    run: async (ctx) => {
//      const cd = claimCooldown(ctx.command, ctx.sender, 60000)
//      if (!cd.allowed) return msg.reply(await buildCooldownNotice(cd))
//      ...
//    }
//
//  O de forma declarativa en la definición del comando:
//    export default { command: ['xp'], cooldown: 30_000, run: ... }
//    → el despachador (main.js) puede aplicar el cooldown automáticamente.
// ════════════════════════════════════════════════════════════════════

// Registro en memoria: clave (comando + sender) → ts de expiración
const cooldowns = new Map();
const KEY_SEP = '\u0000';

// Limpieza perezosa: borra claves vencidas (se llama al escribir).
function prune() {
  const now = Date.now();
  for (const [key, until] of cooldowns) {
    if (until <= now) cooldowns.delete(key);
  }
}

function keyFor(commands, sender = '') {
  let c = Array.isArray(commands) ? commands[0] || '' : (commands || '');
  if (Array.isArray(commands)) c = commands[0] || '';
  return `${String(c).toLowerCase()}${KEY_SEP}${String(sender || '').toLowerCase()}`;
}

// Lee el cooldown declarado en un plugin/comando (en ms). Devuelve 0 si no hay.
export function resolveCooldownMs(plugin = {}) {
  const raw = plugin?.cooldown ?? plugin?.cooldownMs ?? plugin?.cooldownTime ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Devuelve el nombre canónico (primer alias) de un comando.
export function getCanonicalCommand(plugin = {}, fallback = '') {
  if (Array.isArray(plugin?.command)) return plugin.command[0];
  if (typeof plugin?.command === 'string') return plugin.command;
  return fallback;
}

// Formatea un intervalo de ms a texto legible ("1 minuto y 30 segundos").
export function formatCooldown(ms = 0) {
  const total = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h) parts.push(`*${h}* hora${h === 1 ? '' : 's'}`);
  if (m) parts.push(`*${m}* minuto${m === 1 ? '' : 's'}`);
  if (s || !parts.length) parts.push(`*${s}* segundo${s === 1 ? '' : 's'}`);
  return parts.join(' y ');
}

// ¿Cuánto falta (ms) para que `commands`+`sender` salga de cooldown? 0 si ya puede.
export function peekCooldownMs(commands = [], sender = '', _now = Date.now()) {
  const k = keyFor(commands, sender);
  const until = cooldowns.get(k);
  if (until === undefined) return 0;
  return Math.max(0, until - _now);
}

// Intenta "reservar" el cooldown. Devuelve { allowed, remainingMs, keys }.
// allowed=false también expone remainingMs y seconds para un mensaje.
export function claimCooldown(commands = [], sender = '', cooldownMs = 0) {
  if (!commands || !commands.length || !cooldownMs || cooldownMs <= 0) {
    return { allowed: true, claimed: false, keys: [], remainingMs: 0, seconds: 0 };
  }
  prune();
  const cds = Array.isArray(commands) ? commands : [commands];
  const safeSender = String(sender || '').toLowerCase();
  const now = Date.now();
  const keys = [];
  // Comprobamos TODOS los aliases: si cualquiera está en cooldown, bloquea.
  for (const c of cds) {
    const k = `${String(c).toLowerCase()}${KEY_SEP}${safeSender}`;
    keys.push(k);
    const until = cooldowns.get(k);
    if (until !== undefined && until > now) {
      return { allowed: false, claimed: false, keys, remainingMs: until - now, seconds: Math.ceil((until - now) / 1000) };
    }
  }
  // Ninguno en cooldown → reservamos todos por cooldownMs.
  for (const k of keys) cooldowns.set(k, now + cooldownMs);
  return { allowed: true, claimed: true, keys, remainingMs: 0, seconds: 0 };
}

// Libera (o limpia) uno o varios cooldown ya reservados.
export function releaseCooldown(keysOrState = []) {
  const keys = Array.isArray(keysOrState)
    ? keysOrState
    : (keysOrState?.keys || []);
  for (const k of keys) cooldowns.delete(k);
  return true;
}

// Borra el cooldown de un comando para un sender (o de todos si no se pasa sender).
export function clearCooldownFor(commands = [], sender = '') {
  prune();
  const cds = Array.isArray(commands) ? commands : [commands];
  const safeSender = String(sender || '').toLowerCase();
  if (!safeSender) {
    // Borra todos los del comando (cualquier sender).
    for (const c of cds) {
      const prefix = `${String(c).toLowerCase()}${KEY_SEP}`;
      for (const k of cooldowns.keys()) if (k.startsWith(prefix)) cooldowns.delete(k);
    }
    return true;
  }
  for (const c of cds) cooldowns.delete(`${String(c).toLowerCase()}${KEY_SEP}${safeSender}`);
  return true;
}

// Helper para construir el aviso de cooldown que lee el usuario.
export function buildCooldownNotice(cd = {}, prefix = '') {
  const who = cd.seconds === 1 ? 'segundo' : 'segundos';
  return `> ⏳ Espera *${formatCooldown(cd.remainingMs)}* antes de usar este comando de nuevo.`;
}

export default {
  resolveCooldownMs,
  getCanonicalCommand,
  formatCooldown,
  peekCooldownMs,
  claimCooldown,
  releaseCooldown,
  clearCooldownFor,
  buildCooldownNotice,
};
