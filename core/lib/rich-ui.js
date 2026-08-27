import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { generateWAMessageFromContent, getUrlInfo, prepareWAMessageMedia } from 'baileys';

const DEFAULT_BANNER = path.resolve(process.cwd(), 'media', 'code-banner.jpg');
const DEFAULT_FALLBACK_IMAGE = path.resolve(process.cwd(), 'media', 'menu.jpg');
const LINK_PREVIEW_FALLBACK_IMAGE = path.resolve(process.cwd(), 'assets', 'link-preview-fallback.jpg');

export function richUiEnabled() {
  return String(process.env.GINKO_RICH_UI || 'on').toLowerCase() !== 'off';
}

function messageSecret() {
  return randomBytes(32);
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
    messageSecret: messageSecret(),
  };
}

function buildBizNode() {
  return {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: Math.floor(Date.now() / 1000).toString(),
    },
    content: [{
      tag: 'interactive',
      attrs: { type: 'native_flow', v: '1' },
      content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
    }],
  };
}

function readImage(imagePath = DEFAULT_BANNER) {
  const chosen = fs.existsSync(imagePath) ? imagePath : DEFAULT_FALLBACK_IMAGE;
  return fs.existsSync(chosen) ? fs.readFileSync(chosen) : null;
}

function normalizeUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function isInstagramUrl(url = '') {
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'instagram.com' || host.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

function hasPreviewThumbnail(preview) {
  return Boolean(preview?.jpegThumbnail?.length || preview?.highQualityThumbnail);
}

function isWeakInstagramThumbnail(preview) {
  if (!preview) return false;
  const thumbBytes = preview.jpegThumbnail?.length || 0;
  const original = String(preview.originalThumbnailUrl || '');
  // Si Instagram entrega un data-uri, normalmente es un favicon/logo pequeño.
  // Incluso si WaSocket logra subirlo como highQualityThumbnail, seguiría siendo
  // una imagen débil; por eso lo tratamos como fallback-candidate.
  if (original.startsWith('data:image/')) return true;
  return !preview.highQualityThumbnail && (!thumbBytes || thumbBytes < 8 * 1024);
}

function readLinkPreviewFallback() {
  if (fs.existsSync(LINK_PREVIEW_FALLBACK_IMAGE)) return fs.readFileSync(LINK_PREVIEW_FALLBACK_IMAGE);
  return readImage(DEFAULT_BANNER);
}

async function prepareLinkPreviewFallbackImage(sock) {
  if (typeof sock?.waUploadToServer !== 'function') return null;
  if (!fs.existsSync(LINK_PREVIEW_FALLBACK_IMAGE)) return null;
  try {
    const { imageMessage } = await prepareWAMessageMedia(
      { image: { url: LINK_PREVIEW_FALLBACK_IMAGE } },
      {
        upload: sock.waUploadToServer,
        mediaTypeOverride: 'thumbnail-link',
      },
    );
    if (!imageMessage) return null;
    // Patrón de thumbnail-link: objeto ImageMessage subido a WA con dimensiones de card grande.
    imageMessage.height = 720;
    imageMessage.width = 480;
    return imageMessage;
  } catch (error) {
    console.warn('[rich-ui] no se pudo subir fallback highQualityThumbnail:', error?.message || error);
    return null;
  }
}

function applyInstagramPreviewFallback(preview, url, { highQualityThumbnail } = {}) {
  if (!isInstagramUrl(url)) return preview;
  // Instagram suele devolver solo un favicon/data-uri pequeño. Técnicamente
  // hay thumbnail, pero WhatsApp puede renderizarlo como preview pobre o sin
  // imagen grande. En Lab2 usamos respaldo visual propio cuando la miniatura
  // real viene vacía o demasiado débil.
  if (hasPreviewThumbnail(preview) && !isWeakInstagramThumbnail(preview)) return preview;
  const fallback = readLinkPreviewFallback();
  if (!fallback) return preview;
  return {
    ...(preview || {}),
    'matched-text': preview?.['matched-text'] || normalizeUrl(url),
    'canonical-url': preview?.['canonical-url'] || normalizeUrl(url),
    title: preview?.title || 'Ginko-MD ✦ Instagram',
    description: preview?.description || 'Instagram oficial del proyecto.',
    originalThumbnailUrl: preview?.originalThumbnailUrl,
    jpegThumbnail: fallback,
    ...(highQualityThumbnail ? { highQualityThumbnail } : {}),
    previewType: 0,
  };
}

async function applyInstagramPreviewFallbackIfNeeded(preview, url, sock) {
  if (!isInstagramUrl(url)) return preview;
  if (hasPreviewThumbnail(preview) && !isWeakInstagramThumbnail(preview)) return preview;
  const highQualityThumbnail = await prepareLinkPreviewFallbackImage(sock);
  return applyInstagramPreviewFallback(preview, url, { highQualityThumbnail });
}

export async function generateStandardLinkPreview({ sock, url, text, highQuality = true, timeout = 5000 } = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;
  const instagram = isInstagramUrl(normalizedUrl);
  const browserHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'es-MX,es;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
  };
  try {
    const preview = await getUrlInfo(normalizedUrl, {
      thumbnailWidth: 192,
      fetchOpts: {
        timeout,
        headers: browserHeaders,
      },
      uploadImage: highQuality && typeof sock?.waUploadToServer === 'function'
        ? sock.waUploadToServer
        : undefined,
    });
    const finalPreview = await applyInstagramPreviewFallbackIfNeeded(preview, normalizedUrl, sock);
    return finalPreview;
  } catch (error) {
    console.warn('[rich-ui] link preview falló:', error?.message || error);
    const fallbackPreview = await applyInstagramPreviewFallbackIfNeeded(null, normalizedUrl, sock);
    return fallbackPreview;
  }
}

