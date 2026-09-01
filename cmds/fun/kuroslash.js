import { generateWAMessageFromContent } from "baileys";
import Jimp from "jimp";
import path from "path";
import fs from "fs";

export const command = {
  name: "kuroslash",
  aliases: ["ks", "kuro"],
  category: "fun",
  description: "Juega Kuro Slash en WhatsApp",
  run: async (ctx) => {
    const { sock, msg, args } = ctx;
    const jid = msg.key.remoteJid;

    // Crear un fondo básico si no existe (mock visual para la prueba)
    const renderGameFrame = async () => {
      const bg = new Jimp(800, 800, 0x1a1a1aff); // Fondo oscuro
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
      const fontScore = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
      
      // Dibujar piso rojo
      const rect = new Jimp(400, 800, 0xaa0000ff);
      bg.composite(rect, 200, 0);

      bg.print(fontScore, 50, 50, "KURO SLASH");
      bg.print(font, 50, 150, "SCORE: 0");
      bg.print(font, 300, 600, "X (Player)");

      return await bg.getBufferAsync(Jimp.MIME_JPEG);
    };

    const frameBuffer = await renderGameFrame();
    
    // Subir la imagen a WhatsApp temporalmente
    const uploadedImage = await sock.prepareMessageFromContent(
      jid,
      { image: frameBuffer },
      { upload: sock.waUploadToServer }
    );

    // Payload Mágico de Interface (Hacker Way)
    const interactiveMessage = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadataVersion: 2,
            deviceListMetadata: {},
          },
          interactiveMessage: {
            body: { text: "⚔️ ataca + onda • corta las balas rojas = PARRY (llena 🔥 AURA, llena = OVERDRIVE) • baja = cura +5 HP" },
            header: {
              hasMediaAttachment: true,
              imageMessage: uploadedImage.message.imageMessage,
            },
            nativeFlowMessage: {
              buttons: [
                { name: "quick_reply", buttonParamsJson: '{"display_text":"◀","id":"ks_left"}' },
                { name: "quick_reply", buttonParamsJson: '{"display_text":"⚔ CORTAR","id":"ks_attack"}' },
                { name: "quick_reply", buttonParamsJson: '{"display_text":"▶","id":"ks_right"}' },
                { name: "quick_reply", buttonParamsJson: '{"display_text":"🌊 ULTI - 0%","id":"ks_ulti"}' }
              ],
            },
          },
        },
      },
    };

    // Enviar el payload
    await sock.relayMessage(jid, interactiveMessage.viewOnceMessage.message, {});
  },
};
