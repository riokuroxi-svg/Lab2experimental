import yts from '#lib/youtubeSearch';
import { fastFetch, isYtdlpAvailable } from '#lib/fastFetch';
import { adquirir } from '#lib/humanize';
import { getSelectedResponse } from '#lib/interactive-response';
import { downloadAudioYtdlp, processMp3ForWhatsApp, isMp3Valid } from '#lib/mp3Utils';
import { getYouTubeVideoId } from '#lib/downloadBench';
import {
  buildPlayFastCaption,
  makePlayFastButtonId,
  makePlayFastToken,
  parsePlayFastButtonId,
  sanitizeAudioFilename,
} from '#lib/playFast';

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_MB_AUDIO = 50 * 1024 * 1024;

let ytdlpDisponible = null;

function getPendingMap(sock) {
  if (!sock._ginkoPlayFastPending) sock._ginkoPlayFastPending = new Map();
  return sock._ginkoPlayFastPending;
}

async function getOEmbedInfo(videoId) {
  if (!videoId) return null;
  const res = await fastFetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`, { timeout: 5000 });
  if (!res.ok) return null;
  const json = await res.json();
  return {
    videoId,
    url: `https://youtu.be/${videoId}`,
    title: json.title || 'Audio',
    channel: json.author_name || 'Desconocido',
    thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: '??',
    source: 'oEmbed',
  };
}

