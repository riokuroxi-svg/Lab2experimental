// ============================================================
//  ytdlp.js (v2.1 · turbo + AUTO-UPDATE) — Plugin para Ginko-MD-Lab
//  Descarga video/canciones con yt-dlp LOCAL
//
//  NOVEDADES v2.1 (cero mantenimiento):
//   · 🚀 AUTO-UPDATE: el bot actualiza yt-dlp solo cada 24 h
//     (pip → canal nightly por defecto; binario → yt-dlp -U).
//     Funciona en cualquier host: VPS, Railway, Render... sin cron.
//   · Auto-update del PROPIO plugin desde tu repo (opcional,
//     .env: YTDLP_PLUGIN_URL=https://raw.githubusercontent.com/.../ytdlp.js)
//     → subes la versión nueva a GitHub y el bot se reemplaza solo (hot-reload).
//
//  VARIABLES .env (todas opcionales):
//   YTDLP_PATH=/usr/local/bin/yt-dlp     → ruta del binario si no está en PATH
//   YTDLP_CHANNEL=nightly|stable         → canal de actualización (default: nightly)
//   YTDLP_AUTO_UPDATE=off                → desactivar el auto-update
//   YTDLP_PLUGIN_URL=<url raw de github> → auto-update del propio plugin
//
//  INSTALACIÓN:
//    1) Copiar a:  cmds/downloads/ytdlp.js   (el bot lo carga solo)
//    2) En el VPS: pip install -U --pre "yt-dlp[default]"  ·  apt install ffmpeg
//
//  USO:
//    .ytdlp <enlace>          → video (≤720p)
//    .ytdlp <enlace> audio    → canción m4a nativo (⚡ sin conversión)
//    .ytdlp <enlace> mp3      → mp3 320k (usa ffmpeg)
//    .ytdlp <enlace> fast     → m4a ~96k, máxima velocidad
// ============================================================
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
// Usar fetch nativo de Node.js
const fetch = globalThis.fetch
import { downloadAudioYtdlp, processMp3ForWhatsApp, getMp3Duration, isMp3Valid } from '#lib/mp3Utils'

const exec = promisify(execFile)
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'
const VERSION = '2.4.0'
const __filename = fileURLToPath(import.meta.url)

const MB = 1024 * 1024
const MAX_MB_VIDEO = 100
const LIMITE_VIDEO_DIRECTO = 16 * MB

const CACHE_DIR = path.join(process.cwd(), 'media', 'cache-ytdlp')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX_MB = 250

// ── utilidades ──────────────────────────────────────────────
function limpiarNombre(texto = 'descarga') {
  return String(texto)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'descarga'
}

function hashUrl(u) {
  return Buffer.from(String(u)).toString('base64url').slice(0, 32)
}

function tipoAudio(buf) {
  if (!buf || buf.length < 12) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return { mimetype: 'audio/mp4', ext: 'm4a' }
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return { mimetype: 'audio/ogg; codecs=opus', ext: 'ogg' }
  return { mimetype: 'audio/mpeg', ext: 'mp3' }
}

function esMp4(b) {
  return b && b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp'
}

async function runYtdlp(args, { maxBuffer = 32 * MB, timeout = 5 * 60 * 1000 } = {}) {
  try {
    // encoding: 'buffer' para obtener datos binarios correctamente, no como string
    const { stdout } = await exec(YTDLP, args, { maxBuffer, timeout, windowsHide: true, encoding: 'buffer' })
    return stdout
  } catch (e) {
    const errText = e.stderr ? String(e.stderr) : String(e.message || 'error desconocido')
    const cola = errText
      .split('\n').map(l => l.trim()).filter(Boolean).slice(-3)
    throw new Error(cola.join(' | '))
  }
}

function limpiarCache() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const archivos = fs.readdirSync(CACHE_DIR).map(f => {
      const p = path.join(CACHE_DIR, f)
      const st = fs.statSync(p)
      return { p, mtime: st.mtimeMs, size: st.size }
    }).sort((a, b) => a.mtime - b.mtime)
    let total = archivos.reduce((s, f) => s + f.size, 0)
    for (const f of archivos) {
      if (Date.now() - f.mtime > CACHE_TTL_MS || total > CACHE_MAX_MB * MB) {
        fs.unlinkSync(f.p)
        total -= f.size
      }
    }
  } catch { /* la caché nunca debe tumbar el comando */ }
}

