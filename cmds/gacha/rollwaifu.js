import { fastFetch } from '#lib/fastFetch';
import { promises as fs } from 'fs';
import db from '#db';

const FILE_PATH = './core/characters.json';
const rollLocks = new Map();

// Cache en memoria de personajes (leer disco UNA SOLA VEZ, no cada vez que se usa el comando)
let charactersCache = null;
let charactersCacheTime = 0;
let lastMtime = 0;
const CHARACTERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function cleanOldLocks() {
  const now = Date.now();
  for (const [userId, lockTime] of rollLocks.entries()) {
    if (now - lockTime > 30000) rollLocks.delete(userId);
  }
}

async function loadCharacters() {
  try {
    const stat = await fs.stat(FILE_PATH);
    const now = Date.now();
    // Usar caché si el archivo no cambió y no expiró
    if (charactersCache && stat.mtimeMs === lastMtime && now - charactersCacheTime < CHARACTERS_CACHE_TTL) {
      return charactersCache;
    }
    const raw = await fs.readFile(FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    charactersCache = parsed;
    charactersCacheTime = now;
    lastMtime = stat.mtimeMs;
    return parsed;
  } catch (e) {
    await fs.writeFile(FILE_PATH, '{}');
    return {};
  }
}

// Precalentar caché al cargar el comando
loadCharacters().catch(() => {});

function flattenCharacters(chars) {
  return Object.values(chars).flatMap(s => Array.isArray(s.characters) ? s.characters : []);
}

function getSeriesNameByCharacter(chars, id) {
  return Object.entries(chars).find(([, serie]) => Array.isArray(serie.characters) && serie.characters.some(c => String(c.id) === String(id)))?.[1]?.name || 'Desconocido';
}

function formatTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, '_');
}

function getRefererForUrl(url) {
  if (url.includes('safebooru.org')) return 'https://safebooru.org/';
  if (url.includes('danbooru.donmai.us')) return 'https://danbooru.donmai.us/';
  if (url.includes('gelbooru.com')) return 'https://gelbooru.com/';
  return '';
}

