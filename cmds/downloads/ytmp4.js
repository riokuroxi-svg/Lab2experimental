import yts from '#lib/youtubeSearch'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import fetch from 'node-fetch'
import { isYtdlpAvailable } from '#lib/fastFetch'

const exec = promisify(execFile)
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'
const MB = 1024 * 1024
const MAX_MB_VIDEO = 100
const LIMITE_VIDEO_DIRECTO = 16 * MB

const cmd = {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloads',
  description: 'Descargar un vídeo de YouTube (yt-dlp local, fallback a API).',

  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (!args[0]) {
        return msg.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar')
      }

      const input = args.join(' ').trim()
      const url = await getYoutubeUrl(input)

      // ¿yt-dlp disponible? → descarga local (rápida y estable)
      const ytdlpDisponible = await isYtdlpAvailable()

      if (ytdlpDisponible) {
        const infoMsg = await sock.sendMessage(msg.chat, {
          text: '⏳ Descargando *video* con yt-dlp local… ⚡'
        }, { quoted: msg }).catch(() => null)

        const buffer = await downloadVideoYtdlp(url)
        if (!buffer || buffer.length < 1024) {
          throw new Error('El video descargado está vacío')
        }
        const meta = await getMeta(url).catch(() => null)
        const title = meta?.title || 'video'
        const duration = formatDuration(meta?.duration)
        const channel = meta?.uploader || meta?.channel || 'Desconocido'
        const views = meta?.view_count
          ? Number(meta.view_count).toLocaleString('es-HN')
          : 'Desconocido'
        const fileName = sanitizeFileName(title) + '.mp4'

        const caption =
          `>> Descargado › *${title}*\n\n` +
          `> ❖ Canal › *${channel}*\n` +
          `> ⴵ Duración › *${duration}*\n` +
          `> ❀ Vistas › *${views}*\n` +
          `> ❒ Formato › *video/mp4*\n` +
          `> ❒ Tamaño › *${(buffer.length / MB).toFixed(1)} MB*\n` +
          `> ❒ Fuente › *yt-dlp local ⚡*`

        if (buffer.length <= LIMITE_VIDEO_DIRECTO && esMp4(buffer)) {
          await sock.sendMessage(msg.chat, {
            video: buffer,
            mimetype: 'video/mp4',
            caption,
            fileName
          }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.chat, {
            document: buffer,
            mimetype: esMp4(buffer) ? 'video/mp4' : 'application/octet-stream',
            fileName,
            caption
          }, { quoted: msg })
        }
        if (infoMsg?.key) {
          await sock.sendMessage(msg.chat, { delete: infoMsg.key }).catch(() => {})
        }
        return
      }

      // Fallback: API externa (lempi). Se mantiene por si algún host tiene
      // yt-dlp sin instalar, pero la API puede estar caída.
      const data = await getFareVideo(url).catch(() => null)

      if (!data?.status || !data?.datos?.url) {
        return msg.reply(
          '《✧》 No se pudo descargar el *video*.\n\n' +
          '> Tip: instala *yt-dlp* para descargas locales e instantáneas.\n' +
          '> En Termux: `pip install -U yt-dlp`'
        )
      }

      const title = data.titulo || 'video'
      const channel = data.canal?.nombre || 'Desconocido'
      const duration = data.duracion || 'Desconocido'
      const views = Number(data.vistas || 0).toLocaleString('es-HN')
      const thumbnail = data.miniatura || null
      const download = data.datos
      const quality = download.calidad || '360p'
      const file_name = sanitizeFileName(title) + '.mp4'

      const size_bytes =
        parseFileSize(download.tamaño) ||
        await getRemoteFileSize(download.url).catch(() => null)

      const size_text = size_bytes
        ? formatBytes(size_bytes)
        : download.tamaño || 'Desconocido'

      const send_as_document = size_bytes ? size_bytes > max_video_size : false

      const info_message = `➩ Descargando › *${title}*\n\n> ❖ Canal › *${channel}*\n> ⴵ Duración › *${duration}*\n> ❀ Vistas › *${views}*\n> ❒ Calidad › *${quality}*\n> ❒ Tamaño › *${size_text}*\n> ❒ Enlace › *${url}*`

      if (thumbnail) {
        await sock.sendMessage(msg.chat, {
          image: { url: thumbnail },
          caption: info_message
        }, { quoted: msg })
      } else {
        await msg.reply(info_message)
      }

      const caption = `乂 *Video descargado*\n\n> ❒ Calidad › *${quality}*\n> ❒ Tamaño › *${size_text}*`

      if (send_as_document) {
        await sock.sendMessage(msg.chat, {
          document: { url: download.url },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: msg })
        return
      }

      try {
        await sock.sendMessage(msg.chat, {
          video: { url: download.url },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption,
          ...(thumbnail ? { jpegThumbnail: await getThumbnail(thumbnail).catch(() => null) } : {})
        }, { quoted: msg })
      } catch {
        await sock.sendMessage(msg.chat, {
          document: { url: download.url },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: msg })
      }
    } catch (e) {
      await msg.reply(
        `> Ocurrió un error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`
      )
    }
  }
}