export async function sendStandardLinkPreview({
  sock,
  jid,
  quoted,
  url,
  title = 'Ginko-MD',
  description = '',
  before = '',
  after = '',
  highQuality = true,
} = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) throw new Error('URL inválida para link preview');
  const body = [
    before || `*${title}*${description ? `\n${description}` : ''}`,
    normalizedUrl,
    after,
  ].filter(Boolean).join('\n\n');

  const preview = await generateStandardLinkPreview({ sock, url: normalizedUrl, text: body, highQuality });
  const payload = preview ? { text: body, linkPreview: preview } : { text: body };
  return sock.sendMessage(jid, payload, { quoted });
}

export async function sendInstagramPreview({ sock, jid, quoted, instagramUrl } = {}) {
  const url = normalizeUrl(instagramUrl || global.links?.instagram || 'https://instagram.com/');
  return sendStandardLinkPreview({
    sock,
    jid,
    quoted,
    url,
    title: 'Ginko-MD ✦ Instagram',
    description: 'Instagram oficial del proyecto.',
    before: `🌸 *Ginko-MD ✦ Instagram*\n\nInstagram oficial del proyecto.`,
    after: 'Vista previa estándar de WhatsApp · Lab2',
  });
}

async function prepareHeaderImage(sock, imagePath) {
  const buffer = readImage(imagePath);
  if (!buffer) return null;
  if (typeof sock?.waUploadToServer !== 'function') return null;
  const prepared = await prepareWAMessageMedia(
    { image: buffer },
    { upload: sock.waUploadToServer },
  );
  return prepared?.imageMessage || null;
}

function toNativeButton(button = {}) {
  if (button.copy) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: button.text || 'Copiar',
        id: button.id || `copy_${Date.now()}`,
        copy_code: String(button.copy),
      }),
    };
  }
  if (button.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: button.text || 'Abrir enlace',
        url: String(button.url),
        merchant_url: String(button.url),
      }),
    };
  }
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: button.text || 'Responder',
      id: button.id || `rich_${Date.now()}`,
    }),
  };
}

export function buildRichInteractiveContent({
  title = 'Ginko-MD',
  body = '',
  footer = 'Ginko-MD',
  buttons = [],
  imageMessage = null,
  wrapViewOnce = true,
} = {}) {
  const interactiveMessage = {
    header: {
      title: String(title),
      subtitle: '',
      hasMediaAttachment: Boolean(imageMessage),
      ...(imageMessage ? { imageMessage } : {}),
    },
    body: { text: String(body || '') },
    footer: { text: String(footer || '') },
    nativeFlowMessage: {
      buttons: buttons.map(toNativeButton),
      messageVersion: 1,
    },
  };

  const message = {
    messageContextInfo: buildMessageContextInfo(),
    interactiveMessage,
  };

  return wrapViewOnce ? { viewOnceMessage: { message } } : message;
}

