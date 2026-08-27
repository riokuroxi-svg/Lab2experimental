import { randomBytes } from 'node:crypto';
import { menuObject } from '#system/commands';
import { getSelectedResponse } from '#lib/interactive-response';

export const NATIVE_MENU_PREFIX = 'gkmenu:';
export const MAX_NATIVE_MENU_ROWS = 14;

// El orden deja a la vista las categorías principales que ya anuncia el bot.
// Los IDs son deliberadamente propios del menú para no confundirse con otros
// listeners de botones (por ejemplo, el selector de YouTube).
const CATEGORY_DEFINITIONS = [
  { key: 'downloads', icon: '📥', title: 'Descargas', description: 'YouTube, música, videos y archivos.' },
  { key: 'economia', icon: '💰', title: 'Economía', description: 'Coins, banco, negocios y rankings.' },
  { key: 'fun', icon: '🎮', title: 'Entretenimiento', description: 'Juegos, diversión y respuestas.' },
  { key: 'gacha', icon: '🎴', title: 'Gacha', description: 'RPG, personajes y colecciones.' },
  { key: 'main', icon: '🏠', title: 'Principal', description: 'Comandos generales del bot.' },
  { key: 'grupo', icon: '👥', title: 'Grupos', description: 'Administración y configuración de grupos.' },
  { key: 'anime', icon: '🎌', title: 'Anime', description: 'Anime, búsquedas y reacciones.' },
  { key: 'nsfw', icon: '🔞', title: 'NSFW', description: 'Contenido para adultos.' },
  { key: 'profile', icon: '👤', title: 'Perfiles', description: 'Tu perfil, nivel y estadísticas.' },
  { key: 'sockets', icon: '🔌', title: 'Sockets', description: 'Sockets y sub-bots.' },
  { key: 'stickers', icon: '🖼️', title: 'Stickers', description: 'Stickers, packs y conversiones.' },
  { key: 'utils', icon: '🛠️', title: 'Utilidades', description: 'Herramientas y comandos útiles.' },
];

export const NATIVE_MENU_CATEGORIES = Object.freeze(CATEGORY_DEFINITIONS.map((category) => Object.freeze({ ...category })));

function getCategoryCommandCount(key) {
  return String(menuObject[key] || '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('ꕤ *'))
    .length;
}

export function getNativeMenuRows() {
  return NATIVE_MENU_CATEGORIES
    .filter(({ key }) => Object.prototype.hasOwnProperty.call(menuObject, key))
    .slice(0, MAX_NATIVE_MENU_ROWS)
    .map(({ key, icon, title, description }) => {
      const count = getCategoryCommandCount(key);
      return {
        id: `${NATIVE_MENU_PREFIX}${key}`,
        title,
        description: `${icon} ${description} · ${count} ${count === 1 ? 'comando' : 'comandos'}`,
      };
    });
}

function buildMessageContextInfo() {
  return {
    deviceListMetadata: {
      senderKeyIndexes: [],
      recipientKeyIndexes: [],
      recipientKeyHash: '',
      recipientTimestamp: Math.floor(Date.now() / 1000),
    },
    deviceListMetadataVersion: 2,
    messageSecret: randomBytes(32),
  };
}

/**
 * Construye únicamente el contenido protobuf-like. Mantener esta función
 * pura permite inspeccionar el payload en Termux sin abrir una sesión real.
 */
export function buildNativeMenuContent({
  body,
  footer,
  title = 'Categorías',
  rows = getNativeMenuRows(),
  wrapViewOnce = process.env.GINKO_NATIVE_MENU_VIEW_ONCE !== '0',
  mediaMessage = null,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('El menú nativo no tiene categorías');
  if (rows.length > MAX_NATIVE_MENU_ROWS) throw new Error(`El menú nativo admite como máximo ${MAX_NATIVE_MENU_ROWS} filas`);

  const header = {
    title: String(title),
    subtitle: '',
    hasMediaAttachment: Boolean(mediaMessage),
  };
  if (mediaMessage) header.imageMessage = mediaMessage;

  const interactiveMessage = {
    header,
    body: { text: String(body || 'Selecciona una categoría') },
    footer: { text: String(footer || '') },
    nativeFlowMessage: {
      buttons: [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: String(title),
          sections: [{ title: '✨ Categorías', rows }],
        }),
      }],
      messageVersion: 1,
    },
  };

  const message = {
    messageContextInfo: buildMessageContextInfo(),
    interactiveMessage,
  };

  return wrapViewOnce ? { viewOnceMessage: { message } } : message;
}

