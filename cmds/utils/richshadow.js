import crypto from 'node:crypto';
import { generateWAMessageFromContent } from 'baileys';
import { sendRichButtons } from '#lib/rich-ui';

const URL = 'https://www.instagram.com/__ikg.05';
const FAVICON = 'https://external-content.duckduckgo.com/ip3/www.instagram.com.ico';
const IMAGE = 'https://raw.githubusercontent.com/riokuroxi-svg/Lab2experimental/main/assets/richlab-anime.jpg';

function source() {
  return { source_type: 'THIRD_PARTY', source_display_name: 'Instagram', source_subtitle: 'instagram.com', source_url: URL, favicon: { url: FAVICON, mime_type: 'image/x-icon', width: 16, height: 16 } };
}

function payload() {
  return { response_id: crypto.randomUUID(), sections: [
    { view_model: { primitive: { text: '🌸 Ginko-MD · Rich Shadow\n\nTexto + imagen + tarjeta + fuente real.', inline_entities: [{ key: 'IG_0', metadata: { reference_id: 1, reference_url: URL, reference_title: 'Instagram oficial del proyecto', reference_display_name: 'instagram.com', sources: [source()], __typename: 'GenAISearchCitationItem' } }], __typename: 'GenAIMarkdownTextUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } },
    { view_model: { primitive: { title: 'Ginko-MD', brand: 'Instagram', price: 'Lab2', sale_price: 'Experimental', product_url: URL, image: { url: IMAGE }, __typename: 'GenAIProductItemCardPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } },
    { view_model: { primitive: { sources: [source()], search_engine: 'GINKO', facepile_favicons: [], __typename: 'GenAISearchResultPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } },
  ] };
}

async function sendRichShadow(sock, msg) {
  const content = { messageContextInfo: { threadId: [], deviceListMetadata: {}, deviceListMetadataVersion: 2, botMetadata: { richResponseSourcesMetadata: { sources: [source()] } } }, botForwardedMessage: { message: { richResponseMessage: { submessages: [{ messageType: 2, messageText: '🌸 Ginko-MD · Rich Shadow' }], messageType: 1, unifiedResponse: { data: Buffer.from(JSON.stringify(payload()), 'utf8').toString('base64') }, contextInfo: { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 } } } } };
  const generated = generateWAMessageFromContent(msg.chat, content, { userJid: sock.user?.id });
  return sock.relayMessage(msg.chat, generated.message, { messageId: generated.key.id });
}

export default {
  command: ['richshadow'],
  category: 'utils',
  description: 'Prueba aislada del formato Rich UI de Shadow.',
  async run({ msg, sock, args }) {
    if (String(args[0] || '').toLowerCase() === 'botones') return sendRichButtons({ sock, jid: msg.chat, quoted: msg, title: '🌸 Ginko Rich Shadow', body: 'Botones nativos aislados.', footer: 'Experimental', buttons: [{ text: 'Instagram', url: URL }, { text: 'Copiar .kuro', copy: '.kuro' }, { text: 'Respuesta', id: 'richshadow:reply' }] });
    try { return await sendRichShadow(sock, msg); } catch (error) { return msg.reply(`❌ Rich Shadow falló: ${error?.message || error}`); }
  },
};
