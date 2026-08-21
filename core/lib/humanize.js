// ════════════════════════════════════════════════════════════
//  humanize.js — Comportamiento "humano" del bot (anti-ban real)
//
//  Basado en lo que SÍ importa de la comunidad (Baileys discussions,
//  baileys-antiban) para un bot de comandos:
//   1. Los clientes reales no disparan ráfagas sin pausa → espaciamos
//      los envíos consecutivos al mismo chat (jitter).
//   2. El "escribiendo..." (composing) se abre ANTES de responder y se
//      cierra con "paused" después — como la app oficial.
//   3. Marcar mensajes como leídos es comportamiento de cliente normal
//      (se hace en main.js para TODOS los mensajes).
//   4. Semáforo de descargas: evita saturar CPU/RAM con N descargas a
//      la vez (el bot deja de responder = peor señal que un delay).
//
//  Lo que NO hacemos (mitos/contraproducente):
//   - IDs dinámicos de botones: los taps ya llegan con contextInfo.
//     stanzaId; mezclar número+Date.now() no cambia nada para WA.
//   - Retrasos fijos de 3-5 s: dañan la UX y WA no mide "lo humano"
//     con un cronómetro; el riesgo real son las RÁFAGAS de envío.
//   - Variar contenido con caracteres invisibles (baileys-antiban):
//     eso es evasión de detección de spam — no lo queremos.
//
//  Variables .env (todas opcionales):
//   GINKO_ANTIBAN=off            → desactiva ritmo y retraso humano
//   GINKO_HUMAN_DELAY_MS=1200    → retraso aleatorio máximo (ms) antes
//                                  de responder (0-5000)
//   GINKO_HUMAN_PACE_MS=600      → espacio mínimo entre envíos
//                                  consecutivos al mismo chat (0-3000)
// ════════════════════════════════════════════════════════════

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const antibanOn = (process.env.GINKO_ANTIBAN || 'on').toLowerCase() !== 'off'
const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
const maxDelayMs = clamp(parseInt(process.env.GINKO_HUMAN_DELAY_MS || '1200', 10) || 1200, 0, 5000)
const paceMs = clamp(parseInt(process.env.GINKO_HUMAN_PACE_MS || '600', 10) || 600, 0, 3000)
const jitter = (max) => Math.floor(Math.random() * (max + 1))

export const humanizeConfig = { antibanOn, maxDelayMs, paceMs }

// ── Ritmo por chat ──────────────────────────────────────────
// Espacia los envíos consecutivos al MISMO chat. El primer mensaje de
// un chat sale inmediato; los siguientes esperan pace+jitter (máx 2.5s
// para no colgar nunca). Chats distintos no se bloquean entre sí.
const lastSend = new Map()
export async function ritmoHumano(chatJid) {
  if (!antibanOn || !paceMs || !chatJid) return
  const now = Date.now()
  const next = Math.max(now, (lastSend.get(chatJid) || 0) + paceMs + jitter(paceMs))
  lastSend.set(chatJid, next)
  const wait = next - now
  if (wait > 0) await dormir(Math.min(wait, 2500))
}

// ── Flujo de presencia ──────────────────────────────────────
// composing → retraso aleatorio (como quien escribe) → acción → paused.
// Si la acción lanza error, igual se cierra la presencia.
export async function flujoPresencia(sock, chat, accion) {
  if (!antibanOn || !sock || !chat) return accion()
  try { await sock.sendPresenceUpdate('composing', chat) } catch {}
  const delay = maxDelayMs ? jitter(maxDelayMs) : 0
  if (delay) await dormir(delay)
  try {
    return await accion()
  } finally {
    try { await sock.sendPresenceUpdate('paused', chat) } catch {}
  }
}

// ── Semáforo global ─────────────────────────────────────────
// Limita tareas pesadas concurrentes (descargas). Si está lleno,
// lanza un error con flag .semaforo para que el comando responda
// amable ("espera un momento") en vez de acumular trabajo.
// Aplica SIEMPRE (protege recursos, no es cosmético).
const activos = new Map()
export async function semaforo(clave, max, accion) {
  const liberar = await adquirir(clave, max)
  try {
    return await accion()
  } finally {
    liberar()
  }
}

// Variante manual: devuelve una función liberar() o lanza { semaforo: true }.
// Útil para envolver cuerpos de comando grandes sin re-indentar todo.
export async function adquirir(clave, max) {
  const actual = activos.get(clave) || 0
  if (actual >= max) {
    const err = new Error('Semáforo lleno')
    err.semaforo = true
    throw err
  }
  activos.set(clave, actual + 1)
  let liberado = false
  return () => {
    if (liberado) return
    liberado = true
    const resta = (activos.get(clave) || 1) - 1
    if (resta <= 0) activos.delete(clave)
    else activos.set(clave, resta)
  }
}
