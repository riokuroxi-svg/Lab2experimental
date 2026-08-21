import yts from 'yt-search'
import { fastFetch, globalFetchCache, isYtdlpAvailable } from '#lib/fastFetch'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { downloadAudioYtdlp, processMp3ForWhatsApp, isMp3Valid } from '#lib/mp3Utils'
import { adquirir } from '#lib/humanize'

const exec = promisify(execFile)
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

function dormir(ms) { return new Promise(r => setTimeout(r, ms)) }

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
async function descargarAudioYtdlp(url, modo = 'fast') {
  // Actualizar yt-dlp antes de descargar
  try {
    await exec(YTDLP, ['-U', '--update-to', 'nightly'], { timeout: 30000 }).catch(() => {})
  } catch {}

  let buf
  try {
    buf = await downloadAudioYtdlp(url, modo, YTDLP)
  } catch (e) {
    await dormir(1000)
    try {
      buf = await downloadAudioYtdlp(url, 'fast', YTDLP)
    } catch (e2) {
      throw new Error(e.message || e2.message || 'Error al descargar audio')
    }
  }
  if (!buf || !isMp3Valid(buf)) throw new Error('Archivo descargado corrupto')
  return buf
}

// ════════════════════════════════════════════════════════════
//  DESCARGA POR API (fallback)
// ════════════════════════════════════════════════════════════
async function getAudioFromApi(url) {
  const apiUrl = `https://api.lempi.lat/dl/yta?url=${encodeURIComponent(url)}&apikey=montekey28`
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
  const apiUrl = `https://api.lempi.lat/dl/ytv?url=${encodeURIComponent(url)}&apikey=montekey28`
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
  let selectedId='', ctxStanzaId=''
  const lrm = m.message?.listResponseMessage, brm = m.message?.buttonsResponseMessage, trm=m.message?.templateButtonReplyMessage, irm=m.message?.interactiveResponseMessage, nfrm=irm?.nativeFlowResponseMessage
  if (lrm?.singleSelectReply?.selectedRowId) { selectedId=String(lrm.singleSelectReply.selectedRowId); ctxStanzaId=lrm.contextInfo?.stanzaId||'' }
  else if (brm?.selectedButtonId) { selectedId=String(brm.selectedButtonId); ctxStanzaId=brm.contextInfo?.stanzaId||'' }
  else if (trm?.selectedId) { selectedId=String(trm.selectedId); ctxStanzaId=trm.contextInfo?.stanzaId||'' }
  else if (nfrm?.paramsJson) { try { const p=JSON.parse(typeof nfrm.paramsJson==='string'?nfrm.paramsJson:'{}'); selectedId=String(p.id||'') } catch {}; ctxStanzaId=irm?.contextInfo?.stanzaId||nfrm.contextInfo?.stanzaId||'' }
  else if (irm?.body?.text) selectedId=String(irm.body.text)
  if (selectedId) {
    const job = ctxStanzaId ? pending.get(ctxStanzaId) : null
    if (job && !job._procesando && !job._completado) { await ejecutarDescarga(sock, job, selectedId, m); return }
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
  if (id==='__ginko_pad'||id==='audiodoc'||id==='4'||id==='📄') { tipo='audio'; comoDoc=true }
  else if (id==='__ginko_pa'||id==='audio'||id==='1'||id==='mp3'||id==='👍'||id==='🎵') { tipo='audio'; comoDoc=false }
  else if (id==='__ginko_pvd'||id==='videodoc'||id==='3'||id==='📁') { tipo='video'; comoDoc=true }
  else if (id==='__ginko_pv'||id==='video'||id==='2'||id==='mp4'||id==='❤️'||id==='🎬') { tipo='video'; comoDoc=false }

  const emoji = tipo==='audio'?(comoDoc?'📄':'🎵'):(comoDoc?'📁':'🎬')
  try { await sock.sendMessage(chat, {react:{text:emoji,key:m.key}}) } catch {}
  const estadoMsg = await sock.sendMessage(chat, {text:`⏳ Descargando ${tipo}...\n> *${job.title}*`}, {quoted:m}).catch(()=>null)

  try {
    liberar = await adquirir('descargas', 2) // máx 2 descargas simultáneas en todo el bot
    let buffer
    if (tipo==='audio') {
      buffer = ytdlpDisponible ? await descargarAudioYtdlp(job.url,'fast') : (await descargarAudioApi(job.url)).buffer
      if (buffer.length>MAX_MB_AUDIO) throw new Error('Archivo muy grande (>50MB)')
      if (estadoMsg?.key) try { await sock.sendMessage(chat, {delete:estadoMsg.key}) } catch {}
      let finalBuf = buffer
      let segundos = 0
      try {
        await sock.sendMessage(chat,{react:{text:'🖼️',key:m.key}})
        const procesado = await processMp3ForWhatsApp(buffer, sanitizeFilename(job.title))
        finalBuf = procesado.buffer
        segundos = procesado.seconds || 0
      } catch (e) { console.log('[play] Error procesando MP3:', e.message) }
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
    setTimeout(()=>getPendingMap(sock).delete(job.cardId), 60000)
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
            ytdlpDisponible ? descargarAudioYtdlp(url,'fast') : descargarAudioApi(url).then(r=>r.buffer),
            getVideoInfo(input, videoId)
          ])
          if (desc.status!=='fulfilled') throw desc.reason||new Error('No se pudo descargar')
          const buffer = desc.value
          const title = info.status==='fulfilled'&&info.value ? info.value.title : 'Audio'
          if (buffer.length>MAX_MB_AUDIO) throw new Error('Muy grande (>50MB)')
          if (estado?.key) try { await sock.sendMessage(msg.chat,{delete:estado.key}) } catch {}
          let finalBuf = buffer
          let segundos = 0
          try {
            await sock.sendMessage(msg.chat,{react:{text:'🖼️',key:msg.key}})
            const procesado = await processMp3ForWhatsApp(buffer, sanitizeFilename(title))
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
      const botones = usarBotones ? [
        {buttonId:'__ginko_pa', buttonText:{displayText: ytdlpDisponible?'🎵 Audio ⚡':'🎵 Audio MP3'}, type:1},
        {buttonId:'__ginko_pv', buttonText:{displayText:'🎬 Video MP4'}, type:1}
      ] : []
      const payload = usarBotones&&thumbnail ? {image:{url:thumbnail},caption,footerText:'❦ Ginko-MD',buttons:botones,headerType:4} : thumbnail ? {image:{url:thumbnail},caption} : {text:caption}
      let card
      try { card = await sock.sendMessage(msg.chat,payload,{quoted:msg}) } catch { card = await sock.sendMessage(msg.chat,thumbnail?{image:{url:thumbnail},caption}:{text:caption},{quoted:msg}).catch(async()=>await sock.sendMessage(msg.chat,{text:caption},{quoted:msg})) }
      if (!card?.key?.id) return msg.reply('❌ No se pudo enviar la tarjeta.')
      getPendingMap(sock).set(card.key.id, {cardId:card.key.id, cardKey:card.key, chat:msg.chat, url, videoId:foundVid, title, channel, duration, views, ago, thumbnail, usandoYtdlp:ytdlpDisponible, _commandKey:msg.key, _createdAt:Date.now(), _procesando:false, _completado:false})
      setTimeout(()=>{const p=getPendingMap(sock); const j=p.get(card.key.id); if(j&&!j._procesando&&!j._completado)p.delete(card.key.id)}, PENDING_TTL_MS)
      try { await sock.sendMessage(msg.chat,{react:{text:'✅',key:msg.key}}) } catch {}
    } catch(e) {
      try { await sock.sendMessage(msg.chat,{react:{text:'❌',key:msg.key}}) } catch {}
      msg.reply(`《✧》*Error:* ${e?.message||e}`)
    }
  }
}
export default cmd
