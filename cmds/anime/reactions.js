import fetch from 'node-fetch';

const actions = {
  hug: ['hug', 'abrazar'], pat: ['pat', 'acariciar'], kiss: ['kiss', 'muak'],
  dance: ['dance', 'bailar'], happy: ['happy', 'feliz'], sad: ['sad', 'triste'],
  angry: ['angry', 'enojado'], cry: ['cry', 'llorar'], smile: ['smile', 'sonreir'],
  wave: ['wave', 'saludar'], wink: ['wink', 'guiñar'], slap: ['slap', 'bofetada'],
  bite: ['bite', 'morder'], bonk: ['bonk', 'golpe'], cuddle: ['cuddle', 'acurrucar'],
  eat: ['eat', 'nom', 'comer'], kill: ['kill', 'matar'], lick: ['lick', 'lamer'],
  run: ['run', 'correr'], kisscheek: ['kisscheek', 'beso'], shy: ['shy', 'timido'],
};
const verbs = {
  hug: 'le dio un abrazo a', pat: 'acarició a', kiss: 'le dio un beso a', dance: 'está bailando con',
  happy: 'está feliz con', sad: 'está triste por', angry: 'está enojado con', cry: 'está llorando por',
  smile: 'le sonrió a', wave: 'está saludando a', wink: 'le guiñó a', slap: 'le dio una bofetada a',
  bite: 'mordió a', bonk: 'le dio un golpe a', cuddle: 'se acurrucó con', eat: 'está comiendo con',
  kill: 'eliminó dramáticamente a', lick: 'lamió a', run: 'está corriendo con', kisscheek: 'besó en la mejilla a', shy: 'se puso tímido frente a',
};
export default {
  command: Object.values(actions).flat(), category: 'anime', description: 'Reacciones de anime con GIF.',
  async run({ msg, sock, command, usedPrefix }) {
    const action = Object.keys(actions).find(k => actions[k].includes(String(command).toLowerCase())) || 'hug';
    const target = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
    const from = msg.pushName || msg.sender.split('@')[0];
    const to = target === msg.sender ? 'sí mismo' : `@${target.split('@')[0]}`;
    const caption = target === msg.sender ? `*${from}* ${verbs[action].replace(/ a$| con$| por$| frente a$/, '')} sí mismo ✨` : `*${from}* ${verbs[action]} *${to}* ✨`;
    try {
      if (msg.chat.endsWith('@g.us')) {
        const res = await fetch(`${global.APIs?.Ginko?.url || ''}/sfw/interaction?inter=${action}&key=${global.APIs?.Ginko?.key || ''}`);
        if (!res.ok) throw new Error(`API respondió ${res.status}`);
        const data = await res.json();
        const url = data?.result || data?.url || data?.data;
        if (!url) throw new Error('La API no devolvió un GIF');
        return await sock.sendMessage(msg.chat, { video: { url }, gifPlayback: true, caption, mentions: target === msg.sender ? [msg.sender] : [target] }, { quoted: msg });
      }
      return msg.reply(`✨ *${from}* ${verbs[action]} *${to}*`);
    } catch (error) {
      return msg.reply(`❌ No pude ejecutar *${usedPrefix}${command}*.\n> ${error.message}`);
    }
  },
};
