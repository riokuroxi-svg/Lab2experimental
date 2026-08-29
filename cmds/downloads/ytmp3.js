import yts from '#lib/youtubeSearch'
import { fastFetch, globalFetchCache, isYtdlpAvailable } from '#lib/fastFetch'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'
import { downloadAudioSourceYtdlp, processMp3ForWhatsApp, isMp3Valid } from '#lib/mp3Utils'
import { adquirir } from '#lib/humanize'
import { getSelectedResponse } from '#lib/interactive-response'

const exec = promisify(execFile)
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

function dormir(ms) { return new Promise(r => setTimeout(r, ms)) }

const MAX_REINTENTOS_API = 2
const ESPERA_BASE_MS = 500
const PENDING_TTL_MS = 10 * 60 * 1000
const MAX_MB_AUDIO = 50 * 1024 * 1024
const MAX_MB_VIDEO = 100 * 1024 * 1024
const MB = 1024 * 1024
const AUDIO_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_AUDIO_CACHE_ENTRIES = 6
const DISK_AUDIO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_DISK_AUDIO_CACHE_BYTES = 350 * MB
const DISK_AUDIO_CACHE_DIR = path.join(process.cwd(), 'cache', 'play-audio')

const ALIAS_MENU = ['play']
const ALIAS_AUDIO_DIRECTO = ['mp3', 'ytmp3', 'ytaudio', 'playaudio']

// Cache de ytdlp disponible (chequear solo una vez al iniciar)
let ytdlpDisponible = null
let ytdlpUltimaActualizacion = 0
let ytdlpActualizando = false
const YTDLP_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000

function getPendingMap(sock) {
  if (!sock._ginkoPlayPending) sock._ginkoPlayPending = new Map()
  return sock._ginkoPlayPending
}

function esIphone(m) {
  return /^3A.{18}$/.test(String(m?.key?.id || ''))
}

function conTiempo(promesa, ms, etiqueta) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Tiempo de espera agotado (${Math.round(ms / 1000)}s): ${etiqueta}`)),
      ms
    )
  })
  return Promise.race([promesa, timeout]).finally(() => clearTimeout(timer))
}

function sanitizeFilename(name = 'audio') {
  return String(name)
    .replace(/\.(mp3|mp4|mkv|webm|mov|avi|m4a)$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'audio'
}

function parseDurationSeconds(label = '') {
  const parts = String(label || '').trim().split(':').map((part) => Number(part))
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function esMp4Valido(buf) {
  if (!buf || buf.length < 12) return false
  try { return buf.slice(4, 8).toString('latin1') === 'ftyp' } catch { return false }
}

const isYTUrl = (url = '') =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

const getVideoId = (text = '') => {
  const raw = String(text || '').trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ]
  for (const pattern of patterns) {
    const m = raw.match(pattern)
    if (m?.[1]) return m[1]
  }
  return null
}

// ════════════════════════════════════════════════════════════
//  METADATA RÁPIDA por oEmbed (60ms!)
// ════════════════════════════════════════════════════════════
async function getVideoInfoFast(videoId) {
  const cacheKey = `ytmeta:${videoId}`
  const cached = globalFetchCache.get(cacheKey)
  if (cached) return cached
  try {
    const res = await fastFetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`, { timeout: 4000 })
    if (!res.ok) return null
    const json = await res.json()
    const info = {
      videoId,
      url: `https://youtu.be/${videoId}`,
      title: json.title || 'Audio',
      thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      author: { name: json.author_name || 'Desconocido' },
      timestamp: '??',
      ago: '',
      views: 0,
    }
    globalFetchCache.set(cacheKey, info, 60 * 60 * 1000)
    return info
  } catch {
    return null
  }
}

async function getVideoInfoSearch(query) {
  const search = await conTiempo(yts(query), 12000, 'búsqueda tardó demasiado')
  return search.videos?.[0] || search.all?.find(v => v.type === 'video') || null
}

async function getVideoInfo(input, video_id) {
  if (video_id) {
    const fast = await getVideoInfoFast(video_id)
    if (fast) return fast
    try {
      const info = await conTiempo(yts({ videoId: video_id }), 8000, 'no se pudo obtener info')
      if (info?.videoId) return { ...info, url: `https://youtu.be/${info.videoId}`, image: info.thumbnail || info.image }
    } catch {}
  }
  return getVideoInfoSearch(input)
}

