import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import moment from 'moment-timezone';
import { bodyMenu, menuObject } from '#system/commands';
import {
  handleNativeMenuResponse,
  isNativeMenuResponse,
  sendNativeCategoryMenu,
} from '#lib/native-menu';
import db from '#db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_BANNER = path.resolve(__dirname, '..', '..', 'media', 'menu.jpg');

// Cache del banner en memoria (leer disco UNA SOLA VEZ al iniciar)
let _bannerCache = null;
let _bannerMtime = 0;
function getBannerBuffer() {
  try {
    if (!fs.existsSync(LOCAL_BANNER)) return null;
    const stat = fs.statSync(LOCAL_BANNER);
    if (_bannerCache && stat.mtimeMs === _bannerMtime) return _bannerCache;
    _bannerCache = fs.readFileSync(LOCAL_BANNER);
    _bannerMtime = stat.mtimeMs;
    return _bannerCache;
  } catch {
    return null;
  }
}
// Precalentar al cargar
getBannerBuffer();

function normalize(text = '') {
  text = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return text.endsWith('s') ? text.slice(0, -1) : text;
}

function formatearMs(ms) {
  const segundos = Math.floor(ms / 1000);
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);
  return [dias && `${dias}d`, `${horas % 24}h`, `${minutos % 60}m`, `${segundos % 60}s`].filter(Boolean).join(' ');
}

