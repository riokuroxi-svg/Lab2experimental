/**
 * Comando .twitter / .x — FUERA DE SERVICIO (por ahora).
 *
 * Estado (2026-08-28):
 *   - Los backends configurados en `global.APIs` para Twitter/X están caídos:
 *     · `api.delirius.*` → timeout de conexión.
 *     · `api.lempi.lat` (Ginko) → 401 (la key ya no es válida).
 *     · `api.zenzxz.my.id` → DNS no resuelve.
 *     · `api.ootaizumi.web.id` → 404 (deployment en Vercel eliminado).
 *     · `api.yuki-wabot.my.id` → 404 en el endpoint.
 *   - La Syndication API de X (sin auth) es la única vía estable, pero requiere
 *     scraping de cdn.syndication.twimg.com y suele bloquear IPs de centro de datos
 *     (no fiable en Termux). Se puede reactivar con un servidor/proxy dedicado.
 *
 * En lugar de dejar que el comando explote con errores crudos de la API, se
 * muestra un mensaje claro (patrón igual que .pinterest).
 */
export default {
  command: ['twitter', 'x'],
  category: 'downloads',
  description: 'Descargar un video/imagen de Twitter/X (⚠️ servicio temporalmente fuera de línea).',
  run: async ({ msg, usedPrefix, command }) => {
    return msg.reply(
      `《✧》 El servicio de descarga de *Twitter/X* está temporalmente fuera de línea.\n\n` +
      `> Los servidores gratuitos que usaba el bot dejaron de funcionar (varios están caídos o pidieron re-autenticación).\n` +
      `> Puedes seguir usando otros comandos como *${usedPrefix}play*, *${usedPrefix}play2*, *${usedPrefix}tiktok* o *${usedPrefix}facebook* sin problemas.\n\n` +
      `Se reactivará en cuanto haya un servidor estable disponible.`
    )
  }
}
