import AdmZip from "adm-zip";
import mime from "mime-types";

export const command = {
  name: "zip",
  aliases: ["backupmsg", "msgtozip"],
  category: "utils",
  description: "Convertir un mensaje respondido de WhatsApp en un archivo ZIP",
  usage: ".zip (responde a un mensaje)",
  run: async (ctx) => {
    const { sock, msg, args } = ctx;
    const m = msg;

    // Helpers locales
    const safeFileName = (text = "file") =>
      String(text || "file")
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120) || "file";

    const safeJson = (value) => {
      const seen = new WeakSet();
      return JSON.stringify(
        value,
        (key, val) => {
          if (typeof val === "bigint") return val.toString();
          if (typeof val === "function") return undefined;
          if (Buffer.isBuffer(val)) return { type: "Buffer", length: val.length, base64: val.toString("base64") };
          if (val instanceof Uint8Array) {
            const buffer = Buffer.from(val);
            return { type: "Uint8Array", length: buffer.length, base64: buffer.toString("base64") };
          }
          if (val && typeof val === "object") {
            if (seen.has(val)) return "[Circular]";
            seen.add(val);
          }
          return val;
        },
        2
      );
    };

    const getQuotedContent = (q) => q?.message?.[q.type] || q?.message || {};

    const getMimeFromQuoted = (q) => {
      const content = getQuotedContent(q);
      return (
        content?.mimetype ||
        content?.mimeType ||
        (q.type === "imageMessage" ? "image/jpeg" : "") ||
        (q.type === "videoMessage" ? "video/mp4" : "") ||
        (q.type === "audioMessage" ? "audio/ogg" : "") ||
        (q.type === "stickerMessage" ? "image/webp" : "") ||
        "application/octet-stream"
      );
    };

    const getMediaFileName = (q) => {
      const content = getQuotedContent(q);
      const original = content?.fileName || content?.title || "";
      if (original && typeof original === "string") return safeFileName(original);

      const mimetype = getMimeFromQuoted(q);
      const fallbackExt = {
        imageMessage: "jpg",
        videoMessage: "mp4",
        audioMessage: content?.ptt ? "ogg" : "mp3",
        stickerMessage: "webp",
        documentMessage: "bin",
      }[q.type] || "bin";

      const ext = mime.extension(mimetype) || fallbackExt;
      const base = String(q.type || "media").replace(/Message$/i, "") || "media";
      return `${safeFileName(base)}.${ext}`;
    };

    const buildReadableText = (q, metadata) => {
      const lines = [
        "Mensaje de WhatsApp exportado a ZIP",
        "===================================",
        "",
        `Tipo: ${metadata.type}`,
        `Chat: ${metadata.chat}`,
        `Remitente: ${metadata.sender}`,
        `Nombre: ${metadata.pushName}`,
        `ID: ${metadata.id}`,
        `Fecha de exportación: ${metadata.exportedAt}`,
        `Tiene media: ${metadata.hasMedia ? "Sí" : "No"}`,
      ];

      if (metadata.mediaFile) lines.push(`Archivo multimedia: media/${metadata.mediaFile}`);

      lines.push("", "Contenido:", "----------", q.body || "[Sin texto]");
      return lines.join("\n");
    };

    // Extraer mensaje respondido. Dependiendo de cómo lo maneje el router (Ginko/Shin)
    // usaremos ctx.quoted o buscaremos manualmente
    let q = ctx.quoted || null;
    if (!q) {
       // Manual resolve if ctx.quoted is missing
       const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                           msg.message?.imageMessage?.contextInfo ||
                           msg.message?.videoMessage?.contextInfo || null;
       if (contextInfo?.quotedMessage) {
          const type = Object.keys(contextInfo.quotedMessage)[0];
          q = {
             key: {
                remoteJid: msg.key.remoteJid,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant
             },
             id: contextInfo.stanzaId,
             sender: contextInfo.participant,
             type: type,
             message: contextInfo.quotedMessage,
             body: contextInfo.quotedMessage?.conversation || contextInfo.quotedMessage?.extendedTextMessage?.text || "",
             isMedia: ["imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"].includes(type)
          };
          
          // Basic download polyfill if needed
          if (q.isMedia) {
             const { downloadContentFromMessage } = await import("baileys");
             q.download = async () => {
                const stream = await downloadContentFromMessage(q.message[type], type.replace("Message", ""));
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                return buffer;
             };
          }
       }
    }

    if (!q) {
      await sock.sendMessage(m.key.remoteJid, { text: `📦 *WHATSAPP MESSAGE TO ZIP*\n\n> Responde a un mensaje y escribe \`.zip\`.\n\nEl ZIP incluirá:\n> • metadata.json\n> • message.json\n> • message.txt\n> • media/ si el mensaje tiene imagen, video, audio, sticker o documento` }, { quoted: m });
      return;
    }

    await sock.sendMessage(m.key.remoteJid, { react: { text: "🕕", key: m.key } });

    try {
      const zip = new AdmZip();

      const metadata = {
        exportedAt: new Date().toISOString(),
        command: `.zip`,
        chat: msg.key.remoteJid || "",
        id: q.id || q.key?.id || "",
        sender: q.sender || q.key?.participant || "",
        senderNumber: (q.sender || "").split("@")[0] || "",
        pushName: q.pushName || "unknown",
        type: q.type || "unknown",
        body: q.body || "",
        hasMedia: Boolean(q.isMedia),
      };

      if (q.isMedia && typeof q.download === "function") {
        try {
          const mediaBuffer = await q.download();
          if (Buffer.isBuffer(mediaBuffer) && mediaBuffer.length > 0) {
            metadata.mediaFile = getMediaFileName(q);
            metadata.mediaSize = mediaBuffer.length;
            metadata.mediaMime = getMimeFromQuoted(q);
            zip.addFile(`media/${metadata.mediaFile}`, mediaBuffer);
          }
        } catch (error) {
          metadata.mediaDownloadError = error?.message || String(error);
        }
      }

      const rawMessage = {
        key: q.key || {},
        id: q.id || "",
        sender: q.sender || "",
        type: q.type || "",
        body: q.body || "",
        message: q.message || {}
      };

      zip.addFile("metadata.json", Buffer.from(safeJson(metadata), "utf8"));
      zip.addFile("message.json", Buffer.from(safeJson(rawMessage), "utf8"));
      zip.addFile("message.txt", Buffer.from(buildReadableText(q, metadata), "utf8"));

      if (q.body) {
        zip.addFile("body.txt", Buffer.from(q.body, "utf8"));
      }

      const buffer = zip.toBuffer();
      const senderNumber = safeFileName(metadata.senderNumber || metadata.sender || "unknown");
      const msgId = safeFileName(metadata.id || Date.now());
      const fileName = `whatsapp-message-${senderNumber}-${msgId}.zip`;

      await sock.sendMessage(
        m.key.remoteJid,
        {
          document: buffer,
          mimetype: "application/zip",
          fileName,
          caption: `✅ *Mensaje convertido a ZIP*\n\n> Tipo: *${metadata.type}*\n> Media: *${metadata.mediaFile ? "incluida" : "no"}*\n> Archivo: \`${fileName}\``
        },
        { quoted: m }
      );

      await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
    } catch (error) {
      console.error("[zip] error:", error?.message || error);
      await sock.sendMessage(m.key.remoteJid, { react: { text: "☢", key: m.key } });
      await sock.sendMessage(m.key.remoteJid, { text: "Hubo un error al crear el ZIP." }, { quoted: m });
    }
  }
};
