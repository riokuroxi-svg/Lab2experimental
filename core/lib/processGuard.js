// ════════════════════════════════════════════════════════════
//  processGuard.js — Decisión ante errores no controlados
//
//  Estrategia (estándar en bots):
//   · 1-2 errores no capturados en un minuto → solo registrar
//     (el proceso sobrevive a blips transitorios).
//   · 3+ en un minuto → señal de loop → salir con código 1 para
//     que el supervisor (pm2/docker/systemd) reinicie el bot limpio.
//     Así nunca queda un proceso "vivo pero roto".
// ════════════════════════════════════════════════════════════

const VENTANA_MS = 60 * 1000
const UMBRAL = 3
const historial = []

export function decidirAnteError() {
  const ahora = Date.now()
  while (historial.length && ahora - historial[0] > VENTANA_MS) historial.shift()
  historial.push(ahora)
  return historial.length >= UMBRAL ? 'exit' : 'log'
}

// Para pruebas / diagnóstico
export function resetHistorial() {
  historial.length = 0
}
