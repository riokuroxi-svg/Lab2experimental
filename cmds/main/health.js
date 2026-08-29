import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sizeFormatter } from 'human-readable';
import db from '#db';
import { isYtdlpAvailable } from '#lib/fastFetch';
import {
  installPassiveErrorRecorder,
  logBotError,
  getBotErrors,
  clearBotErrors,
  getBotErrorCount,
  formatUptime,
  truncateError,
} from '#lib/diagnostics';

// El recorder de errores se registra una sola vez. Inofensivo y aditivo.
installPassiveErrorRecorder();

const exec = promisify(execFile);
const format = sizeFormatter({ std: 'JEDEC', decimalPlaces: 2, keepTrailingZeroes: false, render: (literal, symbol) => `${literal} ${symbol}B` });

let _ffmpegCache = null;
async function hasFfmpeg() {
  if (_ffmpegCache !== null) return _ffmpegCache;
  try {
    await exec('ffmpeg', ['-version'], { timeout: 5000 });
    _ffmpegCache = true;
  } catch {
    _ffmpegCache = false;
  }
  return _ffmpegCache;
}

const yesNo = (ok) => (ok ? '✅ Sí' : '❌ No');

export default {
  command: ['health', 'statsbot', 'salud'],
  category: 'main',
  description: 'Ver la salud del bot (RAM, uptime, yt-dlp/ffmpeg y errores recientes).',
  run: async ({ msg, sock, usedPrefix, isOwner }) => {
    try {
      // Subcomando para limpiar el historial de errores (solo owner)
      const sub = (msg.text || '').split(/\s+/)[1]?.toLowerCase();
      if (sub === 'clear' || sub === 'limpiar') {
        if (!isOwner) {
          return msg.reply('> *Health clear* solo puede usarlo el *creador/owner* del bot.');
        }
        clearBotErrors();
        return msg.reply('> ✅ Historial de errores recientes restablecido.');
      }

      const botId = sock?.user?.id ? `${sock.user.id.split(':')[0]}@s.whatsapp.net` : '';
      const settings = botId ? (db.getSettings(botId) || {}) : {};
      const botname = settings.botname || global.botname || 'Ginko-MD';
      const isOficial = global.sock?.user?.id && botId === (global.sock.user.id.split(':')[0] + '@s.whatsapp.net');
      const botType = isOficial ? 'Principal/Owner' : 'Sub Bot';
      const connected = !!sock?.user;

      // Recursos
      const memTotal = os.totalmem();
      const memFree = os.freemem();
      const memUsed = memTotal - memFree;
      const mu = process.memoryUsage();

      // Estado de herramientas externas (en paralelo, sin bloquear mucho)
      const [ytdlpOk, ffmpegOk] = await Promise.all([isYtdlpAvailable(), hasFfmpeg()]);

      const users = db.getUser()?.length || 0;
      const groups = db.getChat()?.length || 0;
      const cmdsExec = settings.commandsejecut || 0;

      // Últimos errores (owner ve el detalle; los demás solo el conteo)
      const errCount = getBotErrorCount();
      const errLines = isOwner
        ? getBotErrors(5).map((e) => {
            const t = new Date(e.ts);
            const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
            return `▸ ${hhmm} · [${e.scope}] ${truncateError(e.message, 110)}`;
          })
        : [];

      const lines = [
        `《⊛》 Salud de *${botname}*`,
        '',
        `◇ Estado conexión › ${connected ? '🟢 Conectado' : '🟡 Conectando/Reconectando'}`,
        `◇ Tipo › ${botType}`,
        `◇ Node.js › ${process.version}`,
        `◇ Uptime bot › ${formatUptime(process.uptime())}`,
        `◇ Uptime sistema › ${formatUptime(os.uptime())}`,
        `◇ CPU › ${os.cpus().length} cores · ${os.arch()}`,
        '',
        `✦ RAM sistema › ${format(memUsed)} / ${format(memTotal)}`,
        `✦ RAM bot (RSS) › ${format(mu.rss)}`,
        `✦ Heap usado › ${format(mu.heapUsed)}`,
        '',
        `✪ yt-dlp › ${yesNo(ytdlpOk)}`,
        `✪ ffmpeg › ${yesNo(ffmpegOk)}`,
        '',
        `𓍯 Usuarios › ${users.toLocaleString()}`,
        `𓍯 Grupos › ${groups.toLocaleString()}`,
        `𓍯 Comandos › ${cmdsExec.toLocaleString()}`,
      ];

      if (isOwner) {
        lines.push('', `❖ Errores recientes (${errCount}):`);
        lines.push(...(errLines.length ? errLines : ['▸ (sin errores registrados)']));
      } else {
        lines.push('', `❖ Errores recientes › ${errCount}`);
      }

      lines.push('', `> Owner puede ver el detalle con *${usedPrefix}health* y borrarlo con *${usedPrefix}health clear*.`);
      lines.push(`> Si necesitas ayuda con yt-dlp/ffmpeg revisa *docs/YTDLP-INSTALACION.md*.`);

      await sock.sendMessage(msg.chat, { text: lines.join('\n'), mentions: [msg.sender] }, { quoted: msg });
    } catch (e) {
      logBotError('health', e);
      return msg.reply(`> Ocurrió un error con *health*.\n> [Error: *${e.message}*]`);
    }
  },
};
