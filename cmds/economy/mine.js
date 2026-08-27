import db from '#db';
import { geminiGenerate } from '#lib/geminiRole';
import { getSelectedResponse } from '#lib/interactive-response';
import {
  addIdentity,
  collectOwnerIdentities,
  createEventToken,
  expandWithParticipants,
  normalizeIdentityJid,
  parseActionButtonId,
  participantIdentities,
  sameIdentity,
} from '#lib/jidIdentity';

/**
 * .mine / .minar / .excavar
 * Sistema de minería (economía) con:
 *  - Pico requerido, durabilidad, stamina
 *  - Recompensa en monedas
 *  - Narración IA (si hay key configurada), fallback a escenarios clásicos
 *  - Eventos aleatorios con botones nativos (~50% probabilidad)
 */

const COOLDOWN_MIN = 10;
const EVENT_CHANCE = 0.50;

const BTN_PREFIX = '__ginko_mine_';
const PENDING_TTL = 3 * 60 * 1000; // 3 min para responder al evento

function getPendingMap(sock) {
  if (!sock._ginkoMinePending) sock._ginkoMinePending = new Map();
  return sock._ginkoMinePending;
}

function registrarListener(sock) {
  if (sock._ginkoMineListener) return;
  sock._ginkoMineListener = true;
  // Limpieza periódica de jobs viejos
  setInterval(() => {
    const now = Date.now();
    const m = getPendingMap(sock);
    for (const [id, job] of m) if (now - job.ts > PENDING_TTL) m.delete(id);
  }, 60000).unref?.();

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages || []) {
      if (!m?.message || !m?.key?.id) continue;
      if (m.key.fromMe) continue;
      try { await procesarRespuesta(sock, m); } catch {}
    }
  });
}

function parseMineButtonId(buttonId = '') {
  return parseActionButtonId(buttonId, BTN_PREFIX);
}

async function procesarRespuesta(sock, m) {
  const pending = getPendingMap(sock);
  if (pending.size === 0) return;

  const selected = getSelectedResponse(m);
  const parsed = parseMineButtonId(selected?.id);
  if (!parsed) return;
  const stanzaId = selected?.stanzaId || selected?.contextInfo?.stanzaId || '';
  const job = (stanzaId && pending.get(stanzaId)) || (parsed.token && pending.get(parsed.token));
  if (!job) return;
  if (normalizeIdentityJid(m.key.remoteJid) !== normalizeIdentityJid(job.chatId)) return;

  // Solo el usuario que generó la minería puede responder. En grupos WhatsApp
  // puede entregar el tap como @lid, phoneNumber o id con :device; por eso
  // comparamos todas las identidades conocidas del participante, no solo strings.
  if (String(m.key.remoteJid || '').endsWith('@g.us')) {
    const responderIds = await collectResponderIdentities(sock, m, job, selected);
    if (!sameIdentity(responderIds, job.ownerIds || [job.userId])) {
      return sock.sendMessage(job.chatId, { text: '✖ Este evento no es tuyo.' }, { quoted: m }).catch(() => {});
    }
  }

  for (const key of job.pendingKeys || [stanzaId, parsed.token]) {
    if (key) pending.delete(key);
  }
  const eligeSi = parsed.action === 'si';
  await resolverEvento(sock, job, eligeSi, m);
}