async function resolveVideo(input) {
  const videoId = getYouTubeVideoId(input);
  if (videoId) {
    const fast = await getOEmbedInfo(videoId);
    if (fast) return fast;
    return {
      videoId,
      url: `https://youtu.be/${videoId}`,
      title: 'Audio',
      channel: 'Desconocido',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: '??',
      source: 'URL',
    };
  }
  const search = await yts(String(input || '').trim());
  const video = search.videos?.[0] || search.all?.find((item) => item.type === 'video');
  if (!video?.url) return null;
  return {
    videoId: video.videoId || getYouTubeVideoId(video.url),
    url: video.url,
    title: video.title || 'Audio',
    channel: video.author?.name || video.author || 'Desconocido',
    thumbnail: video.thumbnail || video.image || (video.videoId ? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg` : null),
    duration: video.timestamp || '??',
    source: 'YouTube search',
  };
}

function registrarListener(sock) {
  if (sock._ginkoPlayFastListener) return;
  sock._ginkoPlayFastListener = true;
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages || []) {
      if (!m?.message || m.key?.fromMe) continue;
      try { await procesarRespuestaPlayFast(sock, m); } catch {}
    }
  });
}

async function procesarRespuestaPlayFast(sock, m) {
  const selected = getSelectedResponse(m);
  const parsed = parsePlayFastButtonId(selected?.id);
  if (!parsed) return;

  const pending = getPendingMap(sock);
  const jobId = sock._ginkoPlayFastTokens?.get(parsed.token);
  const job = jobId ? pending.get(jobId) : null;
  if (!job || job._procesando || job._completado) return;

  job._procesando = true;
  let liberar = null;
  let estado = null;
  try {
    liberar = await adquirir('descargas', 1);
    estado = await sock.sendMessage(job.chat, {
      text: `⚡ Descargando *${parsed.action === 'doc' ? 'MP3 documento' : 'audio'}*...\n${job.title}`,
    }, { quoted: m }).catch(() => null);
    try { await sock.sendMessage(job.chat, { react: { text: '⚡', key: job.commandKey || m.key } }); } catch {}

    const buffer = await downloadAudioYtdlp(job.url, 'fast', YTDLP);
    if (!buffer || !isMp3Valid(buffer)) throw new Error('yt-dlp devolvió un MP3 inválido');
    if (buffer.length > MAX_MB_AUDIO) throw new Error('Audio muy grande (>50MB)');

    let finalBuf = buffer;
    let seconds = 0;
    const procesado = await processMp3ForWhatsApp(
      buffer,
      sanitizeAudioFilename(job.title),
      'Ginko Bot',
      128,
      'local',
    );
    finalBuf = procesado.buffer || buffer;
    seconds = procesado.seconds || 0;

    if (estado?.key) await sock.sendMessage(job.chat, { delete: estado.key }).catch(() => {});
    const fileName = `${sanitizeAudioFilename(job.title)}.mp3`;
    if (parsed.action === 'doc') {
      await sock.sendMessage(job.chat, {
        document: finalBuf,
        fileName,
        mimetype: 'audio/mpeg',
        caption: `⚡ *PlayFast · MP3*\n${job.title}\n\n❦ Ginko-MD`,
      }, { quoted: m });
    } else {
      const payload = {
        audio: finalBuf,
        fileName,
        mimetype: 'audio/mpeg',
        ptt: false,
      };
      if (seconds > 0) payload.seconds = seconds;
      await sock.sendMessage(job.chat, payload, { quoted: m });
    }

    job._completado = true;
    pending.delete(job.cardId);
    sock._ginkoPlayFastTokens?.delete(parsed.token);
    try { await sock.sendMessage(job.chat, { react: { text: '✅', key: job.commandKey || m.key } }); } catch {}
  } catch (error) {
    if (estado?.key) await sock.sendMessage(job.chat, { delete: estado.key }).catch(() => {});
    await sock.sendMessage(job.chat, {
      text: `❌ *PlayFast falló:* ${error?.message || error}\n\nPuedes probar con *.play* normal si este bloque experimental falla.`,
    }, { quoted: m });
    job._procesando = false;
    try { await sock.sendMessage(job.chat, { react: { text: '❌', key: job.commandKey || m.key } }); } catch {}
  } finally {
    if (liberar) liberar();
  }
}

export default {
  command: ['playfast', 'playfats'],
  category: 'downloads',
  description: 'Lab2: play rápido paralelo, con botones, sin reemplazar .play/.mp3.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const input = args.join(' ').trim();
    if (!input) {
      return msg.reply(
        `⚡ *PlayFast · Lab2*\n\n` +
        `Uso:\n*${usedPrefix + command}* <búsqueda o URL de YouTube>\n\n` +
        `Alias: *${usedPrefix}playfast* y *${usedPrefix}playfats*\n\n` +
        `_No reemplaza .play/.mp3._`,
      );
    }

    try {
      if (ytdlpDisponible === null) ytdlpDisponible = await isYtdlpAvailable();
      if (!ytdlpDisponible) return msg.reply('⚠️ PlayFast necesita yt-dlp instalado. Usa .play normal como respaldo.');
      try { await sock.sendMessage(msg.chat, { react: { text: '🔎', key: msg.key } }); } catch {}

      const info = await resolveVideo(input);
      if (!info?.url) return msg.reply('《✧》No encontré ese video para PlayFast.');

      registrarListener(sock);
      const token = makePlayFastToken();
      const buttons = [
        { buttonId: makePlayFastButtonId(token, 'audio'), buttonText: { displayText: '🎵 Audio ⚡' }, type: 1 },
        { buttonId: makePlayFastButtonId(token, 'doc'), buttonText: { displayText: '📄 MP3 Doc' }, type: 1 },
      ];
      const caption = buildPlayFastCaption(info);
      const payload = info.thumbnail
        ? { image: { url: info.thumbnail }, caption, footerText: '❦ Ginko-MD', buttons, headerType: 4 }
        : { text: caption, footerText: '❦ Ginko-MD', buttons, headerType: 1 };

      let card;
      try {
        card = await sock.sendMessage(msg.chat, payload, { quoted: msg });
      } catch {
        card = await sock.sendMessage(msg.chat, { text: `${caption}\n\nResponde citando: 1 = audio, 2 = doc` }, { quoted: msg });
      }
      if (!card?.key?.id) return msg.reply('❌ No pude enviar la tarjeta PlayFast.');

      getPendingMap(sock).set(card.key.id, {
        cardId: card.key.id,
        chat: msg.chat,
        url: info.url,
        title: info.title,
        commandKey: msg.key,
        token,
        _procesando: false,
        _completado: false,
      });
      (sock._ginkoPlayFastTokens ??= new Map()).set(token, card.key.id);
      setTimeout(() => {
        const pending = getPendingMap(sock);
        const job = pending.get(card.key.id);
        if (job && !job._procesando && !job._completado) {
          pending.delete(card.key.id);
          sock._ginkoPlayFastTokens?.delete(job.token);
        }
      }, PENDING_TTL_MS);
      try { await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } }); } catch {}
    } catch (error) {
      await msg.reply(`❌ *PlayFast error:* ${error?.message || error}\n\nUsa .play normal como respaldo.`);
      try { await sock.sendMessage(msg.chat, { react: { text: '❌', key: msg.key } }); } catch {}
    }
  },
};

export { procesarRespuestaPlayFast };
