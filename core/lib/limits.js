// ════════════════════════════════════════════════════════════════════
//  limits.js — Límites de concurrencia para trabajo pesado (Bloque B.6)
//
//  Reutiliza el semáforo global de `#lib/humanize` (adquirir) pero con una
//  API más cómoda para envolver el cuerpo de un comando sin re-indentar todo.
//
//  Uso en un comando:
//    import { withLimit } from '#lib/limits'
//    ...
//    run: async (ctx) => {
//      return withLimit('media', 3, async () => {
//        // ...cuerpo original...
//      })
//    }
//
//  Si el semáforo está lleno, lanza un error con `.semaforo = true` (igual
//  que `adquirir`). El comando puede detectarlo con `if (e?.semaforo)` para
//  responder "espera un momento" en vez de un error interno.
//
//  Claves sugeridas:
//   · 'descargas'  → descarga de archivos (ya usada en ytdlp/ytmp3/benchdl)
//   · 'media'      → procesamiento pesado de imágenes/videos (stickers, upscale)
//   · 'api'        → llamadas lentas a APIs externas
// ════════════════════════════════════════════════════════════════════

import { adquirir } from '#lib/humanize';
import { userError } from '#lib/errors';

// Ejecuta `fn` bajo un semáforo `key` con máximo `max` concurrentes.
// Asegura SIEMPRE liberar el recurso, incluso si `fn` lanza.
// Si el semáforo está lleno, lanza un **error de usuario** (mensaje limpio
// "espera un momento") en vez de un error interno → el despachador lo muestra
// tal cual sin filtros técnicos.
export async function withLimit(key, max, fn) {
  let liberar;
  try {
    liberar = await adquirir(key, max);
  } catch (e) {
    if (e?.semaforo) throw userError('⏳ Hay demasiadas tareas pesadas en curso. Espera un momento e inténtalo de nuevo.');
    throw e;
  }
  try {
    return await fn();
  } finally {
    liberar();
  }
}

// Atajo: ¿el error es "semáforo lleno"?
export function isLimitError(e) {
  return !!(e && e.semaforo === true);
}