// ════════════════════════════════════════════════════════════
//  DESCARGA LOCAL CON YT-DLP ⚡ INSTANTÁNEO (archivos temporales, sin corrupción)
// ════════════════════════════════════════════════════════════
function actualizarYtdlpEnSegundoPlano() {
  if (ytdlpActualizando) return
  if (Date.now() - ytdlpUltimaActualizacion < YTDLP_UPDATE_INTERVAL_MS) return
  ytdlpActualizando = true
  ytdlpUltimaActualizacion = Date.now()
  exec(YTDLP, ['-U', '--update-to', 'nightly'], { timeout: 30000 })
    .catch(() => {})
    .finally(() => { ytdlpActualizando = false })
}

async function descargarAudioFuenteYtdlp(url) {
  // Ruta rápida para .play: descargar fuente comprimida sin conversión; luego
  // una sola pasada de ffmpeg la convierte a MP3 128K con portada/metadatos.
  actualizarYtdlpEnSegundoPlano()
  const src = await downloadAudioSourceYtdlp(url, YTDLP)
  return { buffer: src.buffer, origen: 'raw-local', ext: src.ext }
}

function resumenErrorDescarga(e) {
  const msg = String(e?.stderr || e?.message || e || '')
  if (/not a bot|cookies/i.test(msg)) return 'YouTube pidió verificación anti-bot'
  if (/HTTP 401/i.test(msg)) return 'API HTTP 401'
  if (/HTTP \d+/i.test(msg)) return msg.match(/HTTP \d+/i)?.[0] || 'HTTP error'
  return msg.split('\n').find(Boolean)?.slice(0, 120) || 'falló la descarga'
}

async function descargarAudioSmart(url) {
  let localError = null
  if (ytdlpDisponible) {
    try {
      return await descargarAudioFuenteYtdlp(url)
    } catch (e) {
      localError = e
    }
  }
  try {
    const api = await descargarAudioApi(url)
    return { buffer: api.buffer, origen: 'api', name: api.name }
  } catch (apiError) {
    if (localError) throw new Error(`yt-dlp: ${resumenErrorDescarga(localError)} | API: ${resumenErrorDescarga(apiError)}`)
    throw apiError
  }
}

// Cache RAM de audio ya procesado. Esto no hace magia en la primera descarga,
// pero permite que .play empiece a preparar el MP3 apenas manda la tarjeta:
// si el usuario toca el botón unos segundos después, ya no espera todo el
// download+ffmpeg. También acelera canciones repetidas dentro del mismo proceso.
const audioProcesadoCache = new Map()

function limpiarAudioCache() {
  const now = Date.now()
  for (const [key, entry] of audioProcesadoCache) {
    if (entry.expires <= now) audioProcesadoCache.delete(key)
  }
  while (audioProcesadoCache.size > MAX_AUDIO_CACHE_ENTRIES) {
    audioProcesadoCache.delete(audioProcesadoCache.keys().next().value)
  }
}

function audioCacheKey(job = {}) {
  return job.videoId || getVideoId(job.url) || job.url
}

function audioDiskCachePaths(job = {}) {
  const rawKey = audioCacheKey(job)
  if (!rawKey) return null
  const key = crypto.createHash('sha1').update(String(rawKey)).digest('hex')
  return {
    audio: path.join(DISK_AUDIO_CACHE_DIR, `${key}.mp3`),
    meta: path.join(DISK_AUDIO_CACHE_DIR, `${key}.json`),
  }
}

function leerAudioDiskCache(job = {}) {
  try {
    const paths = audioDiskCachePaths(job)
    if (!paths || !fs.existsSync(paths.audio) || !fs.existsSync(paths.meta)) return null
    const meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8'))
    if (!meta?.createdAt || Date.now() - meta.createdAt > DISK_AUDIO_CACHE_TTL_MS) return null
    const stat = fs.statSync(paths.audio)
    if (!stat.size || stat.size > MAX_MB_AUDIO) return null
    const buffer = fs.readFileSync(paths.audio)
    if (!isMp3Valid(buffer)) return null
    fs.utimesSync(paths.audio, new Date(), new Date())
    return { buffer, seconds: Number(meta.seconds || 0), cached: 'disk' }
  } catch {
    return null
  }
}