async function resolverEvento(sock, job, eligeSi, m) {
  const { chatId, userId, evento } = job;
  const cu = db.getChatUser(chatId, userId) || job.user;
  let resultado = '';
  let coinsExtra = 0;
  let staminaCambio = 0;

  if (eligeSi) {
    const suerte = Math.random();
    if (suerte < evento.probExito) {
      coinsExtra = evento.recompensa;
      resultado = evento.msgExito;
    } else {
      coinsExtra = evento.castigo;
      staminaCambio = evento.staminaCastigo || 0;
      resultado = evento.msgFracaso;
    }
  } else {
    resultado = evento.msgRechazo;
  }

  if (coinsExtra !== 0) {
    const nuevas = Math.max(0, (cu.coins || 0) + coinsExtra);
    db.setChatUser(chatId, userId, 'coins', nuevas);
  }
  if (staminaCambio !== 0) {
    const nuevaSt = Math.max(0, Math.min(100, (cu.stamina || 0) + staminaCambio));
    db.setChatUser(chatId, userId, 'stamina', nuevaSt);
  }

  const lineaCoins = coinsExtra > 0
    ? `\n💰 *+${coinsExtra.toLocaleString()}* ${job.monedas}`
    : coinsExtra < 0
      ? `\n💸 *${coinsExtra.toLocaleString()}* ${job.monedas}`
      : '';
  const lineaSt = staminaCambio < 0
    ? `\n⚡ *${staminaCambio}* stamina`
    : staminaCambio > 0
      ? `\n⚡ *+${staminaCambio}* stamina`
      : '';

  await sock.sendMessage(chatId, {
    text: `${resultado}${lineaCoins}${lineaSt}`
  }, { quoted: m });
}