function isPrivateChat(jid = '') {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

function buildBizNode() {
  return {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: Math.floor(Date.now() / 1000).toString(),
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
}

/**
 * Envía el mensaje evitando sendMessage para conservar nativeFlow. Como esta
 * ruta salta el getButtonArgs de sendMessage, añade aquí el nodo biz que la
 * ruta oficial de WaSocket agrega a los interactivos y el nodo bot en chats
 * privados. No hace fallback por sí mismo: el caller conserva el banner y
 * puede ejecutar menumanual.
 */
export async function sendNativeCategoryMenu({
  sock,
  jid,
  body,
  footer,
  title = 'Categorías',
  quoted,
  bannerBuffer = null,
  wrapViewOnce = process.env.GINKO_NATIVE_MENU_VIEW_ONCE !== '0',
} = {}) {
  try {
    if (!sock?.relayMessage) throw new Error('El socket no expone relayMessage');

    const {
      generateWAMessageFromContent,
      prepareWAMessageMedia,
    } = await import('baileys');

    let mediaMessage = null;
    if (bannerBuffer) {
      if (typeof sock.waUploadToServer !== 'function') throw new Error('El socket no puede subir el banner');
      const prepared = await prepareWAMessageMedia(
        { image: bannerBuffer },
        { upload: sock.waUploadToServer },
      );
      mediaMessage = prepared?.imageMessage || null;
      if (!mediaMessage) throw new Error('No se pudo preparar el banner');
    }

    const content = buildNativeMenuContent({ body, footer, title, wrapViewOnce, mediaMessage });
    const generated = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generated?.key?.id || !generated.message) throw new Error('No se pudo generar el menú nativo');

    const additionalNodes = [buildBizNode()];
    if (isPrivateChat(jid)) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });

    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes,
    });

    return { sent: true, key: generated.key };
  } catch (error) {
    return { sent: false, error };
  }
}

function getMenuSelection(input) {
  const selected = getSelectedResponse(input);
  const id = String(selected?.id || '').trim();
  if (!id.toLowerCase().startsWith(NATIVE_MENU_PREFIX)) return null;
  return { selected, id };
}

export function getNativeMenuCategory(input) {
  const selection = getMenuSelection(input);
  if (!selection) return null;
  const key = selection.id.slice(NATIVE_MENU_PREFIX.length).toLowerCase();
  return NATIVE_MENU_CATEGORIES.some((category) => category.key === key) ? key : null;
}

export function isNativeMenuResponse(input) {
  return Boolean(getMenuSelection(input));
}

export function renderNativeMenuCategory(category, prefix = '.') {
  const key = String(category || '').toLowerCase();
  if (!NATIVE_MENU_CATEGORIES.some((item) => item.key === key)) return '';
  const raw = menuObject[key];
  if (!raw) return '';
  return String(raw).replace(/\$prefix/g, String(prefix || ''));
}

/**
 * Atiende la fila seleccionada antes del dispatcher normal. Las respuestas
 * con un ID desconocido reciben una salida textual segura, nunca un comando
 * arbitrario construido desde paramsJson.
 */
export async function handleNativeMenuResponse({ msg, sock, prefix = '.', onCategory } = {}) {
  const selection = getMenuSelection(msg);
  if (!selection) return false;

  const category = getNativeMenuCategory(msg);
  if (!category) {
    await sock.sendMessage(
      msg.chat,
      { text: `No reconocí esa categoría. Usa *${prefix}menu* para abrir el selector o *${prefix}menumanual* si tu cliente no lo muestra.` },
      { quoted: msg },
    );
    return true;
  }

  if (typeof onCategory === 'function') {
    await onCategory(category, selection.selected);
    return true;
  }

  const content = renderNativeMenuCategory(category, prefix);
  if (!content) throw new Error(`Categoría nativa sin contenido: ${category}`);
  await sock.sendMessage(
    msg.chat,
    { text: `${content}\n\n> Usa *${prefix}menu* para volver a las categorías.` },
    { quoted: msg },
  );
  return true;
}