function limpiarAudioDiskCache() {
  try {
    if (!fs.existsSync(DISK_AUDIO_CACHE_DIR)) return
    const files = fs.readdirSync(DISK_AUDIO_CACHE_DIR)
      .filter((name) => name.endsWith('.mp3'))
      .map((name) => {
        const file = path.join(DISK_AUDIO_CACHE_DIR, name)
        const stat = fs.statSync(file)
        return { file, meta: file.replace(/\.mp3$/, '.json'), size: stat.size, mtimeMs: stat.mtimeMs }
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs)
    let total = files.reduce((sum, file) => sum + file.size, 0)
    for (const entry of files) {
      if (total <= MAX_DISK_AUDIO_CACHE_BYTES) break
      total -= entry.size
      try { fs.rmSync(entry.file, { force: true }) } catch {}
      try { fs.rmSync(entry.meta, { force: true }) } catch {}
    }
  } catch {}
}

function guardarAudioDiskCache(job = {}, result = {}) {
  try {
    if (!result?.buffer?.length || result.buffer.length > MAX_MB_AUDIO) return
    const paths = audioDiskCachePaths(job)
    if (!paths) return
    fs.mkdirSync(DISK_AUDIO_CACHE_DIR, { recursive: true })
    fs.writeFileSync(paths.audio, result.buffer)
    fs.writeFileSync(paths.meta, JSON.stringify({ createdAt: Date.now(), seconds: result.seconds || 0, title: job.title || 'Audio' }))
    limpiarAudioDiskCache()
  } catch (e) {
  }
}

async function prepararAudioProcesado(job) {
  const title = sanitizeFilename(job.title || 'Audio')
  const cached = leerAudioDiskCache(job)
  if (cached) {
    return cached
  }
  const audioDescargado = await descargarAudioSmart(job.url)
  const buffer = audioDescargado.buffer
  if (buffer.length > MAX_MB_AUDIO) throw new Error('Archivo muy grande (>50MB)')
  const procesado = await processMp3ForWhatsApp(
    buffer,
    title,
    'Ginko Bot',
    128,
    audioDescargado?.origen === 'local' ? 'local' : 'api',
    parseDurationSeconds(job.duration)
  )
  const result = { buffer: procesado.buffer || buffer, seconds: procesado.seconds || 0 }
  guardarAudioDiskCache(job, result)
  return result
}

function obtenerAudioProcesado(job) {
  limpiarAudioCache()
  const key = audioCacheKey(job)
  const cached = key ? audioProcesadoCache.get(key) : null
  if (cached && cached.expires > Date.now()) return cached.promise
  const promise = prepararAudioProcesado(job).catch((e) => {
    if (key) audioProcesadoCache.delete(key)
    throw e
  })
  if (key) audioProcesadoCache.set(key, { promise, expires: Date.now() + AUDIO_CACHE_TTL_MS })
  return promise
}

function precalentarAudio(job) {
  // No esperar aquí: la idea es solapar descarga/procesado con el tiempo que
  // tarda el usuario en tocar el botón de audio.
  obtenerAudioProcesado(job).catch((e) => {
  })
}

// ════════════════════════════════════════════════════════════
//  DESCARGA POR API (fallback)
// ════════════════════════════════════════════════════════════
// URL y key configurables por .env para no depender de una key hardcodeada
// (la del fork suele vencer → 401). Default → api.lempi.lat.
const API_FALLBACK_URL = (process.env.YTDLP_API_URL || 'https://api.lempi.lat').replace(/\/$/, '')
const API_FALLBACK_KEY = process.env.YTDLP_API_KEY || process.env.LEMPI_KEY || 'montekey28'

async function getAudioFromApi(url) {
  const apiUrl = `${API_FALLBACK_URL}/dl/yta?url=${encodeURIComponent(url)}&apikey=${API_FALLBACK_KEY}`
  const res = await fastFetch(apiUrl, { timeout: 15000 })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.status || !json?.datos?.url) throw new Error('API no devolvió enlace')
  const audioRes = await fastFetch(json.datos.url, { timeout: 90000 })
  if (!audioRes.ok) throw new Error(`Enlace roto HTTP ${audioRes.status}`)
  const buffer = Buffer.from(await audioRes.arrayBuffer())
  if (buffer.length < 50*1024) throw new Error(`Archivo muy pequeño (${buffer.length}b)`)
  return { buffer, name: json.datos.archivo || 'audio.mp3' }
}

