/**
 * 🧠 Ginko — Agente IA autónomo (experimental, Lab2).
 * Usa OpenRouter (modelos :free). Sin key → modo manual (explica cómo activarlo).
 * Las tools destructivas solo actúan si el usuario es el DUEÑO.
 *
 * Subcomandos:
 *   .ginko <pregunta>        → el agente razona y usa herramientas.
 *   .ginko reset | clear     → limpia la memoria de este chat.
 *   .ginko status            → estado del agente (disponible ?).
 */
import { runAgent, resetMemory, agentHealth } from '#agent';

const LIMIT = 3800; // WhatsApp corta mensajes ~4096; dejamos margen.

export default {
  command: ['ginko', 'agente', 'ai'],
  category: 'ai',
  description: 'Agente IA autónomo (OpenRouter). Usa herramientas y diagnostica el bot.',
  run: async ({ msg, sock, args, usedPrefix, command, text, isOwner }) => {
    const sub = (args[0] || '').toLowerCase();
    const chatKey = String(msg.chat || 'dm');

    // ── reset memoria ──
    if (sub === 'reset' || sub === 'clear' || sub === 'limpiar') {
      resetMemory(chatKey);
      return msg.reply('> 🧹 Memoria de este chat limpiada. ¡Empecemos de nuevo! ✨');
    }
    // ── status ──
    if (sub === 'status' || sub === 'info') {
      const h = agentHealth();
      return msg.reply(
        `> 🧠 *Ginko* (agente)\n` +
        `> IA activa › ${h.available ? '✅ Sí' : '❌ No (modo manual)'}\n` +
        `> Herramientas › ${h.tools}\n` +
        `> Memoria de chats › ${h.memories}\n` +
        `> Máx. pasos › ${h.maxIterations}`
      );
    }

    const pregunta = text || (msg.quoted?.text || '');
    if (!pregunta.trim()) {
      return msg.reply(
        `> ꒰ঌ(˶ˆᗜˆ˵)໒꒱ *Ginko* está aquí. Dime algo y yo me encargo... 🧠\n` +
        `> Ejemplo: *${usedPrefix}${command} ¿cómo uso el comando .cache?*\n` +
        (isOwner ? `> Amo, también puedo: *${usedPrefix}${command} revisa que image.js no tenga errores*` : '')
      );
    }

    await msg.react?.('⏳');
    try {
      const res = await runAgent({
        m: msg,
        text: pregunta.trim(),
        isOwner,
        pushName: msg.pushName || 'invitado',
        sock,
        usedPrefix,
      });
      await msg.react?.('🌸');
      const out = String(res.text || '').trim();
      if (!out) {
        return msg.reply(res.handOff
          ? '> 🧠 Ya resolví bastante; sigo en segundo plano. Pregúntame algo más si quieres. 🌸'
          : '> 🌸 Listo (sin texto).');
      }
      return msg.reply(out.length > LIMIT ? out.slice(0, LIMIT) + '…' : out);
    } catch (e) {
      await msg.react?.('❌');
      return msg.reply(`> Ocurrió un error con *Ginko*.\n> [${String(e?.message || e).slice(0, 240)}]`);
    }
  },
};