export async function sendRichButtons({ sock, jid, title, body, footer, buttons = [], quoted, imagePath = DEFAULT_BANNER } = {}) {
  if (!richUiEnabled()) throw new Error('Rich UI apagado por GINKO_RICH_UI=off');
  if (!sock?.relayMessage) throw new Error('relayMessage no disponible');
  const imageMessage = await prepareHeaderImage(sock, imagePath).catch(() => null);
  const content = buildRichInteractiveContent({ title, body, footer, buttons, imageMessage });
  const generated = generateWAMessageFromContent(jid, content, {
    userJid: sock.user?.id,
    quoted,
    timestamp: new Date(),
  });
  if (!generated?.key?.id || !generated.message) throw new Error('No se pudo generar rich buttons');
  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: [buildBizNode()],
  });
  return { key: generated.key, rich: true };
}

export async function sendInstagramCard({ sock, jid, quoted, instagramUrl } = {}) {
  // Enfoque nuevo: link real en texto + preview estándar. Sin interactiveMessage,
  // sin viewOnceMessage y sin botones para links.
  return sendInstagramPreview({ sock, jid, quoted, instagramUrl });
}

export async function sendLinkPreviewProbe({ sock, jid, quoted, instagramUrl } = {}) {
  return sendInstagramPreview({ sock, jid, quoted, instagramUrl });
}

export async function sendExternalAdProbe({ sock, jid, quoted, instagramUrl, imagePath = DEFAULT_BANNER } = {}) {
  const url = instagramUrl || global.links?.instagram || 'https://instagram.com/';
  const thumb = readImage(imagePath);
  const payload = {
    text: `🌸 *Ginko-MD*\n${url}`,
    contextInfo: {
      externalAdReply: {
        title: 'Ginko-MD ✦ Instagram',
        body: 'Miniatura propia · prueba Lab2',
        sourceUrl: url,
        mediaUrl: url,
        mediaType: 1,
        showAdAttribution: true,
        renderLargerThumbnail: true,
        ...(thumb ? { thumbnail: thumb, jpegThumbnail: thumb } : {}),
      },
    },
  };
  return sock.sendMessage(jid, payload, { quoted });
}

export async function sendRichTableProbe({ sock, jid, quoted } = {}) {
  if (typeof sock.sendTable === 'function') {
    return sock.sendTable(
      jid,
      'Ginko-MD · Rich UI',
      ['Prueba', 'Estado'],
      [
        ['Botón URL', 'Lab2'],
        ['Botón copiar', 'Lab2'],
        ['Preview', 'Experimental'],
      ],
      quoted,
      { footer: 'Bloque 1' },
    );
  }
  if (typeof sock.sendCodeMessage === 'function') {
    return sock.sendCodeMessage(
      jid,
      'Ginko-MD · Rich UI',
      'Botón URL      Lab2\nBotón copiar   Lab2\nPreview        Experimental',
      quoted,
      {
        title: 'Ginko-MD · Rich UI',
        headers: ['Prueba', 'Estado'],
        rows: [
          ['Botón URL', 'Lab2'],
          ['Botón copiar', 'Lab2'],
          ['Preview', 'Experimental'],
        ],
      },
    );
  }
  return sock.sendMessage(jid, {
    text: '*Ginko-MD · Rich UI*\n\nPrueba | Estado\nBotón URL | Lab2\nBotón copiar | Lab2\nPreview | Experimental',
  }, { quoted });
}

export const __richUiTest = {
  isInstagramUrl,
  hasPreviewThumbnail,
  isWeakInstagramThumbnail,
  prepareLinkPreviewFallbackImage,
  applyInstagramPreviewFallback,
  applyInstagramPreviewFallbackIfNeeded,
};

export default {
  richUiEnabled,
  buildRichInteractiveContent,
  generateStandardLinkPreview,
  sendStandardLinkPreview,
  sendInstagramPreview,
  sendRichButtons,
  sendInstagramCard,
  sendLinkPreviewProbe,
  sendExternalAdProbe,
  sendRichTableProbe,
};