async function getVideoFromApi(url) {
  const apiUrl = `${API_FALLBACK_URL}/dl/ytv?url=${encodeURIComponent(url)}&apikey=${API_FALLBACK_KEY}`
  const res = await fastFetch(apiUrl, { timeout: 18000, headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.status || !json?.datos?.url) throw new Error('API no devolvió video')
  const videoRes = await fastFetch(json.datos.url, { timeout: 120000, headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!videoRes.ok) throw new Error(`Enlace roto HTTP ${videoRes.status}`)
  const buffer = Buffer.from(await videoRes.arrayBuffer())
  if (buffer.length < 100*1024) throw new Error(`Archivo muy pequeño`)
  return { buffer, name: json.datos.archivo || 'video.mp4', calidad: json.datos.calidad || '360p' }
}

async function descargarAudioApi(url) {
  let err
  for (let i=1; i<=MAX_REINTENTOS_API; i++) {
    try { const r = await getAudioFromApi(url); if (r?.buffer?.length && isMp3Valid(r.buffer)) return r; err = new Error('MP3 inválido') } catch(e) { err = e }
    if (i < MAX_REINTENTOS_API) await dormir(ESPERA_BASE_MS*i)
  }
  throw err || new Error('Fallaron intentos')
}
async function descargarVideoApi(url) {
  let err
  for (let i=1; i<=MAX_REINTENTOS_API; i++) {
    try { const r = await getVideoFromApi(url); if (r?.buffer?.length && esMp4Valido(r.buffer)) return r; err = new Error('MP4 inválido') } catch(e) { err = e }
    if (i < MAX_REINTENTOS_API) await dormir(ESPERA_BASE_MS*i)
  }
  throw err || new Error('Fallaron intentos')
}

// ════════════════════════════════════════════════════════════
//  LISTENER DE BOTONES
// ════════════════════════════════════════════════════════════
function registrarListener(sock) {
  if (sock._ginkoPlayListener) return
  sock._ginkoPlayListener = true
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages || []) {
      if (!m?.message || !m?.key?.id) continue
      if (m.key.fromMe) continue
      try { await procesarRespuesta(sock, m) } catch {}
    }
  })
}

async function procesarRespuesta(sock, m) {
  const pending = getPendingMap(sock)
  if (pending.size === 0) return
  const reaction = m.message?.reactionMessage
  if (reaction?.key?.id) {
    const emoji = String(reaction.text||'').trim()
    const job = pending.get(reaction.key.id)
    if (job && !job._procesando && !job._completado) {
      const mapeo = {'👍':'audio','❤️':'video','📄':'audiodoc','📁':'videodoc'}
      if (mapeo[emoji]) await ejecutarDescarga(sock, job, mapeo[emoji], m)
    }
    return
  }
  const selectedResponse = getSelectedResponse(m)
  const selectedId = String(selectedResponse?.id || '')
  const ctxStanzaId = String(selectedResponse?.stanzaId || '')
  if (selectedId) {
    // 1) Match por token único de tarjeta (ID dinámico bien usado)
    const token = selectedId.match(/^(gk_[a-z0-9]+)_(?:pa|pv|pad|pvd)$/i)?.[1]
    if (token) {
      const jobId = sock._ginkoPlayTokens?.get(token)
      const job = jobId ? pending.get(jobId) : null
      if (job && !job._procesando && !job._completado) { await ejecutarDescarga(sock, job, selectedId, m); return }
    }
    // 2) Match por contextInfo.stanzaId (lo que WhatsApp incluye siempre)
    const job = ctxStanzaId ? pending.get(ctxStanzaId) : null
    if (job && !job._procesando && !job._completado) { await ejecutarDescarga(sock, job, selectedId, m); return }
    // 3) Último recurso: última tarjeta pendiente del chat
    if (!ctxStanzaId) {
      const chat=m.key.remoteJid
      for (const [,j] of Array.from(pending.entries()).reverse()) if (j.chat===chat && !j._procesando && !j._completado) { await ejecutarDescarga(sock,j,selectedId,m); return }
    }
    return
  }
  const ext=m.message?.extendedTextMessage, texto=String(m.message?.conversation||ext?.text||'').trim().toLowerCase(), citado=ext?.contextInfo?.stanzaId
  if (citado && texto) {
    const job = pending.get(citado)
    if (job && !job._procesando && !job._completado) {
      const primera = texto.split(/\s+/)[0]
      if (['1','audio','mp3'].includes(primera)) await ejecutarDescarga(sock,job,'audio',m)
      else if (['2','video','mp4'].includes(primera)) await ejecutarDescarga(sock,job,'video',m)
      else if (['3','videodoc'].includes(primera)) await ejecutarDescarga(sock,job,'videodoc',m)
      else if (['4','audiodoc'].includes(primera)) await ejecutarDescarga(sock,job,'audiodoc',m)
    }
  }
}

