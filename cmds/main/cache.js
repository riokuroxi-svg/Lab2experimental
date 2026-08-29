import {
  scanCaches,
  clearCacheDir,
  clearAllCaches,
  formatBytes,
} from '#lib/cacheMgmt';

export default {
  command: ['cache', 'limpiarcache', 'clearcache'],
  category: 'main',
  description: 'Ver y limpiar la caché del bot (temp, yt-dlp, play/mp3).',
  run: async ({ msg, sock, args, usedPrefix, isOwner }) => {
    const sub = (args[0] || '').toLowerCase();

    // ── Ver estado ────────────────────────────────────────────
    if (!sub) {
      const { items, totalSize, totalFiles } = scanCaches();
      const lines = [
        '《⊛》 Caché del bot',
        '',
        `◇ Total › ${formatBytes(totalSize)} (${totalFiles} archivos)`,
        '',
      ];
      for (const it of items) {
        lines.push(
          `✦ *${it.name}* › ${formatBytes(it.size)} · ${it.files} archivo(s)` +
            (it.exists ? '' : ' (vacío)')
        );
      }
      lines.push(
        '',
        `> Limpiar todo: *${usedPrefix}cache clear all*`,
        `> Limpiar uno: *${usedPrefix}cache clear ${items.map((i) => i.key).join('|')}*`,
        '> Los assets del menú, la sesión y la base de datos NO se tocan.'
      );
      return sock.sendMessage(msg.chat, { text: lines.join('\n') }, { quoted: msg });
    }

    if (sub !== 'clear' && sub !== 'limpiar') {
      return msg.reply(`《✧》 Uso: *${usedPrefix}cache* | *${usedPrefix}cache clear [all|tmp|ytdlp|play]*`);
    }

    // ── Limpiar ───────────────────────────────────────────────
    // Por seguridad, borrar todo el caché es solo para el owner.
    const target = (args[1] || '').toLowerCase();
    if (!target || target === 'all' || target === 'todo') {
      if (!isOwner) {
        return msg.reply('《✧》 `cache clear all` solo puede usarlo el *creador/owner* del bot.');
      }
      const { totalFreed } = clearAllCaches();
      return msg.reply(`> ✅ Caché limpiada.\n> Espacio liberado: *${formatBytes(totalFreed)}*`);
    }

    // Limpiar un directorio específico (tmp|ytdlp|play) — cualquiera
    const r = clearCacheDir(target);
    if (!r.ok) return msg.reply(`《✧》 No se pudo limpiar: *${r.error}*`);
    return msg.reply(
      `> ✅ Caché *${target}* limpiada.\n> Espacio liberado: *${formatBytes(r.freed)}*`
    );
  },
};
