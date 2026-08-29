import axios from 'axios';
import db from '#db';
import { withLimit } from '#lib/limits';

export default {
  command: ['imagen', 'img', 'image'],
  category: 'downloads',
  description: 'Buscar y descargar imágenes de Google.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    return withLimit('media', 3, async () => {
    const text = args.join(' ');
    if (!text) {
      return sock.reply(msg.chat, `《✧》 Por favor, Ingrese un término de búsqueda.`, msg);
    }    
    const bannedWords = ['+18', '18+', 'contenido adulto', 'contenido explícito', 'contenido sexual', 'actriz porno', 'actor porno', 'estrella porno', 'pornstar', 'video xxx', 'xxx', 'x x x', 'pornhub', 'xvideos', 'xnxx', 'redtube', 'brazzers', 'onlyfans', 'cam4', 'chaturbate', 'myfreecams', 'bongacams', 'livejasmin', 'spankbang', 'tnaflix', 'hclips', 'fapello', 'mia khalifa', 'lana rhoades', 'riley reid', 'abella danger', 'brandi love', 'eva elfie', 'nicole aniston', 'janice griffith', 'alexis texas', 'lela star', 'gianna michaels', 'adriana chechik', 'asa akira', 'mandy muse', 'kendra lust', 'jordi el niño polla', 'johnny sins', 'danny d', 'manuel ferrara', 'mark rockwell', 'porno', 'porn', 'sexo', 'sex', 'desnudo', 'desnuda', 'erótico', 'erotico', 'erotika', 'tetas', 'pechos', 'boobs', 'boob', 'nalgas', 'culo', 'culos', 'qlos', 'trasero', 'pene', 'verga', 'vergota', 'pito', 'chocha', 'vagina', 'vaginas', 'coño', 'concha', 'genital', 'genitales', 'masturbar', 'masturbación', 'masturbacion', 'gemidos', 'gemir', 'orgía', 'orgy', 'trío', 'trio', 'gangbang', 'creampie', 'facial', 'cum', 'milf', 'teen', 'incesto', 'incest', 'violación', 'violacion', 'rape', 'bdsm', 'hentai', 'tentacle', 'tentáculos', 'fetish', 'fetiche', 'sado', 'sadomaso', 'camgirl', 'camsex', 'camshow', 'playboy', 'playgirl', 'playmate', 'striptease', 'striptis', 'slut', 'puta', 'putas', 'perra', 'perras', 'whore', 'fuck', 'fucking', 'fucked', 'cock', 'dick', 'pussy', 'ass', 'shemale', 'trans', 'transgénero', 'transgenero', 'lesbian', 'lesbiana', 'gay', 'lgbt', 'explicit', 'hardcore', 'softcore', 'nudista', 'nudismo', 'nudity', 'deepthroat', 'dp', 'double penetration', 'analplay', 'analplug', 'rimjob', 'spank', 'spanking', 'lick', 'licking', '69', 'doggystyle', 'reverse cowgirl', 'cowgirl', 'blowjob', 'bj', 'handjob', 'hj', 'p0rn', 's3x', 'v@gina', 'c0ck', 'd1ck', 'fuk', 'fuking', 'fak', 'boobz', 'pusy', 'azz', 'cumshot', 'sexcam', 'livecam', 'webcam', 'sexchat', 'sexshow', 'sexvideo', 'sexvid', 'sexpics', 'sexphoto', 'seximage', 'sexgif', 'pornpic', 'pornimage', 'pornvid', 'pornvideo', 'only fan', 'only-fans', 'only_fans', 'onlyfans.com', 'mia khalifha', 'mia khalifah', 'mia khalifaa', 'mia khalif4', 'mia khal1fa', 'mia khalifa +18', 'mia khalifa xxx', 'mia khalifa desnuda', 'mia khalifa porno'];
    const lowerText = text.toLowerCase();
    const chat = db.getChat(msg.chat);
    const nsfwEnabled = chat.nsfw === 1;
    if (!nsfwEnabled && bannedWords.some(word => lowerText.includes(word))) {
      return msg.reply('《✧》 Este comando no *permite* búsquedas de contenido *+18* o *NSFW*');
    }    
    try {
      const results = await getImageSearchResults(text);
      if (!results || results.length === 0) {
        return sock.reply(msg.chat, `《✧》 No se encontraron imágenes para "${text}".`, msg);
      }
      const validResults = await filterValidImages(results.slice(0, 15));
      if (validResults.length < 2) {
        return sock.reply(msg.chat, `《✧》 Se requieren al menos 2 imágenes válidas para mostrar un álbum.`, msg);
      }
      const medias = validResults.slice(0, 10).map(r => ({ type: 'image', data: { url: r.url }, caption: `ㅤ۟∩　ׅ　★　ׅ　🅖oogle 🅘mage 🅢earch　ׄᰙ　\n\n${r.title ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Título* › ${r.title}\n` : ''}` + `${r.domain ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Fuente* › ${r.domain}\n` : ''}` + `${r.resolution ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Resolución* › ${r.resolution}\n` : ''}` + `𖣣ֶㅤ֯⌗ ☆  ⬭ *Búsqueda* › ${text}` }));
      await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg });
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
    })
  }
};

async function isImageAccessible(url) {
  try {
    const response = await axios.head(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }, maxRedirects: 3, validateStatus: (status) => status < 400 });
    return (response.headers['content-type'] || '').startsWith('image/');
  } catch {
    try {
      await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36', 'Range': 'bytes=0-1023' }, maxRedirects: 3, responseType: 'arraybuffer', validateStatus: (status) => status < 400 || status === 206 });
      return true;
    } catch {
      return false;
    }
  }
}

async function filterValidImages(results) {
  const checks = await Promise.allSettled(
    results.map(async (r) => {
      const ok = await isImageAccessible(r.url);
      return ok ? r : null;
    })
  );
  return checks.filter(c => c.status === 'fulfilled' && c.value !== null).map(c => c.value);
}

// ── Fuente PRINCIPAL: Bing Images (local, sin API externa) ─────────────
// Se scrapea el HTML de Bing Images (sin key). Es robusto y no depende de
// ningún servicio externo que se caiga. Si por algún motivo Bing falla, se
// intentan las APIs de respaldo de abajo.
async function bingImageSearch(query) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
  const { data } = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' }, timeout: 15000 });
  const results = [];
  const seen = new Set();
  const re = /class="iusc"[^>]*m="([^"]{20,})"/g;
  let m;
  while ((m = re.exec(data))) {
    let raw = m[1].replace(/&quot;/g, '"').replace(/\\&quot;/g, '"').replace(/\\"/g, '"').replace(/&amp;/g, '&');
    let j;
    try { j = JSON.parse(raw); } catch { continue; }
    if (!j.murl) continue;
    if (seen.has(j.murl)) continue;
    seen.add(j.murl);
    let domain = null;
    try { domain = new URL(j.murl).hostname; } catch {}
    results.push({
      url: j.murl,
      title: j.t || null,
      domain,
      resolution: (j.mw && j.mh) ? `${j.mw}x${j.mh}` : null
    });
    if (results.length >= 20) break;
  }
  return results;
}

async function getImageSearchResults(query) {
  // 1) Bing local
  try {
    const bing = await bingImageSearch(query);
    if (bing && bing.length > 0) return bing;
  } catch {
    // cae a las APIs de respaldo
  }
  // 2) APIs de respaldo (delirius, lempi/Ginko)
  const apis = [
    { endpoint: `${global.APIs.delirius.url}/search/gimage?query=${encodeURIComponent(query)}`, extractor: (res) => {
        if (!res.status || !Array.isArray(res.data)) return [];
        return res.data.map(item => ({ url: item.url, title: item.origin?.title || null, domain: item.origin?.website?.domain || null, resolution: item.width && item.height ? `${item.width}x${item.height}` : null }));
      }
    },
    { endpoint: `${global.APIs.Ginko.url}/search/image?q=${encodeURIComponent(query)}&api_key=${global.APIs.Ginko.key}`, extractor: (res) => {
        if (!res.status || !Array.isArray(res.result)) return [];
        return res.result.map(item => ({ url: item.image, title: item.title || null, domain: item.url ? new URL(item.url).hostname : null, resolution: null }));
      }
    }
  ];
  for (const { endpoint, extractor } of apis) {
    try {
      const { data } = await axios.get(endpoint);
      const results = extractor(data);
      if (results && results.length > 0) return results;
    } catch {
      continue;
    }
  }
  return [];
}