const menuCommand = {
  command: ['allmenu', 'help', 'menu', 'ayuda', 'menumanual', 'menunativo'],
  category: 'main',
  description: 'Ver el menú de comandos.',
  before: async ({ msg, sock }) => {
    if (!msg?.message || !isNativeMenuResponse(msg)) return;

    const botId = sock?.user?.id ? `${sock.user.id.split(':')[0]}@s.whatsapp.net` : '';
    const settings = botId ? (db.getSettings(botId) || {}) : {};
    const configuredPrefix = Array.isArray(settings.prefix)
      ? (settings.prefix.includes('.') ? '.' : (settings.prefix[0] || '.'))
      : typeof settings.prefix === 'string'
        ? (settings.prefix || '.')
        : settings.prefix === 1
          ? ''
          : '.';

    try {
      await handleNativeMenuResponse({
        msg,
        sock,
        prefix: configuredPrefix,
        onCategory: (category) => menuCommand.run({
          msg,
          sock,
          args: [category],
          usedPrefix: configuredPrefix,
          command: 'menu',
        }),
      });
    } catch (error) {
      console.error('[NATIVE MENU RESPONSE ERROR]', error);
      try {
        await sock.sendMessage(msg.chat, {
          text: `No pude abrir esa categoría. Usa *${configuredPrefix}menumanual* para ver el menú en texto e imagen.`,
        }, { quoted: msg });
      } catch {}
    }
  },
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const now = new Date();
      const nowMx = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const tiempo = nowMx.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
      const tempo = moment.tz('America/Mexico_City').format('hh:mm A');

      const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net';
      const botSettings = db.getSettings(botId) || {};
      const botname = botSettings.botname || global.botname || 'Ginko-MD';
      const namebot = botSettings.namebot || botname;
      const owner = botSettings.owner || (global.owner && global.owner[0] ? global.owner[0] + '@s.whatsapp.net' : '');
      const prefix = botSettings.prefix || usedPrefix;

      // Banner local (Bocchi)
      let banner = botSettings.banner || '';
      if ((!banner || banner.includes('yuki-wabot')) && fs.existsSync(LOCAL_BANNER)) {
        banner = LOCAL_BANNER;
      }

      const instagram = (global.links && global.links.instagram) || '';

      const { resolveChannel, getChannelInfo } = await import('#lib/channel');
      resolveChannel(sock, db).catch(()=>{});
      const chInfo = getChannelInfo();
      let canalId = chInfo.id || botSettings.newsletter_id || '';
      let canalName = (chInfo.resolved ? chInfo.name : '') || botSettings.nameid || '';
      if (canalId && canalId.includes('120363401404146384')) { canalId = ''; canalName = ''; }
      if (canalName && /yuki|ყµҡเ/i.test(canalName)) { canalName = ''; canalId = ''; }

      const isOficialBot = global.sock?.user?.id && botId === (global.sock.user.id.split(':')[0] + '@s.whatsapp.net');
      const botType = isOficialBot ? 'Principal/Owner' : 'Sub Bot';
      const users = db.getUser();
      const usersCount = users?.length || 0;
      const { getDevice } = await import('baileys');
      const device = getDevice(msg.key.id);
      const userGlobal = db.getUser(msg.sender);
      const sender = userGlobal?.name || msg.pushName || 'Usuario';
      const time = sock.uptime ? formatearMs(Date.now() - sock.uptime) : 'Desconocido';

      const alias = {
        main: ['main', 'principal', 'general'],
        anime: ['anime', 'reacciones'],
        downloads: ['downloads', 'descargas'],
        economia: ['economia', 'economy', 'eco'],
        fun: ['fun', 'diversion', 'entretenimiento', 'juegos'],
        gacha: ['gacha', 'rpg'],
        grupo: ['grupo', 'group'],
        nsfw: ['nsfw', '+18'],
        profile: ['profile', 'perfil'],
        sockets: ['sockets', 'bots'],
        stickers: ['stickers', 'sticker'],
        utils: ['utils', 'utilidades', 'herramientas']
      };
      const input = normalize(args[0] || '');
      const cat = Object.keys(alias).find(k => alias[k].map(normalize).includes(input));
      const category = `${cat ? ` para \`${cat}\`` : '. *(˶ᵔ ᵕ ᵔ˶)*'}`;
      if (args[0] && !cat) {
        return msg.reply(`《✧》La categoria *${args[0]}* no existe, las categorias disponibles son: *${Object.keys(alias).join(', ')}*.\n> Para ver la lista completa escribe *${usedPrefix}menu*\n> Para ver los comandos de una categoría escribe *${usedPrefix}menu [categoría]*\n> Ejemplo: *${usedPrefix}menu anime*`);
      }

      const sections = menuObject;
      const content = cat ? String(sections[cat] || '') : Object.values(sections).map(s => String(s || '')).join('\n\n');
      let menu = bodyMenu ? String(bodyMenu || '') + '\n\n' + content : content;

      const replacements = {
        $owner: owner ? (isNaN(owner.replace(/@s\.whatsapp\.net$/, '')) ? owner : ((db.getUser(owner))?.name || owner.split('@')[0])) : 'Oculto por privacidad',
        $botType: botType,
        $device: device,
        $tiempo: tiempo,
        $tempo: tempo,
        $users: usersCount.toLocaleString(),
        $instagram: instagram,
        $cat: category,
        $sender: sender,
        $botname: botname,
        $namebot: namebot,
        $prefix: usedPrefix,
        $uptime: time
      };
      for (const [key, value] of Object.entries(replacements)) {
        menu = menu.replace(new RegExp(`\\${key}`, 'g'), value);
      }

      // Pista de descubrimiento del dropdown (solo en el menú de texto).
      if (!wantNative) {
        menu += `\n\n> 💡 Si tu WhatsApp tiene botones nativos, probá *${usedPrefix}menunativo* para el menú desplegable.`;
      }

      const mentioned = [owner, msg.sender].filter(Boolean);

      const isGroup = msg.chat.endsWith('@g.us');
      const contextInfo = { mentionedJid: mentioned };
      if (isGroup && canalId && canalName) {
        contextInfo.isForwarded = true;
        contextInfo.forwardedNewsletterMessageInfo = {
          newsletterJid: canalId,
          serverMessageId: 0,
          newsletterName: canalName
        };
      }

      // El selector nativo (dropdown) es OPCIONAL y NO es el camino por defecto:
      // en muchos clientes oficiales WhatsApp muestra "mensaje no compatible",
      // así que .menu usa el menú de texto+banner confiable. El dropdown se
      // pide con .menunativo, o se reactiva para .menu con GINKO_NATIVE_MENU=1.
      const nativeEnabled = process.env.GINKO_NATIVE_MENU === '1';
      const wantNative = command === 'menunativo' || (command === 'menu' && nativeEnabled);
      if (wantNative && !cat) {
        const nativeBody = `🌸 *${namebot}*\nSelecciona una categoría para ver sus comandos.\n\n> Si tu WhatsApp no muestra el selector, usa *${usedPrefix}menumanual*.`;
        const nativeResult = await sendNativeCategoryMenu({
          sock,
          jid: msg.chat,
          body: nativeBody,
          footer: `${namebot} · menú nativo`,
          title: '🌸 Categorías',
          quoted: msg,
          bannerBuffer: banner === LOCAL_BANNER ? getBannerBuffer() : null,
        });
        if (nativeResult.sent) return;
        console.warn('[NATIVE MENU FALLBACK]', nativeResult.error?.message || nativeResult.error || 'error desconocido');
      }

      if (banner && (banner === LOCAL_BANNER || fs.existsSync(banner))) {
        const isVideo = /\.(mp4|webm)(\?|$)/i.test(banner);
        // Usar caché para el banner local
        let mediaBuffer;
        if (banner === LOCAL_BANNER) {
          mediaBuffer = getBannerBuffer();
        } else {
          mediaBuffer = fs.readFileSync(banner);
        }
        if (mediaBuffer) {
          const media = isVideo
            ? { video: mediaBuffer, gifPlayback: true, caption: menu.trim(), contextInfo }
            : { image: mediaBuffer, caption: menu.trim(), contextInfo };
          await sock.sendMessage(msg.chat, media, { quoted: msg });
        } else {
          await sock.sendMessage(msg.chat, { text: menu.trim(), contextInfo }, { quoted: msg });
        }
      } else {
        await sock.sendMessage(msg.chat, { text: menu.trim(), contextInfo }, { quoted: msg });
      }
    } catch (e) {
      console.error('[MENU ERROR]', e);
      await msg.reply(`> Ocurrió un error al mostrar el menú.\n> [Error: *${e.message}*]`);
    }
  }
};

export default menuCommand;