function msToTime(duration) {
  let seconds = Math.floor((duration / 1000) % 60);
  let minutes = Math.floor((duration / (1000 * 60)) % 60);
  minutes = minutes < 10 ? '0' + minutes : minutes;
  seconds = seconds < 10 ? '0' + seconds : seconds;
  if (minutes === '00') return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
  return `${minutes} minuto${minutes > 1 ? 's' : ''}, ${seconds} segundo${seconds > 1 ? 's' : ''}`;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const escenarios = [
  'una cueva oscura y húmeda',
  'la cima de una montaña nevada',
  'un bosque misterioso lleno de raíces',
  'un río cristalino y caudaloso',
  'una mina abandonada de carbón',
  'las ruinas de un antiguo castillo',
  'una playa desierta con arena dorada',
  'un valle escondido entre colinas',
  'un arbusto espinoso al borde del camino',
  'un tronco hueco en medio del bosque',
  'el Bosque de Ginko entre hojas doradas',
];

const mineria = [
  'encontraste un antiguo cofre con',
  'hallaste una bolsa llena de',
  'descubriste un saco de',
  'desenterraste monedas antiguas que contienen',
  'rompiste una roca y adentro estaba',
  'cavando profundo, hallaste',
  'entre las raíces, encontraste',
  'dentro de una caja olvidada, hallaste',
  'bajo unas piedras, descubriste',
  'entre los escombros de un lugar viejo, encontraste',
];

const eventos = [
  {
    id: 'cofre',
    titulo: '🎁 Cofre misterioso',
    descripcion: 'Encuentras un cofre cerrado con un candado oxidado. ¿Lo abres?',
    txtSi: '🗝️ Abrirlo',
    txtNo: '🚶 Ignorar',
    probExito: 0.65,
    recompensa: 3500,
    castigo: -800,
    staminaCastigo: -5,
    msgExito: '🗝️ ¡El cofre tenía monedas brillantes adentro!',
    msgFracaso: '💥 ¡Era una trampa! Un resorte te golpea la mano.',
    msgRechazo: '🚶 Decides no arriesgarte y sigues tu camino.',
  },
  {
    id: 'duende',
    titulo: '🧌 Duende de la mina',
    descripcion: 'Un duende chistoso te ofrece apostar 500 monedas al doble o nada. ¿Aceptas?',
    txtSi: '🎲 Apostar',
    txtNo: '🙅 Pasar',
    probExito: 0.5,
    recompensa: 1000,
    castigo: -500,
    staminaCastigo: 0,
    msgExito: '🎲 ¡Ganaste! El duende gruñe pero te paga el doble.',
    msgFracaso: '😂 El duende se ríe y te roba 500 monedas. ¡Tramposo!',
    msgRechazo: '🙅 Rechazas la apuesta. El duende se encoge de hombros y desaparece.',
  },
  {
    id: 'roca',
    titulo: '🪨 Roca brillante',
    descripcion: 'Ves una roca que brilla raro al fondo. Parece pesada pero puede tener algo bueno. ¿La rompes?',
    txtSi: '💪 Romperla',
    txtNo: '➡️ Dejarla',
    probExito: 0.45,
    recompensa: 2500,
    castigo: -200,
    staminaCastigo: -10,
    msgExito: '💎 ¡Dentro había un puñado de gemas!',
    msgFracaso: '😮‍💨 Solo era pirita (oro falso) y te cansaste de más.',
    msgRechazo: '➡️ Sigues caminando. Mejor no arriesgar el pico.',
  },
  {
    id: 'gato',
    titulo: '🐈 Gato negro',
    descripcion: 'Un gato negro te sigue maullando y te pide que le des algo de comer (200 monedas). ¿Se las das?',
    txtSi: '🥩 Darle',
    txtNo: '🙈 Ignorar',
    probExito: 0.85,
    recompensa: 2000,
    castigo: -200,
    staminaCastigo: 0,
    msgExito: '🍀 ¡El gato te trae una bolsa de monedas como agradecimiento!',
    msgFracaso: '🐈‍⬛ Te mira mal y se lleva 200 monedas de tu bolsillo. Ingrato.',
    msgRechazo: '🙈 El gato se va maullando. Quizá la próxima...',
  },
];

export default {
  command: ['mine', 'minar', 'excavar'],
  category: 'economy',
  description: 'Realizar trabajos de minería y ganar coins.',
  run: async ({ msg, sock, usedPrefix, groupMetadata }) => {
    const chat = db.getChat(msg.chat);
    if (chat.adminonly || !chat.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }
    const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net';
    const botSettings = db.getSettings(botId);
    const monedas = botSettings?.currency || 'Coins';
    db.setCreate('chat_users', [msg.chat, msg.sender], 'tools', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastmine', 0);
    let user = db.getChatUser(msg.chat, msg.sender);
    if (user.tools && typeof user.tools === 'string') {
      try { user.tools = JSON.parse(user.tools); } catch { user.tools = {}; }
    }
    const staminaConsumed = Math.floor(Math.random() * (5 - 1 + 1)) + 1;
    if (user.stamina < staminaConsumed) {
      return msg.reply(`ꕥ No tienes suficiente energía para ir a minar.\n> Usa *${usedPrefix}heal* para curarte.`);
    }
    if (!user.tools?.pico) {
      return msg.reply(`ꕥ Necesitas un Pico para minar.\n> Compra uno en la tienda con: *${usedPrefix}buy pico*`);
    }
    if (user.tools.pico.durability <= 10) {
      delete user.tools.pico;
      db.setChatUser(msg.chat, msg.sender, 'tools', user.tools);
      return msg.reply(`ꕥ Tu Pico se ha roto por el uso y ha sido eliminado de tu inventario.\n> Compra uno nuevo con: *${usedPrefix}buy pico*`);
    }
    const remaining = user.lastmine - Date.now();
    if (remaining > 0) {
      return msg.reply(`ꕥ Debes esperar *${msToTime(remaining)}* para minar de nuevo.`);
    }

    await msg.react('⛏️');

    user.stamina -= staminaConsumed;
    db.setChatUser(msg.chat, msg.sender, 'stamina', user.stamina);
    const durabilityConsumed = Math.floor(Math.random() * (15 - 1 + 1)) + 1;
    user.tools.pico.durability -= durabilityConsumed;
    if (user.tools.pico.durability <= 10) delete user.tools.pico;
    db.setChatUser(msg.chat, msg.sender, 'tools', user.tools);
    user.lastmine = Date.now() + COOLDOWN_MIN * 60 * 1000;
    db.setChatUser(msg.chat, msg.sender, 'lastmine', user.lastmine);

    const isLegendary = Math.random() < 0.02;
    let reward, narration, bonusMsg = '';
    const pushName = msg.pushName || 'Minero/a';

    if (isLegendary) {
      reward = Math.floor(Math.random() * (13000 - 11000 + 1)) + 11000;
      const iaLegend = await geminiGenerate(
        `El minero "${pushName}" acaba de encontrar un TESORO LEGENDARIO en la mina. Escribe UNA oración muy emocionante y corta (máximo 20 palabras) en español narrando el hallazgo épico, mencionando oro o diamantes. NO uses markdown.`,
        { maxTokens: 120, temperature: 1 }
      ).catch(() => null);
      narration = iaLegend || '💎 ¡DESCUBRISTE UN TESORO LEGENDARIO! 💎';
      bonusMsg = '\nꕥ Recompensa ÉPICA obtenida!';
    } else {
      reward = Math.floor(Math.random() * (9500 - 7000 + 1)) + 7000;
      const scenario = pickRandom(escenarios);
      const accion = pickRandom(mineria);
      let narr;
      if (Math.random() < 0.5) {
        narr = await geminiGenerate(
          `Escribe UNA oración corta (máximo 25 palabras) en español, en segunda persona, narrando que "${pushName}" está minando en ${scenario} y ${accion}. Tono aventurero, casual, divertido. NO emojis, NO markdown.`,
          { maxTokens: 120, temperature: 0.9 }
        ).catch(() => null);
      }
      narration = narr || `En ${scenario}, ${accion}`;
      if (Math.random() < 0.1) {
        const bonus = Math.floor(Math.random() * (4500 - 2500 + 1)) + 2500;
        reward += bonus;
        bonusMsg = `\n「✿」 ¡Bonus de minería! Ganaste *${bonus.toLocaleString()}* ${monedas} extra`;
      }
    }

    user.coins += reward;
    db.setChatUser(msg.chat, msg.sender, 'coins', user.coins);

    const hayEvento = !isLegendary && Math.random() < EVENT_CHANCE;

    let caption = `╭⛏️ *Minería*\n│\n│ ${narration}\n│\n│ 💰 *+${reward.toLocaleString()} ${monedas}*\n│ ⚡ Stamina usada: *-${staminaConsumed}*\n│ 🔧 Pico: *${user.tools.pico ? Math.max(0, user.tools.pico.durability) + '%' : 'Roto'}*${bonusMsg}`;
    if (hayEvento) {
      caption += `\n│\n│ ✨ ¡*Evento inesperado!* Algo pasa mientras picás...`;
    }
    caption += `\n╰\`Usa .inventario · .tienda · .claim (recompensa diaria)\``;

    if (!hayEvento) {
      await msg.react(isLegendary ? '💎' : '✨');
      await sock.sendMessage(msg.chat, { text: caption }, { quoted: msg });
      return;
    }

    // ── Evento aleatorio con botones ──
    registrarListener(sock);
    const evento = pickRandom(eventos);
    const eventToken = createEventToken();
    const botones = [
      { buttonId: `${BTN_PREFIX}${eventToken}_si_${evento.id}`, buttonText: { displayText: evento.txtSi }, type: 1 },
      { buttonId: `${BTN_PREFIX}${eventToken}_no_${evento.id}`, buttonText: { displayText: evento.txtNo }, type: 1 },
    ];

    const textoEvento = `\n\n📦 *${evento.titulo}*\n${evento.descripcion}`;

    const payload = {
      text: caption + textoEvento,
      footerText: '❦ Toca un botón para decidir',
      buttons: botones,
      headerType: 1,
    };

    let card;
    try {
      card = await sock.sendMessage(msg.chat, payload, { quoted: msg });
    } catch {
      await sock.sendMessage(msg.chat, {
        text: caption + textoEvento + '\n\n_(No se pudieron mostrar botones, eliges aleatoriamente...)_'
      }, { quoted: msg });
      await resolverEvento(sock, { chatId: msg.chat, userId: msg.sender, evento, user, monedas }, Math.random() < 0.5, msg);
      return;
    }

    if (card?.key?.id) {
      const pendingKeys = [card.key.id, eventToken];
      const job = {
        ts: Date.now(),
        userId: msg.sender,
        ownerIds: collectOwnerIdentities(msg, groupMetadata),
        participants: groupMetadata?.participants || [],
        evento,
        user,
        monedas,
        chatId: msg.chat,
        pendingKeys,
      };
      for (const key of pendingKeys) getPendingMap(sock).set(key, job);
    }
  },
};

export const __mineEventTest = {
  normalizeIdentityJid,
  participantIdentities,
  expandWithParticipants,
  collectOwnerIdentities,
  sameIdentity,
  parseMineButtonId,
};
