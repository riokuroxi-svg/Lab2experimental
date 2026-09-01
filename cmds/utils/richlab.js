import crypto from 'node:crypto';
import { generateWAMessageFromContent } from 'baileys';
import { sendRichButtons } from '#lib/rich-ui';

const INSTAGRAM_URL = 'https://www.instagram.com/__ikg.05';
const INSTAGRAM_FAVICON = 'https://external-content.duckduckgo.com/ip3/www.instagram.com.ico';

function source() {
  return {
    source_type: 'THIRD_PARTY',
    source_display_name: 'Instagram',
    source_subtitle: 'instagram.com',
    source_url: INSTAGRAM_URL,
    favicon: { url: INSTAGRAM_FAVICON, mime_type: 'image/x-icon', width: 16, height: 16 },
  };
}

function buildRichPayload() {
  const text = '🌸 Ginko-MD · Rich Lab\n\nVista experimental con texto, imagen, tarjeta y favicon de una fuente real.';
  return {
    __typename: 'GenAIUnifiedResponse',
    response_id: crypto.randomUUID(),
    sections: [
      { view_model: { primitive: { text, __typename: 'GenAIMarkdownTextUXPrimitive', inline_entities: [{ key: 'IG_0', metadata: { reference_id: 1, reference_url: INSTAGRAM_URL, reference_title: 'Instagram oficial del proyecto', reference_display_name: 'instagram.com', sources: [source()], __typename: 'GenAISearchCitationItem' } }] }, __typename: 'GenAISingleLayoutViewModel' } },
      { view_model: { primitive: { title: 'Ginko-MD', brand: 'Instagram', price: 'Lab2', sale_price: 'Experimental', product_url: INSTAGRAM_URL, image: { url: 'https://raw.githubusercontent.com/riokuroxi-svg/Lab2experimental/main/assets/richlab-anime.jpg' }, __typename: 'GenAIProductItemCardPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } },
      { view_model: { primitive: { sources: [source()], search_engine: 'GINKO', facepile_favicons: [], __typename: 'GenAISearchResultPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } },
    ],
  };
}

async function sendRichLabMessage(sock, msg) {
  const payload = buildRichPayload();
  const content = {
    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
    botForwardedMessage: { message: { richResponseMessage: {
      messageType: 1,
      submessages: [{ messageType: 2, messageText: '🌸 Ginko-MD · Rich Lab' }],
      unifiedResponse: { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') },
      contextInfo: { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 },
    } } },
  };
  const generated = generateWAMessageFromContent(msg.chat, content, { userJid: sock.user?.id });
  return sock.relayMessage(msg.chat, generated.message, { messageId: generated.key.id });
}

export default {
  command: ['richlab'],
  category: 'utils',
  description: 'Prueba aislada de Rich Response, favicon y botones.',
  async run({ msg, sock, args }) {
    const mode = String(args[0] || 'combo').toLowerCase();
    if (mode === 'botones') {
      return sendRichButtons({ sock, jid: msg.chat, quoted: msg, title: '🌸 Ginko Rich Lab', body: 'Prueba de botones nativos.', footer: 'Experimental', buttons: [
        { text: 'Instagram', url: INSTAGRAM_URL },
        { text: 'Copiar .kuro', copy: '.kuro' },
        { text: 'Respuesta', id: 'richlab:reply' },
      ] });
    }
    if (!['combo', 'favicon', 'tabla', 'texto'].includes(mode)) return msg.reply('Usa: .richlab combo | favicon | tabla | botones');
    // combo/favicons use the same single Rich Response intentionally; the
    // fallback remains a normal text reply if relay fails.
    try { return await sendRichLabMessage(sock, msg); }
    catch (error) { return msg.reply(`❌ Rich Lab no pudo enviarse: ${error?.message || error}`); }
  },
};
