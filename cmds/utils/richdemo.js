import {
  sendExternalAdProbe,
  sendInstagramCard,
  sendLinkPreviewProbe,
  sendRichButtons,
  sendRichTableProbe,
} from '#lib/rich-ui';

const INSTAGRAM_FALLBACK = 'https://instagram.com/';

function getInstagramUrl() {
  const raw = global.links?.instagram || INSTAGRAM_FALLBACK;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^@?[a-z0-9._]+$/i.test(raw)) return `https://instagram.com/${raw.replace(/^@/, '')}`;
  return INSTAGRAM_FALLBACK;
}

function help(prefix = '.') {
  return `*Bloque 1 — Rich UI Demo*\n\n` +
    `Pruebas disponibles:\n` +
    `• *${prefix}richdemo* botones\n` +
    `• *${prefix}richdemo* ig\n` +
    `• *${prefix}richdemo* preview\n` +
    `• *${prefix}richdemo* ad\n` +
    `• *${prefix}richdemo* table\n` +
    `• *${prefix}richdemo* ai\n` +
    `• *${prefix}richdemo* all\n\n` +
    `Si algo no se ve bien, este bloque se revierte al checkpoint seguro.`;
}

export default {
  command: ['richdemo', 'richui'],
  category: 'utils',
  description: 'Pruebas visuales Rich UI de Lab2.',
  run: async ({ msg, sock, args, usedPrefix }) => {
    const mode = String(args[0] || 'botones').toLowerCase();
    const instagramUrl = getInstagramUrl();

    if (['help', 'ayuda', '?'].includes(mode)) {
      return msg.reply(help(usedPrefix));
    }

    const runOne = async (name) => {
      if (name === 'botones') {
        return sendRichButtons({
          sock,
          jid: msg.chat,
          quoted: msg,
          title: 'Ginko-MD ✦ Rich UI',
          body: 'Prueba directa de imagen, botón URL, botón copiar y quick reply.\n\nSi esto se ve bonito, podemos reutilizarlo en comandos reales.',
          footer: 'Lab2 · Bloque 1',
          buttons: [
            { text: '🌸 Instagram', url: instagramUrl },
            { text: '📋 Copiar link', copy: instagramUrl },
            { text: '✅ Responder', id: 'ginko_richdemo_ok' },
          ],
        });
      }
      if (name === 'ig') return sendInstagramCard({ sock, jid: msg.chat, quoted: msg, instagramUrl });
      if (name === 'preview') return sendLinkPreviewProbe({ sock, jid: msg.chat, quoted: msg, instagramUrl });
      if (name === 'ad') return sendExternalAdProbe({ sock, jid: msg.chat, quoted: msg, instagramUrl });
      if (name === 'table') return sendRichTableProbe({ sock, jid: msg.chat, quoted: msg });
      if (name === 'ai') {
        if (msg.chat.endsWith('@g.us')) {
          return sock.sendMessage(msg.chat, { text: '⚠️ La marca IA suele funcionar solo en privado. Prueba este modo por DM.' }, { quoted: msg });
        }
        return sock.sendMessage(msg.chat, { text: '🤖 Prueba de etiqueta IA en privado. Si aparece icono IA, esta ruta sirve para respuestas Gemini.', ai: true }, { quoted: msg });
      }
      return msg.reply(help(usedPrefix));
    };

    try {
      if (mode === 'all') {
        await runOne('botones');
        await runOne('ig');
        await runOne('preview');
        await runOne('ad');
        await runOne('table');
        if (!msg.chat.endsWith('@g.us')) await runOne('ai');
        return;
      }
      await runOne(mode);
    } catch (error) {
      await sock.sendMessage(msg.chat, {
        text: `❌ Rich UI falló en modo *${mode}*.\n\nFallback activo, el bot no se rompió.\nError: ${error?.message || error}`,
      }, { quoted: msg });
    }
  },
};
