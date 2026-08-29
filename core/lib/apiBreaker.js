// ════════════════════════════════════════════════════════════════════
//  apiBreaker.js — Circuit breaker para APIs externas (Bloque B.7)
//
//  Problema: si una API externa se cae, el bot intenta repetir una y otra
//  vez (timeouts, reintentos) sin avisar al usuario. Eso genera spam de
//  errores y el bot queda "vivo pero roto".
//
//  Solución (patrón estándar): cortocircuito por servicio.
//   · CLOSED   → se llama a la API normal. Si falla N veces seguidas,
//                se pasa a OPEN.
//   · OPEN     → NO se llama a la API; se devuelve un aviso claro y se
//                reinicia el temporizador de espera.
//   · HALF-OPEN→ tras el cooldown, se permite una llamada de prueba.
//                Si funciona → CLOSED; si falla → OPEN de nuevo.
//
//  Uso (ejemplo en un comando):
//    import { runGuarded } from '#lib/apiBreaker'
//    ...
//    const data = await runGuarded('carbon', async () => {
//      const res = await axios.post(URL, body)
//      return res.data
//    })
//
//  Cuando el circuito está abierto, `runGuarded` lanza un **UserError** con
//  un mensaje amable (el despachador lo muestra tal cual). Los errores de
//  usuario lanzados DENTRO de la función (p. ej. «falta texto») NO cuentan
//  como fallos de la API.
//
//  Para ver/restablecer: `getBreakerStatus()`, `resetBreaker(name)`.
// ════════════════════════════════════════════════════════════════════

import { userError, isUserError } from '#lib/errors';

const registry = new Map();

const DEFAULTS = { threshold: 3, cooldownMs: 60 * 1000 };

function entry(service) {
  if (!registry.has(service)) {
    registry.set(service, {
      service,
      state: 'closed',      // closed | open | half-open
      failures: 0,
      since: Date.now(),
      openUntil: 0,
      lastError: '',
      calls: 0,
    });
  }
  return registry.get(service);
}

function busyMessage(service) {
  return `⚠️ El servicio *${service}* está temporalmente pausado por fallos repetidos.\n> Espera un momento e inténtalo de nuevo; el bot reintentará automáticamente.`;
}

// Ejecuta `fn` bajo el cortocircuito del servicio `service`.
export async function runGuarded(service, fn, opts = {}) {
  const threshold = opts.threshold ?? DEFAULTS.threshold;
  const cooldown = opts.cooldownMs ?? DEFAULTS.cooldownMs;
  const st = entry(service);
  const now = Date.now();

  // Circuito abierto: no llamar a la API.
  if (st.state === 'open') {
    if (now < st.openUntil) throw userError(busyMessage(service));
    // Pasó el cooldown → permitir una llamada de prueba.
    st.state = 'half-open';
  }

  try {
    const result = await fn();
    st.calls++;
    st.state = 'closed';
    st.failures = 0;
    st.openUntil = 0;
    st.lastError = '';
    return result;
  } catch (e) {
    // Los errores de usuario (datos inválidos, permisos...) no son fallos
    // de la API → no cuentan para abrir el circuito.
    if (isUserError(e)) throw e;

    st.calls++;
    st.failures += 1;
    st.lastError = String(e?.message || e).slice(0, 160);
    if (st.state === 'half-open' || st.failures >= threshold) {
      st.state = 'open';
      st.openUntil = now + cooldown;
    }
    throw e;
  }
}

// Estado de todos los servicios (para .health o un comando de diagnóstico).
export function getBreakerStatus() {
  const now = Date.now();
  return [...registry.values()].map((s) => ({
    service: s.service,
    state: s.state,
    failures: s.failures,
    calls: s.calls,
    error: s.lastError,
    retryInMs: s.state === 'open' && s.openUntil > now ? s.openUntil - now : 0,
  }));
}

// Restablece un servicio (o todos si no se pasa nombre).
export function resetBreaker(name) {
  if (name) {
    const found = registry.get(name);
    if (found) {
      found.state = 'closed';
      found.failures = 0;
      found.openUntil = 0;
      found.lastError = '';
    }
    return !!found;
  }
  registry.clear();
  return true;
}

// Solo para pruebas.
export function __reset() { registry.clear(); }