const ARGS_VELOCIDAD = ['-N', '8', '--no-playlist', '--extractor-args', 'youtube:player_client=android,web,web_embedded']

// ════════════════════════════════════════════════════════════
//  AUTO-UPDATE (cero mantenimiento)
// ════════════════════════════════════════════════════════════
const UPDATER_INTERVAL_MS = 24 * 60 * 60 * 1000
const canal = (process.env.YTDLP_CHANNEL || 'nightly').toLowerCase() // nightly | stable

export async function versionYtdlp() {
  try {
    const { stdout } = await exec(YTDLP, ['--version'], { timeout: 30 * 1000 })
    return String(stdout).trim()
  } catch { return '?' }
}

// Actualiza yt-dlp. Orden: 1) pip (instalación más común, con canal nightly
// por defecto → fixes del mismo día)  2) yt-dlp -U (si es binario suelto).
// Si hay una descarga en curso se pospone (evita lock de archivos en Windows
// y contención de disco en VPS de 1 core); reintenta en el siguiente ciclo.
export async function actualizarYtdlp() {
  if (global.__ytdlpBusy) {
    console.log('[ytdlp] ⏭️ auto-update pospuesto (hay una descarga en curso)')
    return { ok: false, pospuesto: true }
  }
  const antes = await versionYtdlp()

  // 1) Intento pip
  try {
    const args = ['-m', 'pip', 'install', '-U']
    if (canal === 'nightly') args.push('--pre')
    args.push('yt-dlp[default]')
    await exec('python3', args, { timeout: 300 * 1000 })
    const despues = await versionYtdlp()
    if (despues !== antes && despues !== '?') {
      console.log(`[ytdlp] 🔄 auto-update (pip/${canal}): ${antes} → ${despues}`)
      return { ok: true, antes, despues }
    }
    console.log(`[ytdlp] ✅ yt-dlp al día (${despues}, canal pip/${canal})`)
    return { ok: true, antes, despues }
  } catch (e) {
    console.log(`[ytdlp] update por pip no disponible (${e.message?.slice(0, 80)}), probando binario…`)
  }

  // 2) Binario suelto: yt-dlp -U (o --update-to nightly para cambiar de canal)
  try {
    const cmdUpd = canal === 'nightly' ? ['--update-to', 'nightly'] : ['-U']
    await exec(YTDLP, cmdUpd, { timeout: 300 * 1000 })
    const despues = await versionYtdlp()
    console.log(`[ytdlp] 🔄 auto-update (binario/${canal}): ${antes} → ${despues}`)
    return { ok: true, antes, despues }
  } catch (e) {
    console.log(`[ytdlp] ⚠️ no se pudo auto-actualizar: ${e.message?.slice(0, 120)}`)
    return { ok: false, error: String(e.message || e).slice(0, 200) }
  }
}

export function compararVersiones(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

// Auto-update del PROPIO plugin: descarga la versión del repo, compara VERSION,
// y si es más nueva se sobreescribe a sí mismo (el loader del bot lo recarga solo).
async function actualizarPlugin() {
  const url = process.env.YTDLP_PLUGIN_URL
  if (!url) return
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const texto = await res.text()
    const m = texto.match(/const VERSION\s*=\s*'([\d.]+)'/)
    if (!m) return
    if (compararVersiones(m[1], VERSION) > 0) {
      fs.writeFileSync(__filename, texto)
      console.log(`[ytdlp] 🚀 plugin auto-actualizado ${VERSION} → ${m[1]} (hot-reload del bot)`)
    }
  } catch (e) {
    console.log(`[ytdlp] plugin: no se pudo auto-actualizar (${e.message?.slice(0, 100)})`)
  }
}

// Arranque único: el guard global evita duplicar timers cuando el
// hot-reload del bot re-importa este archivo.
if (!global.__ytdlpUpdater) {
  global.__ytdlpUpdater = true
  if ((process.env.YTDLP_AUTO_UPDATE || '').toLowerCase() !== 'off') {
    setTimeout(() => actualizarYtdlp().catch(() => {}), 60 * 1000) // 1ª comprobación al minuto
    setInterval(() => actualizarYtdlp().catch(() => {}), UPDATER_INTERVAL_MS)
    if (process.env.YTDLP_PLUGIN_URL) {
      setTimeout(() => actualizarPlugin().catch(() => {}), 2 * 60 * 1000)
      setInterval(() => actualizarPlugin().catch(() => {}), UPDATER_INTERVAL_MS)
    }
  }
}



