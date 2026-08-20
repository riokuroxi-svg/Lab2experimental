import yts from 'yt-search'
import { fastFetch, globalFetchCache, isYtdlpAvailable } from '#lib/fastFetch'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'

const exec = promisify(execFile)

// Verificar si ffmpeg está disponible para incrustar portadas
let ffmpegDisponible = null;
async function isFfmpegAvailable() {
  if (ffmpegDisponible !== null) return ffmpegDisponible;
  try {
    await exec('ffmpeg', ['-version'], { timeout: 5000 });
    ffmpegDisponible = true;
  } catch {
    ffmpegDisponible = false;
  }
  return ffmpegDisponible;
}

// Agregar portada y metadatos al MP3
async function addCoverToMp3(audioBuffer, thumbUrl, titulo, artista = 'YouTube') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-mp3-'));
  const audioPath = path.join(tmpDir, 'audio.mp3');
  const thumbPath = path.join(tmpDir, 'cover.jpg');
  const outPath = path.join(tmpDir, 'final.mp3');
  try {
    fs.writeFileSync(audioPath, audioBuffer);
    try {
      const thumbRes = await fastFetch(thumbUrl, { timeout: 10000 });
      if (thumbRes.ok) {
        const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
        fs.writeFileSync(thumbPath, thumbBuf);
      }
    } catch {}
    const args = ['-y', '-i', audioPath];
    if (fs.existsSync(thumbPath)) {
      args.push('-i', thumbPath, '-map', '0:0', '-map', '1:0', '-c', 'copy',
        '-id3v2_version', '3',
        '-metadata:s:v', 'title="Album cover"',
        '-metadata:s:v', 'comment="Cover (front)"');
    }
    args.push('-metadata', `title=${titulo}`, '-metadata', `artist=${artista}`, outPath);
    await exec('ffmpeg', args, { timeout: 30000 });
    if (fs.existsSync(outPath)) return fs.readFileSync(outPath);
    return audioBuffer;
  } catch {
    return audioBuffer;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

const MAX_REINTENTOS_API = 2
const ESPERA_BASE_MS = 500
const PENDING_TTL_MS = 10 * 60 * 1000
const MAX_MB_AUDIO = 50 * 1024 * 1024
const MAX_MB_VIDEO = 100 * 1024 * 1024
const MB = 1024 * 1024

const ALIAS_MENU = ['play']
const ALIAS_AUDIO_DIRECTO = ['mp3', 'ytmp3', 'ytaudio', 'playaudio']

// Cache de ytdlp disponible (chequear solo una vez al iniciar)
let ytdlpDisponible = null

function getPendingMap(sock) {
  if (!sock._ginkoPlayPending) sock._ginkoPlayPending = new Map()
  return sock._ginkoPlayPending
}

function esIphone(m) {
  return /^3A.{18}$/.test(String(m?.key?.id || ''))
}

function dormir(ms) { return new Promise(r => setTimeout(r, ms)) }

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

function esMp3Valido(buf) {
  if (!buf || buf.length < 4) return false
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true
  return false
}

function esMp4Valido(buf) {
  if (!buf || buf.length < 12) return false
  try { return buf.slice(4, 8).toString('latin1') === 'ftyp' } catch { return false }
}

function tipoAudio(buf) {
  if (!buf || buf.length < 12) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return { mimetype: 'audio/mp4', ext: 'm4a' }
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return { mimetype: 'audio/ogg; codecs=opus', ext: 'ogg' }
  return { mimetype: 'audio/mpeg', ext: 'mp3' }
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
  const search = await conTiempo(
    yts(query),
    12000,
    'la búsqueda en YouTube tardó demasiado'
  )
  return search.videos?.[0] || search.all?.find(v => v.type === 'video') || null
}

async function getVideoInfo(input, video_id) {
  // Si tenemos ID, primero intentamos oEmbed SUPER RÁPIDO
  if (video_id) {
    const fast = await getVideoInfoFast(video_id)
    if (fast) return fast
    // Fallback a yt-search
    try {
      const info = await conTiempo(
        yts({ videoId: video_id }),
        8000,
        'no se pudo obtener la información del video'
      )
      if (info?.videoId) {
        return { ...info, url: `https://youtu.be/${info.videoId}`, image: info.thumbnail || info.image }
      }
    } catch {}
  }
  return getVideoInfoSearch(input)
}

// ════════════════════════════════════════════════════════════
//  DESCARGA LOCAL CON YT-DLP ⚡ INSTANTÁNEO
// ════════════════════════════════════════════════════════════
const ARGS_VELOCIDAD = ['-N', '8', '--no-playlist', '--extractor-args', 'youtube:player_client=android,web_embedded']

async function descargarAudioYtdlp(url, modo = 'fast') {
  // modo: 'fast' = m4a 96k, 'normal' = m4a mejor calidad, 'mp3' = mp3 320k
  let args
  if (modo === 'mp3') {
    args = ['-f', 'ba', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--no-embed-metadata', '--no-embed-thumbnail', ...ARGS_VELOCIDAD]
  } else if (modo === 'normal') {
    args = ['-f', 'ba[ext=m4a]/ba[ext=mp3]/ba', ...ARGS_VELOCIDAD]
  } else {
    args = ['-f', 'ba[ext=m4a][abr<=96]/ba[ext=m4a]/ba', ...ARGS_VELOCIDAD]
  }
  args.push('-o', '-', '--', url)
  
  const { stdout } = await exec(YTDLP, args, {
    maxBuffer: MAX_MB_AUDIO,
    timeout: 120000,
    windowsHide: true
  })
  const buf = Buffer.from(stdout, 'binary')
  if (!buf || buf.length < 1024) throw new Error('Archivo vacío')
  return buf
}

async function getInfoYtdlp(url) {
  const args = ['--dump-single-json', '--no-warnings', '--no-playlist', '--', url]
  const { stdout } = await exec(YTDLP, args, { maxBuffer: 16 * MB, timeout: 15000, windowsHide: true })
  return JSON.parse(stdout)
}

// ════════════════════════════════════════════════════════════
//  DESCARGA POR API (fallback si no hay yt-dlp)
// ════════════════════════════════════════════════════════════
async function getAudioFromApi(url) {
  const apiUrl = `https://api.lempi.lat/dl/yta?url=${encodeURIComponent(url)}&apikey=montekey28`
  const ctrlMeta = new AbortController()
  const toMeta = setTimeout(() => ctrlMeta.abort(), 15000)
  let res
  try {
    res = await fastFetch(apiUrl, { signal: ctrlMeta.signal })
  } finally { clearTimeout(toMeta) }
  if (!res.ok) throw new Error(`API respondió HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.status || !json?.datos?.url) throw new Error('La API no devolvió enlace de descarga')

  const ctrlAudio = new AbortController()
  const toAudio = setTimeout(() => ctrlAudio.abort(), 90000)
  let audioRes
  try {
    audioRes = await fastFetch(json.datos.url, { signal: ctrlAudio.signal })
  } finally { clearTimeout(toAudio) }
  if (!audioRes.ok) throw new Error(`Enlace de audio roto (HTTP ${audioRes.status})`)
  const buffer = Buffer.from(await audioRes.arrayBuffer())
  if (buffer.length < 50 * 1024) throw new Error(`Archivo demasiado pequeño (${buffer.length} bytes)`)
  return { buffer, name: json.datos.archivo || 'audio.mp3' }
}

async function getVideoFromApi(url) {
  const apiUrl = `https://api.lempi.lat/dl/ytv?url=${encodeURIComponent(url)}&apikey=montekey28`
  const ctrlMeta = new AbortController()
  const toMeta = setTimeout(() => ctrlMeta.abort(), 18000)
  let res
  try {
    res = await fastFetch(apiUrl, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: ctrlMeta.signal })
  } finally { clearTimeout(toMeta) }
  if (!res.ok) throw new Error(`API respondió HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.status || !json?.datos?.url) throw new Error('La API no devolvió enlace de video')

  const ctrlVideo = new AbortController()
  const toVideo = setTimeout(() => ctrlVideo.abort(), 120000)
  let videoRes
  try {
    videoRes = await fastFetch(json.datos.url, { signal: ctrlVideo.signal, headers: { 'user-agent': 'Mozilla/5.0' } })
  } finally { clearTimeout(toVideo) }
  if (!videoRes.ok) throw new Error(`Enlace de video roto (HTTP ${videoRes.status})`)
  const buffer = Buffer.from(await videoRes.arrayBuffer())
  if (buffer.length < 100 * 1024) throw new Error(`Archivo demasiado pequeño (${buffer.length} bytes)`)
  return { buffer, name: json.datos.archivo || 'video.mp4', calidad: json.datos.calidad || '360p' }
}

async function descargarAudioApi(url) {
  let ultimoError = null
  for (let i = 1; i <= MAX_REINTENTOS_API; i++) {
    try {
      const r = await getAudioFromApi(url)
      if (r?.buffer?.length && esMp3Valido(r.buffer)) return r
      ultimoError = new Error('El archivo no es un MP3 válido')
    } catch (e) { ultimoError = e }
    if (i < MAX_REINTENTOS_API) await dormir(ESPERA_BASE_MS * i)
  }
  throw ultimoError || new Error('Fallaron todos los intentos')
}

async function descargarVideoApi(url) {
  let ultimo = null
  for (let i = 1; i <= MAX_REINTENTOS_API; i++) {
    try {
      const r = await getVideoFromApi(url)
      if (r?.buffer?.length && esMp4Valido(r.buffer)) return r
      ultimo = new Error('El archivo no es un MP4 válido')
    } catch (e) { ultimo = e }
    if (i < MAX_REINTENTOS_API) await dormir(ESPERA_BASE_MS * i)
  }
  throw ultimo || new Error('Fallaron todos los intentos')
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
    const emoji = String(reaction.text || '').trim()
    const job = pending.get(reaction.key.id)
    if (job && !job._procesando && !job._completado) {
      const mapeo = { '👍': 'audio', '❤️': 'video', '📄': 'audiodoc', '📁': 'videodoc' }
      const eleccion = mapeo[emoji]
      if (eleccion) await ejecutarDescarga(sock, job, eleccion, m)
    }
    return
  }

  let selectedId = ''
  let ctxStanzaId = ''

  const lrm = m.message?.listResponseMessage
  const brm = m.message?.buttonsResponseMessage
  const trm = m.message?.templateButtonReplyMessage
  const irm = m.message?.interactiveResponseMessage
  const nfrm = irm?.nativeFlowResponseMessage

  if (lrm?.singleSelectReply?.selectedRowId) {
    selectedId = String(lrm.singleSelectReply.selectedRowId)
    ctxStanzaId = lrm.contextInfo?.stanzaId || ''
  } else if (brm?.selectedButtonId) {
    selectedId = String(brm.selectedButtonId)
    ctxStanzaId = brm.contextInfo?.stanzaId || ''
  } else if (trm?.selectedId) {
    selectedId = String(trm.selectedId)
    ctxStanzaId = trm.contextInfo?.stanzaId || ''
  } else if (nfrm?.paramsJson) {
    try { const p = JSON.parse(typeof nfrm.paramsJson === 'string' ? nfrm.paramsJson : '{}'); selectedId = String(p.id || '') } catch {}
    ctxStanzaId = irm?.contextInfo?.stanzaId || nfrm.contextInfo?.stanzaId || ''
  } else if (irm?.body?.text) {
    selectedId = String(irm.body.text)
  }

  if (selectedId) {
    const job = ctxStanzaId ? pending.get(ctxStanzaId) : null
    if (job && !job._procesando && !job._completado) {
      await ejecutarDescarga(sock, job, selectedId, m)
      return
    }
    if (!ctxStanzaId) {
      const chat = m.key.remoteJid
      for (const [, j] of Array.from(pending.entries()).reverse()) {
        if (j.chat === chat && !j._procesando && !j._completado) { await ejecutarDescarga(sock, j, selectedId, m); return }
      }
    }
    return
  }

  const ext = m.message?.extendedTextMessage
  const texto = String(m.message?.conversation || ext?.text || '').trim().toLowerCase()
  const citado = ext?.contextInfo?.stanzaId
  if (citado && texto) {
    const job = pending.get(citado)
    if (job && !job._procesando && !job._completado) {
      const primera = texto.split(/\s+/)[0]
      if (['1','audio','mp3'].includes(primera)) await ejecutarDescarga(sock, job, 'audio', m)
      else if (['2','video','mp4'].includes(primera)) await ejecutarDescarga(sock, job, 'video', m)
      else if (['3','videodoc'].includes(primera)) await ejecutarDescarga(sock, job, 'videodoc', m)
      else if (['4','audiodoc'].includes(primera)) await ejecutarDescarga(sock, job, 'audiodoc', m)
    }
  }
}

async function ejecutarDescarga(sock, job, modo, m) {
  job._procesando = true
  const chat = job.chat

  const id = String(modo || '').trim().toLowerCase()
  let tipo = 'audio', comoDoc = false
  if (id === '__ginko_pad' || id === 'audiodoc' || id === '4' || id === '📄') { tipo = 'audio'; comoDoc = true }
  else if (id === '__ginko_pa' || id === 'audio' || id === '1' || id === 'mp3' || id === '👍' || id === '🎵') { tipo = 'audio'; comoDoc = false }
  else if (id === '__ginko_pvd' || id === 'videodoc' || id === '3' || id === '📁') { tipo = 'video'; comoDoc = true }
  else if (id === '__ginko_pv' || id === 'video' || id === '2' || id === 'mp4' || id === '❤️' || id === '🎬') { tipo = 'video'; comoDoc = false }

  const reactionEmoji = tipo === 'audio' ? (comoDoc ? '📄' : '🎵') : (comoDoc ? '📁' : '🎬')
  try { await sock.sendMessage(chat, { react: { text: reactionEmoji, key: m.key } }) } catch {}

  const estadoMsg = await sock.sendMessage(chat, {
    text: `⏳ Descargando ${tipo === 'audio' ? 'audio' : 'video'}${job.usandoYtdlp ? ' ⚡ (ytdlp rápido)' : ''}...\n> *${job.title}*`
  }, { quoted: m }).catch(() => null)

  try {
    let r, buffer
    if (tipo === 'audio') {
      // Usar ytdlp si está disponible, sino API
      if (ytdlpDisponible) {
        buffer = await descargarAudioYtdlp(job.url, 'fast')
        r = { buffer }
      } else {
        r = await descargarAudioApi(job.url)
        buffer = r.buffer
      }
      if (buffer.length > MAX_MB_AUDIO) throw new Error(`El audio es demasiado grande (más de 50 MB)`)
      
      if (estadoMsg?.key) { try { await sock.sendMessage(chat, { delete: estadoMsg.key }) } catch {} }
      
      const audioInfo = tipoAudio(buffer)
      // Agregar portada si está disponible
      let audioFinal = buffer;
      const ffmpegOk = await isFfmpegAvailable();
      if (!comoDoc && ffmpegOk && audioInfo.ext === 'mp3' && job.thumbnail && ytdlpDisponible) {
        try {
          await sock.sendMessage(chat, { react: { text: '🖼️', key: m.key } });
          audioFinal = await addCoverToMp3(buffer, job.thumbnail, job.title, job.channel || 'YouTube');
        } catch {}
      }
      await sock.sendMessage(chat, {
        [comoDoc ? 'document' : 'audio']: audioFinal,
        mimetype: audioInfo.mimetype,
        fileName: `${sanitizeFilename(job.title)}.${audioInfo.ext}`,
        ptt: false
      }, { quoted: m })
    } else {
      // Video: por ahora solo API (ytdlp video es más pesado)
      r = await descargarVideoApi(job.url)
      buffer = r.buffer
      if (buffer.length > MAX_MB_VIDEO) throw new Error(`El video es demasiado grande (más de 100 MB)`)
      if (!esMp4Valido(buffer)) {
        comoDoc = true
      }
      if (estadoMsg?.key) { try { await sock.sendMessage(chat, { delete: estadoMsg.key }) } catch {} }
      await sock.sendMessage(chat, {
        [comoDoc ? 'document' : 'video']: buffer,
        mimetype: 'video/mp4',
        fileName: `${sanitizeFilename(job.title)}.mp4`,
        caption: `乂 *Video descargado*\n> ❒ Título › *${job.title}*${r.calidad ? `\n> ❒ Calidad › *${r.calidad}*` : ''}`
      }, { quoted: m })
    }
    job._completado = true
    try { await sock.sendMessage(chat, { react: { text: '✅', key: job._commandKey || m.key } }) } catch {}
    setTimeout(() => getPendingMap(sock).delete(job.cardId), 60_000)
  } catch (e) {
    job._procesando = false
    if (estadoMsg?.key) { try { await sock.sendMessage(chat, { delete: estadoMsg.key }) } catch {} }
    await sock.sendMessage(chat, {
      text: `❌ *Error al descargar:* ${e?.message || e}\n\n> Prueba con otro enlace o vuelve a intentarlo en unos segundos.`
    }, { quoted: m })
    try { await sock.sendMessage(chat, { react: { text: '❌', key: job._commandKey || m.key } }) } catch {}
  }
}

const cmd = {
  command: [...ALIAS_MENU, ...ALIAS_AUDIO_DIRECTO],
  category: 'downloads',
  description: 'Descargar música/video de YouTube con menú de botones.',

  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      // Chequear si yt-dlp está disponible UNA SOLA VEZ
      if (ytdlpDisponible === null) {
        ytdlpDisponible = await isYtdlpAvailable()
        if (ytdlpDisponible) {
          console.log('[play] ⚡ yt-dlp detectado: usando descargas locales rápidas')
        } else {
          console.log('[play] ℹ️ yt-dlp no instalado: usando API (más lento). Instala con pkg install python ffmpeg && pip install yt-dlp para máxima velocidad')
        }
      }

      if (!args[0]) {
        return msg.reply(`《✧》Uso: *${usedPrefix}play <búsqueda o URL>*\nEj: *${usedPrefix}play* bad bunny diles\n\n${ytdlpDisponible ? '⚡ Usando yt-dlp local: descargas instantáneas' : '💡 Instala yt-dlp en Termux para descargas súper rápidas: pkg install python ffmpeg && pip install -U yt-dlp'}`)
      }

      const input = args.join(' ').trim()
      const videoId = getVideoId(input)

      // Reaccionar INMEDIATAMENTE para que el usuario vea respuesta
      try { await sock.sendMessage(msg.chat, { react: { text: '🔍', key: msg.key } }) } catch {}

      // MODO AUDIO DIRECTO (.mp3 / .ytmp3): descargar EN PARALELO con metadata si tenemos ID
      const isDirectAudio = ALIAS_AUDIO_DIRECTO.includes(command)

      if (isDirectAudio && videoId) {
        const url = `https://youtu.be/${videoId}`
        const estado = await sock.sendMessage(msg.chat, { text: `⏳ Descargando audio...${ytdlpDisponible ? ' ⚡' : ''}` }, { quoted: msg }).catch(() => null)
        
        try {
          let buffer, title
          // Descargar y obtener metadata en paralelo
          const [descargaResult, infoResult] = await Promise.allSettled([
            ytdlpDisponible ? descargarAudioYtdlp(url, 'fast') : descargarAudioApi(url).then(r => r.buffer),
            getVideoInfo(input, videoId)
          ])
          
          if (descargaResult.status !== 'fulfilled') throw descargaResult.reason || new Error('No se pudo descargar')
          buffer = descargaResult.value
          
          title = (infoResult.status === 'fulfilled' && infoResult.value) ? (infoResult.value.title || 'Audio') : 'Audio'
          
          if (buffer.length > MAX_MB_AUDIO) throw new Error(`El audio es demasiado grande (más de 50 MB)`)
          
          if (estado?.key) { try { await sock.sendMessage(msg.chat, { delete: estado.key }) } catch {} }
          
          const audioInfo = tipoAudio(buffer)
          // Agregar portada si es mp3, hay thumbnail, y ffmpeg está instalado
          let audioFinal = buffer;
          const thumbUrl = (info.status === 'fulfilled' && info.value) ? (info.value.thumbnail || info.value.image) : null;
          const ffmpegOk = await isFfmpegAvailable();
          if (ffmpegOk && audioInfo.ext === 'mp3' && thumbUrl && ytdlpDisponible) {
            try {
              await sock.sendMessage(msg.chat, { react: { text: '🖼️', key: msg.key } });
              const artist = (info.status === 'fulfilled' && info.value) ? (info.value.author?.name || 'YouTube') : 'YouTube';
              audioFinal = await addCoverToMp3(buffer, thumbUrl, title, artist);
            } catch {}
          }
          await sock.sendMessage(msg.chat, {
            audio: audioFinal,
            fileName: `${sanitizeFilename(title)}.${audioInfo.ext}`,
            mimetype: audioInfo.mimetype
          }, { quoted: msg })
          
          try { await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } }) } catch {}
        } catch (e) {
          if (estado?.key) { try { await sock.sendMessage(msg.chat, { delete: estado.key }) } catch {} }
          await msg.reply(`《✧》No se pudo descargar el audio: ${e?.message || e}`)
          try { await sock.sendMessage(msg.chat, { react: { text: '❌', key: msg.key } }) } catch {}
        }
        return
      }

      // MODO NORMAL .play: buscar info y mostrar menú
      const info = await getVideoInfo(input, videoId)
      if (!info?.url) {
        try { await sock.sendMessage(msg.chat, { react: { text: '❌', key: msg.key } }) } catch {}
        return msg.reply('《✧》No se encontró un video válido de YouTube.')
      }
      const url = info.url
      const foundVideoId = videoId || getVideoId(url)
      const title = info.title || 'audio'
      const thumbnail = info.thumbnail || info.image || (foundVideoId ? `https://i.ytimg.com/vi/${foundVideoId}/hqdefault.jpg` : null)
      const channel = info.author?.name || info.author || 'Desconocido'
      const duration = info.timestamp || '??'
      const views = Number(info.views || 0).toLocaleString('es-HN')
      const ago = info.ago || ''

      registrarListener(sock)

      const usarBotones = !esIphone(msg)

      const infoTxt =
        `🎬 *RESULTADO ENCONTRADO*\n\n` +
        `> ❖ Título  › *${title}*\n` +
        `> ❖ Canal   › *${channel}*\n` +
        `> ⴵ Duración › *${duration}*\n` +
        (views && views !== '0' ? `> ❀ Vistas  › *${views}*\n` : '') +
        (ago ? `> ✩ Publicado › *${ago}*\n` : '') +
        `> ❒ Enlace › ${url}\n` +
        (ytdlpDisponible ? `\n⚡ *Descarga rápida con yt-dlp activada*` : '') + '\n'

      const caption = usarBotones
        ? infoTxt +
          `🟢 *Toca el botón* de abajo para elegir formato:\n\n` +
          `🔵 Si el menú no se abre, *cita este mensaje* y escribe:\n` +
          `   *1* o *audio*   → Audio 🎵\n` +
          `   *2* o *video*   → Video MP4 🎬\n` +
          `   *3* o *videodoc* → Video como documento 📁\n` +
          `   *4* o *audiodoc* → Audio como documento 📄`
        : infoTxt +
          `🟡 *Reacciona a este mensaje* con un emoji:\n` +
          `   👍  → Audio 🎵\n` +
          `   ❤️  → Video MP4 🎬\n` +
          `   📄  → Audio como documento\n` +
          `   📁  → Video como documento\n\n` +
          `🔵 O bien *cita este mensaje* y escribe:\n` +
          `   *1* o *audio* / *2* o *video* / *3* o *videodoc* / *4* o *audiodoc*`

      const botonesRespuesta = usarBotones ? [
        {
          buttonId: '__ginko_pa',
          buttonText: { displayText: ytdlpDisponible ? '🎵 Audio ⚡ Rápido' : '🎵 Audio MP3' },
          type: 1
        },
        {
          buttonId: '__ginko_pv',
          buttonText: { displayText: '🎬 Video MP4' },
          type: 1
        }
      ] : []

      const payload = usarBotones && thumbnail
        ? {
            image: { url: thumbnail },
            caption,
            footerText: '❦ Ginko-MD · toca un botón',
            buttons: botonesRespuesta,
            headerType: 4
          }
        : thumbnail
          ? { image: { url: thumbnail }, caption }
          : { text: caption }

      let card
      const opts = { quoted: msg }
      try {
        card = await sock.sendMessage(msg.chat, payload, opts)
      } catch (e) {
        card = await sock.sendMessage(msg.chat, thumbnail ? { image: { url: thumbnail }, caption } : { text: caption }, opts).catch(async () =>
          await sock.sendMessage(msg.chat, { text: caption }, opts)
        )
      }

      if (!card?.key?.id) return msg.reply('❌ No se pudo enviar la tarjeta de opciones.')

      const job = {
        cardId: card.key.id, cardKey: card.key, chat: msg.chat,
        url, videoId: foundVideoId, title, channel, duration, views, ago, thumbnail,
        usandoYtdlp: ytdlpDisponible,
        pref: usedPrefix, commandMsg: msg,
        _commandKey: msg.key,
        _createdAt: Date.now(), _procesando: false, _completado: false
      }
      getPendingMap(sock).set(card.key.id, job)
      setTimeout(() => {
        const p = getPendingMap(sock)
        const j = p.get(card.key.id)
        if (j && !j._procesando && !j._completado) p.delete(card.key.id)
      }, PENDING_TTL_MS)

      try { await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } }) } catch {}
    } catch (e) {
      try { await sock.sendMessage(msg.chat, { react: { text: '❌', key: msg.key } }) } catch {}
      msg.reply(`《✧》*Error:* ${e?.message || e}\n\n> Prueba de nuevo en unos segundos.`)
    }
  }
}

export default cmd
