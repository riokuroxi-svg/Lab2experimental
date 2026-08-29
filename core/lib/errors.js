// ════════════════════════════════════════════════════════════════════
//  errors.js — Separación de errores de USUARIO vs TÉCNICOS (Bloque A.4)
//
//  Objetivo: cuando un comando falla, el mensaje que ve el usuario debe ser
//  claro si la culpa es de ÉL (dato mal escrito, sin permisos, formato
//  inválido...) y "razonable" si es un fallo INTERNO (API caída, bug...)
//  sin filtrar stacks ni tecnicismos a quien no es el dueño.
//
//  Uso para comandos registrados en cmds/:
//    import { userError } from '#lib/errors'
//    ...
//    if (!args[0]) return msg.reply(userError('Falta el enlace.'))
//    // o lanzar:
//    throw userError('El texto debe tener menos de 30 caracteres.')
//
//  Los errores lanzados así son "de usuario": se muestran tal cual.
//  Cualquier otra Exception que escape será tratada como error técnico.
// ════════════════════════════════════════════════════════════════════

export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
    this.isUserError = true;
  }
}

// Fabrica un error de usuario (mensaje seguro de mostrar tal cual).
export function userError(message) {
  return new UserError(message);
}

export function isUserError(e) {
  return !!(e && (e instanceof UserError || e.isUserError === true));
}

// ── Formateador central del despachador (main.js) ─────────────────────
// Toma un error y decide el texto a enviar. Los de usuario se muestran tal
// cual; los técnicos se registran y se resumen:
//   · al owner → detalle corto (para que pueda depurar).
//   · a los demás → mensaje genérico SIN stack/detalles.
import { logBotError, truncateError } from '#lib/diagnostics';

export function formatCommandError(e, command, { isOwner = false } = {}) {
  const name = String(command || 'comando');

  // Error de usuario → se muestra literalmente (ya es claro y seguro).
  if (isUserError(e)) {
    const msg = String(e.message || 'Dato inválido.').trim();
    return `《✧》 ${msg}`;
  }

  // Error técnico interno → se registra y se resume.
  logBotError(command || 'comando', e, 'technical');

  if (isOwner) {
    const detail = truncateError(e?.stack || e?.message || String(e), 260);
    return `> Ocurrió un *error interno* al ejecutar *${name}*.\n> [Detalle: *${detail}*]`;
  }

  return `> Ocurrió un *error interno* al ejecutar *${name}*. Por favor inténtalo de nuevo o contacta al creador del bot.`;
}