async function buscarImagenDelirius(tag) {
  const query = formatTag(tag);
  const urls = [
    `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${query}`,
    `https://danbooru.donmai.us/posts.json?tags=${query}`,
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${query}&api_key=98f554258c88c44f4dd28ccde0c28f36682b2a992490ab35ebcc7baf7e196a86d7550b174bce577b8cc3f544e9b3ad0f6aeb09ad63bf89a9141cc3eddb6fbfd2&user_id=1917269`
  ];
  
  // BUSCAR EN LAS 3 FUENTES EN PARALELO (no esperar que termine una para probar la otra)
  const results = await Promise.allSettled(urls.map(async (url) => {
    try {
      const res = await fastFetch(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('json')) return [];
      const json = await res.json();
      const data = Array.isArray(json) ? json : json?.post || json?.data || [];
      return data.map(i => i?.file_url || i?.large_file_url || i?.image || i?.media_asset?.variants?.[0]?.url).filter(u => typeof u === 'string' && /\.(jpe?g|png)$/.test(u));
    } catch {
      return [];
    }
  }));
  
  // Juntar todos los resultados válidos
  const allUrls = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allUrls.push(...r.value);
    }
  }
  return allUrls;
}

export default {
  command: ['rollwaifu', 'rw', 'roll'],
  category: 'gacha',
  description: 'Waifu o husbando aleatorio.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const userId = msg.sender;
    const chatId = msg.chat;
    cleanOldLocks();
    if (rollLocks.has(userId)) {
      const lockTime = rollLocks.get(userId);
      const now = Date.now();
      if (now - lockTime < 15000) return;
      rollLocks.delete(userId);
    }
    let chat = db.getChat(chatId);
    if (chat.adminonly || !chat.gacha) {
      return msg.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`);
    }
    db.setCreate('chat_users', [chatId, userId], 'lastRoll', 0);
    let user = db.getChatUser(chatId, userId);
    let me = user;
    const now = Date.now();
    const cooldown = 15 * 60 * 1000;
    if (me.lastRoll && now < me.lastRoll) {
      const r = Math.ceil((me.lastRoll - now) / 1000);
      const min = Math.floor(r / 60);
      const sec = r % 60;
      let timeText = '';
      if (min > 0) timeText += `${min} minuto${min !== 1 ? 's' : ''} `;
      if (sec > 0 || timeText === '') timeText += `${sec} segundo${sec !== 1 ? 's' : ''}`;
      return msg.reply(`ꕥ Debes esperar *${timeText.trim()}* para usar *${usedPrefix + 'rw'}* de nuevo.`);
    }
    rollLocks.set(userId, now);
    
    // Reaccionar INMEDIATAMENTE para que el usuario vea que el bot respondió
    try { await sock.sendMessage(chatId, { react: { text: '🎲', key: msg.key } }); } catch {}
    
    try {
      // Cargar personajes del caché (no lee disco si ya está cargado)
      const chars = await loadCharacters();
      const all = flattenCharacters(chars);
      const selected = all[Math.floor(Math.random() * all.length)];
      const id = String(selected.id);
      const source = getSeriesNameByCharacter(chars, selected.id);
      const baseTag = formatTag(selected.tags?.[0] || '');
      
      // Buscar imágenes en paralelo
      const mediaList = await buscarImagenDelirius(baseTag);
      const media = mediaList.length > 0 ? mediaList[Math.floor(Math.random() * mediaList.length)] : null;
      
      if (!media) {
        rollLocks.delete(userId);
        try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
        return msg.reply(`ꕥ No se encontró imágenes para el personaje *${selected.name}*.`);
      }
      const charKey = chatId + '__' + id;
      if (!db.getCharacter(charKey)) {
        db.setCharacter(charKey, { name: String(selected.name || 'Sin nombre') });
      } else if (!db.getCharacter(charKey)?.name) {
        db.setCharacter(charKey, { ...db.getCharacter(charKey), name: String(selected.name || 'Sin nombre') });
      }
      const globalChar = db.getCharacter(id) || {};
      let chatChar = db.getCharacter(charKey) || {};
      chatChar.name = String(selected.name || 'Sin nombre');
      chatChar.value = typeof globalChar.value === 'number' ? globalChar.value : Number(selected.value) || 100;
      chatChar.votes = Number(chatChar.votes || globalChar.votes || 0);
      chatChar.reservedBy = userId;
      chatChar.reservedUntil = now + 20000;
      chatChar.expiresAt = now + 60000;
      db.setCharacter(charKey, chatChar);
      const claimedBy = chatChar?.user || null;
      const owner = claimedBy ? (db.getUser(claimedBy))?.name || claimedBy.split('@')[0] : 'desconocido';
      const caption = `❀ Nombre » *${chatChar.name}*\n⚥ Género » *${selected.gender || 'Desconocido'}*\n✰ Valor » *${chatChar.value.toLocaleString()}*\n♡ Estado » *${claimedBy ? `Reclamado por ${owner}` : 'Libre'}*\n❖ Fuente » *${source}*\u206c`;
      
      // Descargar imagen con fastFetch (más rápido con keep-alive)
      const imgRes = await fastFetch(media, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': getRefererForUrl(media)
        }
      });
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      
      const sent = await sock.sendMessage(chatId, { image: buffer, caption: caption }, { quoted: msg });
      
      if (!chat.rolls) chat.rolls = {};
      chat.rolls[sent.key.id] = { id, charKey, name: chatChar.name, expiresAt: chatChar.expiresAt, reservedBy: userId, reservedUntil: chatChar.reservedUntil };
      db.setChat(chatId, 'rolls', chat.rolls);
      db.setChatUser(chatId, userId, 'lastRoll', now + cooldown);
      try { await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } }); } catch {}
    } catch (e) {
      try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
      await msg.reply(`> Ocurrió un error al ejecutar *${usedPrefix + command}*.\n> Error: *${e.message}*`);
    } finally {
      rollLocks.delete(userId);
    }
  }
};