// ════════════════════════════════════════════════════════════
//  COMANDO
// ════════════════════════════════════════════════════════════
export default {
  command: ['ytdlp', 'ytdl'],
  category: 'downloads',
  description: 'Descarga video/canciones con yt-dlp local (turbo + auto-update).',
  run: async ({ msg, sock, args, usedPrefix }) => {
    if (!args.length) {
      return msg.reply(
        `《✧》 *yt-dlp turbo* — motor local, sin APIs públicas.\n\n` +
        `Uso:\n` +
        `*${usedPrefix}ytdlp* <enlace>          → video (≤720p)\n` +
        `*${usedPrefix}ytdlp* <enlace> audio    → canción MP3 con portada personalizada ⚡\n` +
        `*${usedPrefix}ytdlp* <enlace> mp3      → mp3 320k con portada\n` +
        `*${usedPrefix}ytdlp* <enlace> fast     → mp3 96k ligero, máxima velocidad\n\n` +
        `Ejemplo: *${usedPrefix}ytdlp* https://youtu.be/xxxx audio`
      )
    }

    const url = String(args[0] || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      return msg.reply('《✧》 Ingresa un enlace *válido* (http/https).')
    }
    const modo = String(args[1] || '').toLowerCase()
    const esAudio = /^(audio|a|m4a|cancion|canciones|song|musica)$/.test(modo)
    const esMp3 = /^mp3$/.test(modo)
    const esFast = /^(fast|rapido|ligero|lite)$/.test(modo)

    try {
      await msg.react('🕒')

      // 1) Metadatos (rápido, no descarga nada)
      const rawJson = await runYtdlp(
        ['--dump-single-json', '--no-warnings', '--no-playlist', '--', url],
        { maxBuffer: 16 * MB, timeout: 90 * 1000 }
      )
      let info
      try { info = JSON.parse(rawJson) } catch { throw new Error('yt-dlp no devolvió metadatos válidos') }

      const titulo = String(info.title || 'video').slice(0, 120)
      const duracion = info.duration
        ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}`
        : 'N/A'
      const id = info.id || hashUrl(url)

      // 2) Estrategia según el modo
      let argsDesc, ext, esVideo = false, etiquetaModo, bitrate = 128, modoTag = ''
      if (!esAudio && !esMp3 && !esFast) {
        esVideo = true
        ext = 'mp4'
        etiquetaModo = 'VIDEO 720p'
        argsDesc = [
          '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4', ...ARGS_VELOCIDAD
        ]
      } else {
        // TODOS los modos de audio devuelven MP3 para que funcione la portada y no salga nombre raro
        esVideo = false
        ext = 'mp3'
        if (esMp3) {
          etiquetaModo = 'MP3 320k'
          bitrate = 320
          modoTag = 'mp3'
          argsDesc = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', ...ARGS_VELOCIDAD]
        } else if (esFast) {
          etiquetaModo = 'MP3 96k LIGERO ⚡'
          bitrate = 96
          modoTag = 'fast'
          argsDesc = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '9', ...ARGS_VELOCIDAD]
        } else {
          etiquetaModo = 'MP3 128k'
          bitrate = 128
          modoTag = 'normal'
          argsDesc = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '2', ...ARGS_VELOCIDAD]
        }
      }

      // 3) Caché (los audios se guardan YA procesados, con etiqueta de modo)
      const rutaCache = path.join(CACHE_DIR, `${id}${esVideo ? '' : '-' + modoTag}.${ext}`)
      limpiarCache()
      let buf = null
      let desdeCache = false
      if (fs.existsSync(rutaCache)) {
        try {
          buf = fs.readFileSync(rutaCache)
          desdeCache = buf && buf.length > 1024
        } catch { buf = null }
      }

      // 4) Descargar si no estaba en caché
      if (!desdeCache) {
        global.__ytdlpBusy = true
        try {
          if (esVideo) {
            // Para video seguimos usando el método anterior, pero con archivo temporal para no corromper
            const os = await import('os');
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-vid-'));
            const outTemplate = path.join(tmpDir, 'video.%(ext)s');
            const maxBuf = MAX_MB_VIDEO * MB;
            try {
              let argsVid = [...argsDesc, '-o', outTemplate, '--', url];
              try {
                await exec(YTDLP, argsVid, { timeout: 12 * 60 * 1000, windowsHide: true, cwd: tmpDir });
              } catch (e) {
                // Fallback video
                await exec(YTDLP, ['-f', 'best', ...ARGS_VELOCIDAD, '-o', outTemplate, '--', url], { timeout: 12 * 60 * 1000, windowsHide: true });
              }
              const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
              if (files.length === 0) throw new Error('No se pudo descargar el video');
              buf = fs.readFileSync(path.join(tmpDir, files[0]));
              try { fs.writeFileSync(rutaCache, buf); } catch {}
              try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            } catch (e) {
              try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
              throw e;
            }
          } else {
            // Audio: descargar a archivo temporal (sin corrupción).
            // La caché se escribe DESPUÉS de procesar, ya con el MP3 final.
            buf = await downloadAudioYtdlp(url, esFast ? 'fast' : esMp3 ? 'mp3' : 'normal', YTDLP)
          }
          if (!buf || buf.length < 1024) throw new Error('El archivo descargado está vacío')
        } finally {
          global.__ytdlpBusy = false
        }
      }

      // 5) Enviar
      const caption =
        `ㅤ۟∩　ׅ　★ ໌　ׅ　🅨🅣-🅓🅛🅟　ׄᰙ\n\n` +
        `𖣣ֶㅤ֯⌗ ✎  ⬭ *Título:* ${titulo}\n` +
        `𖣣ֶㅤ֯⌗ ❖  ⬭ *Duración:* ${duracion}\n` +
        `𖣣ֶㅤ֯⌗ ✦  ⬭ *Formato:* ${etiquetaModo}\n` +
        `𖣣ֶㅤ֯⌗ ❒  ⬭ *Tamaño:* ${(buf.length / MB).toFixed(1)} MB` +
        (desdeCache ? `\n𖣣ֶㅤ֯⌗ ⚡  ⬭ *Desde caché (instantáneo)*` : '')

      if (!esVideo) {
        // Procesar MP3 para que WhatsApp lo acepte con portada y nombre correcto.
        // Si viene de caché ya está procesado → solo medimos duración (instantáneo).
        let audioFinal = buf
        let segundos = 0
        if (!desdeCache) {
          try {
            await msg.react('🖼️')
            const procesado = await processMp3ForWhatsApp(buf, titulo, 'Ginko Bot', bitrate)
            audioFinal = procesado.buffer
            segundos = procesado.seconds || 0
            if (audioFinal && audioFinal.length > 1024) {
              try { fs.writeFileSync(rutaCache, audioFinal) } catch { /* sin caché, no pasa nada */ }
            }
          } catch (e) {
            console.log('[ytdlp] Error procesando MP3:', e.message)
          }
        } else {
          segundos = await getMp3Duration(rutaCache)
        }
        const nombre = `${limpiarNombre(titulo)}.mp3`;
        const payload = {
          audio: audioFinal,
          mimetype: 'audio/mpeg',
          fileName: nombre,
          ptt: false
        };
        if (segundos > 0) payload.seconds = segundos;
        await sock.sendMessage(msg.chat, payload, { quoted: msg })
        await sock.sendMessage(msg.chat, { text: caption }, { quoted: msg })
      } else if (buf.length <= LIMITE_VIDEO_DIRECTO && esMp4(buf)) {
        await sock.sendMessage(msg.chat, {
          video: buf,
          mimetype: 'video/mp4',
          caption,
          fileName: `${limpiarNombre(titulo)}.mp4`
        }, { quoted: msg })
      } else {
        await sock.sendMessage(msg.chat, {
          document: buf,
          mimetype: esMp4(buf) ? 'video/mp4' : 'application/octet-stream',
          fileName: `${limpiarNombre(titulo)}.mp4`,
          caption
        }, { quoted: msg })
      }

      await msg.react('✅')
    } catch (e) {
      await msg.react('❌')
      console.log(`[ytdlp] error: ${e.message}`)
      await msg.reply(
        `《✧》 Falló la descarga con yt-dlp.\n> ${e.message}\n\n` +
        `*Tips:* ¿yt-dlp está instalado? ¿ffmpeg (solo necesario para mp3)? ` +
        `Comprueba con \`yt-dlp --version\` y \`ffmpeg -version\`.`
      )
    }
  }
}
