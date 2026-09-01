import AdmZip from "adm-zip";
import mime from "mime-types";

// Asumimos que Lab2 tiene configurado un loader para module.exports o variables export.
export const command = {
  name: "zip",
  aliases: ["comprimir", "zipmsg"],
  category: "tools",
  description: "Convierte un mensaje respondido en un archivo ZIP con metadatos",
  run: async (ctx) => {
    const { sock, msg, args } = ctx;
    const m = msg;

    // Helper setup
    function safeFileName(text = "file") {
      return String(text || "file")
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120) || "file";
    }

    function safeJson(value) {
      const seen = new WeakSet();
      return JSON.stringify(
        value,
        (key, val) => {
          if (typeof val === "bigint") return val.toString();
          if (typeof val === "function") return undefined;
          if (Buffer.isBuffer(val)) {
            return { type: "Buffer", length: val.length, base64: val.toString("base64") };
          }
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
    }

    // Buscamos el mensaje respondido
    const qMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!qMessage) {
      return sock.sendMessage(m.key.remoteJid, { text: `📦 *WHATSAPP MESSAGE TO ZIP*\n\n> Responde a un mensaje y escribe \`.zip\`.\n\nEl ZIP incluirá metadatos y contenido multimedia si existe.` }, { quoted: m });
    }

    // React temporal
    await sock.sendMessage(m.key.remoteJid, { react: { text: "🕕", key: m.key } });

    try {
      const zip = new AdmZip();
      
      const qType = Object.keys(qMessage)[0];
      const qContent = qMessage[qType];
      
      const metadata = {
        exportedAt: new Date().toISOString(),
        type: qType,
        body: qContent?.text || qContent?.caption || "",
        hasMedia: qType.includes("Message") && qType !== "conversation" && qType !== "extendedTextMessage"
      };

      const rawMessage = qMessage;

      // Generar txt legibles
      const lines = [
        "Mensaje de WhatsApp exportado a ZIP",
        "===================================",
        `Tipo: ${metadata.type}`,
        `Fecha de exportación: ${metadata.exportedAt}`,
        `Tiene media: ${metadata.hasMedia ? "Sí" : "No"}`,
        "",
        "Contenido:",
        "----------",
        metadata.body || "[Sin texto puro identificable]"
      ];

      zip.addFile("metadata.json", Buffer.from(safeJson(metadata), "utf8"));
      zip.addFile("message.json", Buffer.from(safeJson(rawMessage), "utf8"));
      zip.addFile("message.txt", Buffer.from(lines.join("\n"), "utf8"));

      if (metadata.body) {
        zip.addFile("body.txt", Buffer.from(metadata.body, "utf8"));
      }

      const buffer = zip.toBuffer();
      const fileName = `whatsapp-message-${Date.now()}.zip`;

      await sock.sendMessage(
        m.key.remoteJid,
        {
          document: buffer,
          mimetype: "application/zip",
          fileName,
          caption: `✅ *Mensaje convertido a ZIP*\n\n> Tipo: *${metadata.type}*\n> Media: *${metadata.hasMedia ? "Detectada pero omitida para optimizar proxy" : "No"}*\n> Archivo: \`${fileName}\``,
        },
        { quoted: m }
      );

      await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
    } catch (error) {
      console.error("[zip] error:", error);
      await sock.sendMessage(m.key.remoteJid, { react: { text: "☢", key: m.key } });
    }
  },
};