async function ejecutarDescarga(sock, job, modo, m) {
  job._procesando=true
  let liberar = null
  const chat=job.chat
  const id=String(modo||'').toLowerCase()
  let tipo='audio', comoDoc=false
  if (id.endsWith('_pad')||id==='audiodoc'||id==='4'||id==='📄') { tipo='audio'; comoDoc=true }
  else if (id.endsWith('_pa')||id==='audio'||id==='1'||id==='mp3'||id==='👍'||id==='🎵') { tipo='audio'; comoDoc=false }
  else if (id.endsWith('_pvd')||id==='videodoc'||id==='3'||id==='📁') { tipo='video'; comoDoc=true }
  else if (id.endsWith('_pv')||id==='video'||id==='2'||id==='mp4'||id==='❤️'||id==='🎬') { tipo='video'; comoDoc=false }

  const emoji = tipo==='audio'?(comoDoc?'📄':'🎵'):(comoDoc?'📁':'🎬')
  try { await sock.sendMessage(chat, {react:{text:emoji,key:m.key}}) } catch {}
  const estadoMsg = await sock.sendMessage(chat, {text:`⏳ Descargando ${tipo}...\n> *${job.title}*`}, {quoted:m}).catch(()=>null)

  try {
    liberar = await adquirir('descargas', 2) // máx 2 descargas simultáneas en todo el bot
    let buffer
    if (tipo==='audio') {
      await sock.sendMessage(chat,{react:{text:'🖼️',key:m.key}}).catch(()=>{})
      const procesado = await obtenerAudioProcesado(job)
      buffer = procesado.buffer
      if (estadoMsg?.key) try { await sock.sendMessage(chat, {delete:estadoMsg.key}) } catch {}
      const finalBuf = buffer
      const segundos = procesado.seconds || 0
      const audioPayload = {
        audio: finalBuf,
        mimetype: 'audio/mpeg',
        fileName: `${sanitizeFilename(job.title)}.mp3`,
        ptt: false
      }
      if (segundos > 0) audioPayload.seconds = segundos
      await sock.sendMessage(chat, comoDoc ? {
        document: finalBuf, mimetype:'audio/mpeg', fileName:`${sanitizeFilename(job.title)}.mp3`
      } : audioPayload, {quoted:m})
    } else {
      const r = await descargarVideoApi(job.url)
      buffer = r.buffer
      if (buffer.length>MAX_MB_VIDEO) throw new Error('Video muy grande (>100MB)')
      if (!esMp4Valido(buffer)) comoDoc=true
      if (estadoMsg?.key) try { await sock.sendMessage(chat, {delete:estadoMsg.key}) } catch {}
      await sock.sendMessage(chat, {[comoDoc?'document':'video']:buffer, mimetype:'video/mp4', fileName:`${sanitizeFilename(job.title)}.mp4`, caption:`乂 *Video*\n> ❒ Título › *${job.title}*${r.calidad?`\n> ❒ Calidad › *${r.calidad}*`:''}`}, {quoted:m})
    }
    job._completado=true
    try { await sock.sendMessage(chat,{react:{text:'✅',key:job._commandKey||m.key}}) } catch {}
    setTimeout(()=>{getPendingMap(sock).delete(job.cardId); try{sock._ginkoPlayTokens?.delete(job._token)}catch{}}, 60000)
  } catch(e) {
    job._procesando=false
    if (e?.semaforo) {
      if (estadoMsg?.key) try { await sock.sendMessage(chat,{delete:estadoMsg.key}) } catch {}
      await sock.sendMessage(chat,{text:'⏳ Ya hay 2 descargas en curso, espera un momento e inténtalo de nuevo.'},{quoted:m})
      return
    }
    if (estadoMsg?.key) try { await sock.sendMessage(chat,{delete:estadoMsg.key}) } catch {}
    await sock.sendMessage(chat,{text:`❌ *Error:* ${e?.message||e}\n\n> Prueba otro enlace.`},{quoted:m})
    try { await sock.sendMessage(chat,{react:{text:'❌',key:job._commandKey||m.key}}) } catch {}
  } finally {
    if (liberar) liberar()
  }
}

