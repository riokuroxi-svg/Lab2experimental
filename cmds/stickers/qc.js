/**
 * Comando .qc — FUERA DE SERVICIO (por ahora).
 *
 * Estado (2026-08-28):
 *   - El generador de tarjetas quote que usaba el bot (`bot.lyo.su`) devuelve
 *     **HTTP 526** (certificado SSL inválido). No es un error del bot; el
 *     servidor externo está roto.
 *   - Se probaron en vivo varios servicios alternativos de quote-card
 *     (itsrose.life, lolhuman, betabotz, fgmods, xteam, ryzendesu, etc.) y
 *     todos están caídos, devuelven HTML vacío o exigen API key / redirigen
 *     a sitios de encuestas.
 *   - Generar la tarjeta 100% local con la librería de imágenes requiere el
 *     renderizado de texto con tipografías y NO se puede verificar de forma
 *     fiable en este entorno → se opta por deshabilitar con elegancia en vez
 *     de arriesgar un comando roto o feo.
 *
 * Alternativas que sí funcionan: .brat (sticker de texto), .bratv, .sticker,
 * .emojimix, .qrcode.
 */
export default {
  command: ['qc'],
  category: 'stickers',
  description: 'Crear un sticker con texto estilo quote (⚠️ servicio temporalmente fuera de línea).',
  run: async ({ msg, usedPrefix }) => {
    return msg.reply(
      `《✧》 El generador de *sticker quote* está temporalmente fuera de línea.\n\n` +
      `> El servicio gratuito que usaba el bot devolvió un *certificado SSL inválido* y no hay una alternativa gratuita estable en este momento.\n` +
      `> Mientras tanto puedes usar otros stickers de texto: *${usedPrefix}brat*, *${usedPrefix}bratv*, *${usedPrefix}sticker* o *${usedPrefix}emojimix*.\n\n` +
      `Se reactivará en cuanto haya un servicio fiable.`
    )
  }
}
