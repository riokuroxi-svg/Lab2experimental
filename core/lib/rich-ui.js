import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys';

const DEFAULT_BANNER = path.resolve(process.cwd(), 'media', 'code-banner.jpg');
const DEFAULT_FALLBACK_IMAGE = path.resolve(process.cwd(), 'media', 'menu.jpg');

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

export async function sendInstagramCard({ sock, jid, quoted, instagramUrl, imagePath = DEFAULT_BANNER } = {}) {
  const url = instagramUrl || global.links?.instagram || 'https://instagram.com/';
  const body = `🌸 *Ginko-MD*\n\nInstagram oficial del proyecto.\n\n${url}`;
  try {
    return await sendRichButtons({
      sock,
      jid,
      quoted,
      title: 'Ginko-MD ✦ Instagram',
      body,
      footer: 'Tarjeta experimental de Lab2',
      imagePath,
      buttons: [
        { text: '🌸 Abrir Instagram', url },
        { text: '📋 Copiar link', copy: url },
      ],
    });
  } catch (error) {
    const img = readImage(imagePath);
    const fallbackPayload = img
      ? { image: img, caption: body }
      : { text: body };
    const sent = await sock.sendMessage(jid, fallbackPayload, { quoted });
    return { ...sent, rich: false, error };
  }
}

export async function sendLinkPreviewProbe({ sock, jid, quoted, instagramUrl, imagePath = DEFAULT_BANNER } = {}) {
  const url = instagramUrl || global.links?.instagram || 'https://instagram.com/';
  const thumb = readImage(imagePath);
  const payload = {
    text: `🌿 Ginko-MD Instagram\n${url}`,
    linkPreview: {
      'matched-text': url,
      title: 'Ginko-MD ✦ Instagram',
      description: 'Tarjeta experimental con miniatura propia.',
      previewType: 0,
      ...(thumb ? { jpegThumbnail: thumb } : {}),
    },
  };
  return sock.sendMessage(jid, payload, { quoted });
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

export default {
  richUiEnabled,
  buildRichInteractiveContent,
  sendRichButtons,
  sendInstagramCard,
  sendLinkPreviewProbe,
  sendExternalAdProbe,
  sendRichTableProbe,
};