const cmd = {
  command: [...ALIAS_MENU, ...ALIAS_AUDIO_DIRECTO],
  category: 'downloads',
  description: 'Descargar música/video YouTube',
  run: async ({msg, sock, args, usedPrefix, command}) => {
    try {
      if (ytdlpDisponible===null) {
        ytdlpDisponible = await isYtdlpAvailable()
        console.log(ytdlpDisponible ? '[play] ⚡ yt-dlp detectado: descargas locales rápidas' : '[play] ℹ️ yt-dlp no disponible, usando API')
      }
      if (!args[0]) return msg.reply(`《✧》Uso: *${usedPrefix}play <búsqueda/URL>*\nEj: *${usedPrefix}play bad bunny diles*`)
      const input = args.join(' ').trim()
      const videoId = getVideoId(input)
      try { await sock.sendMessage(msg.chat,{react:{text:'🔍',key:msg.key}}) } catch {}

      const isDirectAudio = ALIAS_AUDIO_DIRECTO.includes(command)
      if (isDirectAudio && videoId) {
        const url = `https://youtu.be/${videoId}`
        const estado = await sock.sendMessage(msg.chat,{text:`⏳ Descargando audio...${ytdlpDisponible?' ⚡':''}`},{quoted:msg}).catch(()=>null)
        try {
          const [desc, info] = await Promise.allSettled([
            descargarAudioSmart(url),
            getVideoInfo(input, videoId)
          ])
          if (desc.status!=='fulfilled') throw desc.reason||new Error('No se pudo descargar')
          const audioDescargado = desc.value
          const buffer = audioDescargado.buffer
          const title = info.status==='fulfilled'&&info.value ? info.value.title : 'Audio'
          if (buffer.length>MAX_MB_AUDIO) throw new Error('Muy grande (>50MB)')
          if (estado?.key) try { await sock.sendMessage(msg.chat,{delete:estado.key}) } catch {}
          let finalBuf = buffer
          let segundos = 0
          try {
            await sock.sendMessage(msg.chat,{react:{text:'🖼️',key:msg.key}})
            const procesado = await processMp3ForWhatsApp(buffer, sanitizeFilename(title), 'Ginko Bot', 128, audioDescargado?.origen || (ytdlpDisponible ? 'local' : 'api'))
            finalBuf = procesado.buffer
            segundos = procesado.seconds || 0
          } catch (e) { console.log('[play] Error procesando MP3:', e.message) }
          const audioPayload = {
            audio: finalBuf,
            fileName: `${sanitizeFilename(title)}.mp3`,
            mimetype: 'audio/mpeg',
            ptt: false
          }
          if (segundos > 0) audioPayload.seconds = segundos
          await sock.sendMessage(msg.chat, audioPayload, {quoted:msg})
          try { await sock.sendMessage(msg.chat,{react:{text:'✅',key:msg.key}}) } catch {}
        } catch(e) {
          if (estado?.key) try { await sock.sendMessage(msg.chat,{delete:estado.key}) } catch {}
          await msg.reply(`《✧》Error: ${e?.message||e}`)
          try { await sock.sendMessage(msg.chat,{react:{text:'❌',key:msg.key}}) } catch {}
        }
        return
      }

      const info = await getVideoInfo(input, videoId)
      if (!info?.url) { try { await sock.sendMessage(msg.chat,{react:{text:'❌',key:msg.key}}) } catch {}; return msg.reply('《✧》No se encontró el video.') }
      const url=info.url, foundVid=videoId||getVideoId(url), title=info.title||'audio', thumbnail=info.thumbnail||info.image||(foundVid?`https://i.ytimg.com/vi/${foundVid}/hqdefault.jpg`:null), channel=info.author?.name||info.author||'Desconocido', duration=info.timestamp||'??', views=Number(info.views||0).toLocaleString('es-HN'), ago=info.ago||''

      registrarListener(sock)
      const usarBotones = !esIphone(msg)
      const infoTxt = `🎬 *RESULTADO*\n\n> ❖ Título › *${title}*\n> ❖ Canal › *${channel}*\n> ⴵ Duración › *${duration}*\n${views&&views!=='0'?`> ❀ Vistas › *${views}*\n`:''}${ago?`> ✩ Publicado › *${ago}*\n`:''}> ❒ Enlace › ${url}\n${ytdlpDisponible?'\n⚡ Descarga rápida con yt-dlp\n':'\n'}`
      const caption = usarBotones ? infoTxt+`🟢 Toca un botón:\n\n🔵 Si no funciona, cita el mensaje y escribe:\n*1* = audio 🎵\n*2* = video 🎬\n*3* = video como doc 📁\n*4* = audio como doc 📄` : infoTxt+`🟡 Reacciona con 👍 = audio, ❤️ = video`
      // ID único por tarjeta: el token permite emparejar el tap con SU
      // tarjeta aunque WhatsApp no incluya stanzaId o haya varias
      // tarjetas pendientes en el mismo chat.
      const cardToken = `gk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const botones = usarBotones ? [
        {buttonId:`${cardToken}_pa`, buttonText:{displayText: ytdlpDisponible?'🎵 Audio ⚡':'🎵 Audio MP3'}, type:1},
        {buttonId:`${cardToken}_pv`, buttonText:{displayText:'🎬 Video MP4'}, type:1}
      ] : []
      const payload = usarBotones&&thumbnail ? {image:{url:thumbnail},caption,footerText:'❦ Ginko-MD',buttons:botones,headerType:4} : thumbnail ? {image:{url:thumbnail},caption} : {text:caption}
      const job = {cardId:null, cardKey:null, chat:msg.chat, url, videoId:foundVid, title, channel, duration, views, ago, thumbnail, usandoYtdlp:ytdlpDisponible, _commandKey:msg.key, _createdAt:Date.now(), _procesando:false, _completado:false, _token:cardToken}
      precalentarAudio(job)
      let card
      try { card = await sock.sendMessage(msg.chat,payload,{quoted:msg}) } catch { card = await sock.sendMessage(msg.chat,thumbnail?{image:{url:thumbnail},caption}:{text:caption},{quoted:msg}).catch(async()=>await sock.sendMessage(msg.chat,{text:caption},{quoted:msg})) }
      if (!card?.key?.id) return msg.reply('❌ No se pudo enviar la tarjeta.')
      job.cardId = card.key.id
      job.cardKey = card.key
      getPendingMap(sock).set(card.key.id, job)
      ;(sock._ginkoPlayTokens ??= new Map()).set(cardToken, card.key.id)
      setTimeout(()=>{const p=getPendingMap(sock); const j=p.get(card.key.id); if(j&&!j._procesando&&!j._completado){p.delete(card.key.id); try{sock._ginkoPlayTokens?.delete(j._token)}catch{}}}, PENDING_TTL_MS)
      try { await sock.sendMessage(msg.chat,{react:{text:'✅',key:msg.key}}) } catch {}
    } catch(e) {
      try { await sock.sendMessage(msg.chat,{react:{text:'❌',key:msg.key}}) } catch {}
      msg.reply(`《✧》*Error:* ${e?.message||e}`)
    }
  }
}
export { procesarRespuesta }
export default cmd
