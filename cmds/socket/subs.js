import makeWASocket, { Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, jidDecode, generateWAMessageFromContent } from 'baileys';
import { useSQLiteAuthState } from '#lib/sqliteAuth';
import { ritmoHumano } from '#lib/humanize';
import NodeCache from 'node-cache';
import main from '#main';
import events from '#events';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { randomBytes } from 'node:crypto';
import { buildPairingCodeMessage, PAIRING_CODE_TTL_SECONDS } from '#lib/pairingCodeMessage';
import { smsg, patchGroupMetadata, getCachedMeta } from '#serialize';
import db from '#db';

if (!global.conns) global.conns = [];
let reintentos = {};
let commandFlags = {};
const cleanJid = (jid = '') => jid.replace(/:\d+/, '').split('@')[0];
const sessionsPath = path.resolve(process.cwd(), 'Sessions');
const subsPath = path.join(sessionsPath, 'Subs');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getClient(client) {
  const userId = client?.user?.id?.split(':')[0];
  if (!userId) return client;
  return global.conns?.find((c) => c?.user?.id?.split(':')[0] === userId) || client;
}

export function remove(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.ws?.close(); } catch {}
  try { sock.end?.(new Error('replaced')); } catch {}
  try { sock.msgRetryCounterCache?.close(); } catch {}
}

const logger = pino({ level: "silent" });
const versionCache = { value: null, expiresAt: 0 };
async function getVersion() {
  if (versionCache.value && Date.now() < versionCache.expiresAt) return versionCache.value;
  try {
    const latest = await fetchLatestBaileysVersion();
    versionCache.value = latest.version;
    versionCache.expiresAt = Date.now() + 60 * 60 * 1000;
  } catch (e) {
    if (!versionCache.value) versionCache.value = [2, 3000, 1033105955];
  }
  return versionCache.value;
}

function normalizePhone(input) {
  let s = String(input).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = s.replace(/^0+/, '');
  if (s.length === 10 && s.startsWith('3')) s = '57' + s;
  if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
  if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
  return s;
}

// Mismo backoff exponencial con jitter que el bot principal
function backoffDelay(attempt, baseMs = 4000, maxMs = 45000, jitterMs = 2000) {
  const exponential = baseMs * Math.pow(1.6, Math.min(attempt, 8));
  const capped = Math.min(maxMs, exponential);
  return Math.max(2000, capped + (Math.random() * jitterMs * 2 - jitterMs));
}

function buildCodeMessageContextInfo() {
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

export async function sendPairingCodeMessage({ sock, jid, code, quoted, validitySeconds = PAIRING_CODE_TTL_SECONDS } = {}) {
  const codeText = String(code || '').trim();
  const copyCode = codeText.replace(/[^A-Za-z0-9]/g, '') || codeText;
  const body = buildPairingCodeMessage(codeText, validitySeconds);

  // Ruta preferida: botón nativo que copia el código. Si el cliente/fork no lo
  // soporta, caemos a quick-reply clásico sin romper la vinculación.
  try {
    if (!sock?.relayMessage) throw new Error('relayMessage no disponible');
    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: buildCodeMessageContextInfo(),
          interactiveMessage: {
            header: { title: 'Sub-Bot — Code', subtitle: '', hasMediaAttachment: false },
            body: { text: body },
            footer: { text: `Válido por ${validitySeconds} segundos` },
            nativeFlowMessage: {
              buttons: [{
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                  display_text: '📋 Copiar Código',
                  id: 'ginko_pairing_code_copy',
                  copy_code: copyCode,
                }),
              }],
              messageVersion: 1,
            },
          },
        },
      },
    };
    const generated = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generated?.key?.id || !generated.message) throw new Error('No se pudo generar mensaje de código');
    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes: [buildBizNode()],
    });
    return { key: generated.key, nativeCopy: true };
  } catch (error) {
    const fallback = await sock.sendMessage(jid, {
      text: body,
      footerText: `Válido por ${validitySeconds} segundos`,
      buttons: [{
        buttonId: `ginko_copy_code_${copyCode}`,
        buttonText: { displayText: '📋 Copiar Código' },
        type: 1,
      }],
      headerType: 1,
    }, { quoted });
    return { ...fallback, nativeCopy: false, nativeError: error };
  }
}

