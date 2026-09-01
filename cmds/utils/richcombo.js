import crypto from 'node:crypto';
import { generateWAMessageFromContent } from 'baileys';

const INSTAGRAM_URL = 'https://www.instagram.com/__ikg.05';
const INSTAGRAM_FAVICON = 'https://external-content.duckduckgo.com/ip3/www.instagram.com.ico';
const IMAGE = 'https://raw.githubusercontent.com/riokuroxi-svg/Lab2experimental/main/assets/richlab-anime.jpg';

function source() {
  return {
    source_type: 'THIRD_PARTY',
    source_display_name: 'Instagram',
    source_subtitle: 'instagram.com',
    source_url: INSTAGRAM_URL,
    favicon: { url: INSTAGRAM_FAVICON, mime_type: 'image/x-icon', width: 16, height: 16 },
  };
}

function unifiedResponse() {
  const payload = {
    __typename: 'GenAIUnifiedResponse',
    response_id: crypto.randomUUID(),
    sections: [
      { view_model: { primitive: {
        text: '🌸 Ginko-MD\n\nEsta es una prueba controlada: Rich UI + botones nativos en el mismo mensaje.',
        inline_entities: [{ key: 'IG_0', metadata: {
          reference_id: 1, reference_url: INSTAGRAM_URL,
          reference_title: 'Instagram oficial del proyecto', reference_display_name: 'instagram.com',
          sources: [source()], __typename: 'GenAISearchCitationItem',
        } }],
        __typename: 'GenAIMarkdownTextUXPrimitive',
      }, __typename: 'GenAISingleLayoutViewModel' } },
      { view_model: { primitive: {
        title: 'Ginko-MD', brand: 'Instagram', price: 'Rich Combo', sale_price: 'Experimental',
        product_url: INSTAGRAM_URL, image: { url: IMAGE }, __typename: 'GenAIProductItemCardPrimitive',
      }, __typename: 'GenAISingleLayoutViewModel' } },
      { view_model: { primitive: {
        sources: [source()], search_engine: 'GINKO', facepile_favicons: [], __typename: 'GenAISearchResultPrimitive',
      }, __typename: 'GenAISingleLayoutViewModel' } },
    ],
  };
  return { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') };
}

function buildContent() {
  return {
    messageContextInfo: {
      deviceListMetadata: {}, deviceListMetadataVersion: 2,
      botMetadata: { richResponseSourcesMetadata: { sources: [source()] } },
    },
    // El Rich Response conserva la tarjeta, imagen, fuente y favicon.
    botForwardedMessage: { message: { richResponseMessage: {
      messageType: 1,
      submessages: [{ messageType: 2, messageText: '🌸 Ginko-MD · Rich Combo' }],
      unifiedResponse: unifiedResponse(),
      contextInfo: { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 },
    } } },
    // Se prueba como hermano del Rich Response, sin certificados ni datos de otra sesión.
    interactiveMessage: {
      header: { title: 'Ginko-MD · Instagram', subtitle: 'Rich Combo', hasMediaAttachment: false },
      body: { text: 'Elige una acción:' },
      footer: { text: 'Prueba aislada · no modifica el menú' },
      nativeFlowMessage: { messageVersion: 1, buttons: [
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Ver Instagram', url: INSTAGRAM_URL, merchant_url: INSTAGRAM_URL }) },
        { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copiar enlace', copy_code: INSTAGRAM_URL }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Respuesta', id: 'richcombo:reply' }) },
      ] },
    },
  };
}

export default {
  command: ['richcombo'],
  category: 'utils',
  description: 'Prueba aislada de Rich UI y botones nativos en un mismo payload.',
  async run({ msg, sock }) {
    try {
      const generated = generateWAMessageFromContent(msg.chat, buildContent(), { userJid: sock.user?.id, quoted: msg, timestamp: new Date() });
      if (!generated?.message || !generated?.key?.id) throw new Error('No se pudo generar el payload combinado');
      return await sock.relayMessage(msg.chat, generated.message, { messageId: generated.key.id });
    } catch (error) {
      return msg.reply(`❌ Rich Combo falló (sin tocar el menú): ${error?.message || error}`);
    }
  },
};