export default cmd

// ── yt-dlp local: descarga video a un buffer en memoria ──────
async function downloadVideoYtdlp(url) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-mp4-'))
  const outTemplate = path.join(tmpDir, 'video.%(ext)s')
  const argoVelocidad = ['-N', '8', '--no-playlist', '--extractor-args', 'youtube:player_client=android,web,web_embedded']
  const argsVid = [
    '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    ...argoVelocidad,
    '-o', outTemplate,
    '--', url
  ]
  try {
    await exec(YTDLP, argsVid, { timeout: 12 * 60 * 1000, windowsHide: true, cwd: tmpDir, maxBuffer: MAX_MB_VIDEO * MB })
  } catch (e) {
    // Fallback de formato si el merge falla
    await exec(YTDLP, ['-f', 'best', ...argoVelocidad, '-o', outTemplate, '--', url], { timeout: 12 * 60 * 1000, windowsHide: true })
  }
  const files = fs.readdirSync(tmpDir).filter(f => /\.(mp4|mkv|webm|mov)$/i.test(f))
  if (files.length === 0) throw new Error('No se pudo descargar el video')
  const buf = fs.readFileSync(path.join(tmpDir, files[0]))
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  return buf
}

// Metadatos rápidos por yt-dlp (solo JSON, no descarga media)
async function getMeta(url) {
  const { stdout } = await exec(YTDLP, ['--dump-single-json', '--no-warnings', '--no-playlist', '--', url], { timeout: 60 * 1000, maxBuffer: 8 * MB })
  try { return JSON.parse(stdout) } catch { return null }
}

function esMp4(b) {
  return b && b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp'
}

function formatDuration(sec) {
  if (!sec && sec !== 0) return 'Desconocido'
  const s = Math.floor(Number(sec) || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Función auxiliar: obtiene metadata a partir de input (URL o búsqueda)
async function getYoutubeUrl(input) {
  const id = getVideoId(input)
  if (id) return `https://youtu.be/${id}`
  if (isYTUrl(input)) return input
  const search = await yts(input)
  const video = search.videos?.[0] || search.all?.find(v => v.type === 'video')
  if (!video?.url) {
    throw new Error('No se encontró un video válido de YouTube')
  }
  return video.url
}

// ── Fallback a API externa (lempi) ──────────────────────────
const api_url = 'https://api.lempi.lat/dl/ytv?url='
const api_key = 'montekey28'
const max_video_size = 50 * 1024 * 1024

async function getFareVideo(url) {
  const res = await fetch(
    `${api_url}${encodeURIComponent(url)}&apikey=${api_key}`,
    {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0'
      }
    }
  )
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`API HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Respuesta inválida de la API: ${text.slice(0, 200)}`)
  }
  if (!data?.status) {
    throw new Error(data?.message || 'La API no devolvió un resultado válido.')
  }
  if (!data?.datos?.url) {
    throw new Error('La API no devolvió la URL de descarga.')
  }
  return data
}

async function getRemoteFileSize(url) {
  const head = await fetch(url, {
    method: 'HEAD',
    headers: { 'user-agent': 'Mozilla/5.0' }
  }).catch(() => null)
  let length = head?.headers?.get('content-length')
  let bytes = Number(length)
  if (Number.isFinite(bytes) && bytes > 0) return bytes
  const range = await fetch(url, {
    method: 'GET',
    headers: { range: 'bytes=0-0', 'user-agent': 'Mozilla/5.0' }
  }).catch(() => null)
  const content_range = range?.headers?.get('content-range')
  const match = content_range?.match(/\/(\d+)$/)
  if (match?.[1]) {
    bytes = Number(match[1])
    if (Number.isFinite(bytes) && bytes > 0) return bytes
  }
  length = range?.headers?.get('content-length')
  bytes = Number(length)
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null
}

async function getThumbnail(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer.length ? buffer : null
}

const isYTUrl = url =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(url)

function getVideoId(text = '') {
  const raw = String(text || '').trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  return raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/
  )?.[1] || null
}

function sanitizeFileName(name = 'video') {
  return String(name)
    .replace(/\.(mp4|mkv|webm|mov|avi)$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video'
}

function parseFileSize(size) {
  if (!size) return null
  const raw = String(size).trim()
  const match = raw.match(/([\d.,]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)/i)
  if (!match) return null
  let value_text = match[1]
  if (value_text.includes(',') && value_text.includes('.')) {
    value_text = value_text.replace(/,/g, '')
  } else {
    value_text = value_text.replace(',', '.')
  }
  const value = Number(value_text)
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = match[2].toLowerCase()
  const mult = {
    b: 1, byte: 1, bytes: 1, kb: 1024, kib: 1024,
    mb: 1024 ** 2, mib: 1024 ** 2, gb: 1024 ** 3, gib: 1024 ** 3
  }
  return Math.round(value * (mult[unit] || 1))
}

function formatBytes(bytes = 0) {
  if (!bytes || Number.isNaN(bytes)) return 'Desconocido'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Number(bytes)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}