export async function startSubBot(msg, client, caption = '', isCode = false, phone = '', chatId = '', isCommand = false) {
  const id = normalizePhone(phone || (msg?.sender || '').split('@')[0]);
  if (!id) throw new Error('No se pudo obtener el número del Sub-Bot.');
  ensureDir(subsPath);
  const sessionFolder = path.join(subsPath, id);
  const senderId = msg?.sender;
  const { state, saveCreds: saveCredsDB } = await useSQLiteAuthState(sessionFolder);
  const version = await getVersion();
  let saveCredsTimer = null;
  const saveCreds = () => { clearTimeout(saveCredsTimer); saveCredsTimer = setTimeout(saveCredsDB, 2000); };
  const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });
  const msgStore = new Map();
  const msgLimit = 500;
  console.info = () => {};
  const socks = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.windows('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 20000,
    transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
    emitOwnEvents: false,
    msgRetryCounterCache,
    cachedGroupMetadata: async (jid) => getCachedMeta(jid) ?? undefined,
    getMessage: async (key) => msgStore.get(key.remoteJid + ':' + key.id),
  });
  patchGroupMetadata(socks);
  // Ritmo humano de envío también para sub-bots (misma lógica del principal)
  {
    const origSend = socks.sendMessage.bind(socks)
    socks.sendMessage = async (jid, content, opts) => {
      const esInterno = content?.react || content?.delete
      if (!esInterno) await ritmoHumano(jid)
      return origSend(jid, content, opts)
    }
  }
  socks.msgRetryCounterCache = msgRetryCounterCache;
  socks.isCommand = isCommand;
  socks.senderId = senderId;
  socks.chatId = chatId;
  socks.client = client;
  socks.isCode = isCode;
  socks.sessionFolder = sessionFolder;
  socks.ev.on('creds.update', saveCreds);
  socks.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
    }
    return jid;
  };
  let bootTime = Date.now();
  let botReady = false;
  socks.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!botReady) return;
    if (type !== 'notify') return;
    for (const raw of messages) {
      if (raw?.message && raw?.key?.id) {
        const sid = raw.key.remoteJid + ':' + raw.key.id;
        msgStore.set(sid, raw.message);
        if (msgStore.size > msgLimit) msgStore.delete(msgStore.keys().next().value);
      }
      try {
        if (!raw?.message || raw.key?.remoteJid === 'status@broadcast') continue;
        if ((raw.messageTimestamp * 1000) < bootTime - 15_000) continue;
        if (raw.message.ephemeralMessage) raw.message = raw.message.ephemeralMessage.message;
        const m = await smsg(socks, raw);
        if (typeof main === 'function') main(socks, m, messages).catch((err) => console.error('[ ✿  ]  Main Sub »', err?.message || err));
      } catch (e) { console.log(e); }
    }
  });
  try { await events(socks, msg); } catch (err) { console.log(chalk.gray(`[ EVENT ERROR  ]  → ${err}`)); }
  socks.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (connection === 'open') {
      bootTime = Date.now();
      botReady = true;
      socks.uptime = Date.now();
      socks.userId = cleanJid(socks.user?.id?.split('@')[0]);
      const botDir = socks.userId + '@s.whatsapp.net';
      const settings = db.getSettings(botDir);
      settings.type = 'Sub';
      db.setSettings(botDir, 'type', settings.type);
      const conss = global.conns.findIndex((c) => c.userId === socks.userId);
      if (conss !== -1) { global.conns[conss] = socks; } else { global.conns.push(socks); }
      delete reintentos[socks.userId || id];
      console.log(chalk.gray(`[ ✿  ]  SUB-BOT conectado: ${socks.userId}`));
      const sentFlagFile = path.join(socks.sessionFolder, 'msg_sent.flag');
      const hasSentMessage = fs.existsSync(sentFlagFile);
      if (msg && socks.isCommand && !hasSentMessage && socks.client && socks.chatId) {
        await socks.client.sendMessage(chatId, { text: `✎ Has conectado un nuevo Socket de tipo *Sub*.` }, { quoted: msg });
        fs.writeFileSync(sentFlagFile, '1');
        socks.isCommand = false;
        if (commandFlags[socks.senderId]) delete commandFlags[socks.senderId];
      }
    }
    if (connection === 'close') {
      const botId = socks.userId || id;
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason || 0;
      remove(socks);
      const intentos = reintentos[botId] || 0;
      reintentos[botId] = intentos + 1;
      const delay = backoffDelay(intentos, 4000, 30000, 1500);
      if ([401, 403].includes(reason)) {
        if (intentos < 5) {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} Conexión cerrada (código ${reason}) intento ${intentos}/5 → Reintentando en ${Math.round(delay/1000)}s...`));
          setTimeout(() => startSubBot(msg, getClient(client), caption, isCode, phone, chatId, isCommand), delay);
        } else {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} Falló tras 5 intentos. Eliminando sesión.`));
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) { console.error(`[ ✿  ] No se pudo eliminar ${sessionFolder}:`, e); }
          delete reintentos[botId];
        }
        return;
      }
      console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} desconectado (código ${reason}), reconectando en ${Math.round(delay/1000)}s...`));
      setTimeout(() => startSubBot(msg, getClient(client), caption, isCode, phone, chatId, isCommand), delay);
    }
    if (qr && isCode && phone && socks.client && chatId && senderId && commandFlags[senderId]) {
      try {
        let codeGen = await socks.requestPairingCode(phone);
        codeGen = codeGen.match(/.{1,4}/g)?.join('-') || codeGen;
        const msgCode = await sendPairingCodeMessage({
          sock: socks.client,
          jid: chatId,
          code: codeGen,
          quoted: msg,
          validitySeconds: PAIRING_CODE_TTL_SECONDS,
        });
        delete commandFlags[senderId];
        setTimeout(async () => {
          try { await socks.client.sendMessage(chatId, { delete: msgCode.key }); } catch {}
        }, PAIRING_CODE_TTL_SECONDS * 1000);
      } catch (err) { console.error('[Código Error]', err); }
    }
    if (qr && !isCode && socks.client && chatId && senderId && commandFlags[senderId]) {
      try {
        const msgQR = await socks.client.sendMessage(chatId, { image: await qrcode.toBuffer(qr, { scale: 8 }), caption }, { quoted: msg });
        delete commandFlags[senderId];
        setTimeout(async () => { try { await socks.client.sendMessage(chatId, { delete: msgQR.key }); } catch {} }, 60000);
      } catch (err) { console.error('[QR Error]', err); }
    }
  });
  return socks;
}

function msToTime(ms) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes} minuto${minutes !== 1 ? 's' : ''} y ${seconds} segundo${seconds !== 1 ? 's' : ''}`
    : `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
}

export default {
  command: ['code', 'qr'],
  category: 'socket',
  description: 'Gestionar bots subbots.',
  run: async ({ msg, sock, args, command }) => {
    db.setCreate('users', msg.sender, 'Subs', 0);
    const user = db.getUser(msg.sender);
    if (Date.now() - user.Subs < 80000) {
      const remainingTime = (user.Subs + 80000) - Date.now();
      return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remainingTime)}* para volver a intentar vincular un socket.`, msg);
    }
    ensureDir(subsPath);
    const allSubs = fs.readdirSync(subsPath, { withFileTypes: true })
      .filter((dir) => dir.isDirectory() && fs.existsSync(path.join(subsPath, dir.name, 'creds.json')))
      .map((dir) => dir.name);
    const activeSubNumbers = new Set();
    if (global.conns && Array.isArray(global.conns)) {
      for (const conn of global.conns) {
        if (conn?.user?.id) activeSubNumbers.add(conn.user.id.split(':')[0]);
      }
    }
    const activeSubs = allSubs.filter((num) => activeSubNumbers.has(num));
    if (activeSubs.length >= 50) {
      return sock.reply(msg.chat, '✐ No se han encontrado espacios disponibles para registrar un `Sub-Bot`.', msg);
    }
    commandFlags[msg.sender] = true;
    const rtx2 = '`✤` Vincula tu *cuenta* usando *codigo qr.*\n\n> ✥ Sigue las *instrucciones*\n\n*›* Click en los *3 puntos*\n*›* Toque *dispositivos vinculados*\n*›* Vincular *nuevo dispositivo*\n*›* Escanea el código *QR.*\n\n> ₊·( 🜸 ) ➭ Recuerda que no es recomendable usar tu cuenta principal para registrar un socket.';
    const isCode = /^(code)$/.test(command);
    const isCommand = /^(code|qr)$/.test(command);
    const caption = isCode ? '' : rtx2;
    const fullArgs = args.join(' ');
    const separatorIndex = fullArgs.search(/[|•\/]/);
    const rawPhone = separatorIndex === -1 ? fullArgs.trim() : fullArgs.slice(separatorIndex + 1).trim();
    const phone = normalizePhone(rawPhone || msg.sender.split('@')[0]);
    await startSubBot(msg, sock, caption, isCode, phone, msg.chat, isCommand);
    db.setUser(msg.sender, 'Subs', Date.now());
  },
};
