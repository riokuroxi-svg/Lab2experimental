import crypto from "node:crypto";
import { generateWAMessageFromContent } from "baileys";
import { buildKuroHtml } from "#lib/kuro/html";

const command = {
  command: ["kuro", "kuroslash", "ks"],
  category: "fun",
  description: "Juega KURO SLASH directamente en WhatsApp 🌑",
  async run({ sock, msg, participants = [] }) {
    // Rich HTML experimental is deliberately limited in large groups:
    // WhatsApp must fan out and render a heavy client-side payload for every
    // participant. Refuse safely instead of risking the group/client.
    if (msg.isGroup && participants.length > 100) {
      return msg.reply(
        "🌑 KURO SLASH está limitado a chats privados o grupos pequeños para evitar problemas de renderizado en grupos grandes."
      );
    }
    const html = buildKuroHtml();
    const payload = {
      __typename: "GenAIUnifiedResponse",
      response_id: crypto.randomUUID(),
      sections: [{
        __typename: "GenAIUnifiedResponseSection",
        view_model: {
          __typename: "GenAISingleLayoutViewModel",
          primitive: {
            __typename: "GenAIaeacdsnwHtmlPrimitive",
            payload: html,
            trusted_sources: [],
          },
        },
      }],
    };
    const content = {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      botForwardedMessage: {
        message: { richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: "🌑 KURO SLASH" }],
          unifiedResponse: { data: Buffer.from(JSON.stringify(payload), "utf8").toString("base64") },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
            forwardOrigin: 4,
          },
        } },
      },
    };
    const jid = msg.key.remoteJid;
    const generated = generateWAMessageFromContent(jid, content, { userJid: sock.user.id });
    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
  },
};

export default command;
