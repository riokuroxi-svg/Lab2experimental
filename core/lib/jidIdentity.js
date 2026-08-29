export function normalizeIdentityJid(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  if (/:\d+@/i.test(s)) s = s.replace(/^(.*?):\d+@/, '$1@');
  if (!s.includes('@')) {
    const digits = s.replace(/\D/g, '');
    if (digits) s = `${digits}@s.whatsapp.net`;
  }
  return s.toLowerCase();
}

// Normaliza un número/JID de owner a sus SOLO dígitos canónicos, tolerando el
// prefijo móvil de país (México: 521... ↔ 525..., para bot = 5255...). Así la
// comparación de owner no falla por el "1" que WhatsApp añade a los móviles.
export function normalizeOwnerNumber(raw) {
  let s = String(raw || '').split('@')[0].replace(/\D/g, '');
  if (!s) return '';
  if (/^521\d+$/.test(s)) s = '52' + s.slice(3); // 521xxxxxxxxxx → 525xxxxxxxxx
  return s;
}

// ¿El JID del emisor es uno de los números owner/mod? (tolera 521/525 en México).
export function isOneOfOwner(sender, numbers = []) {
  const s = normalizeOwnerNumber(sender);
  if (!s) return false;
  const list = Array.isArray(numbers) ? numbers : [numbers];
  return list.some((n) => normalizeOwnerNumber(n) === s);
}

export function addIdentity(ids, raw) {
  const norm = normalizeIdentityJid(raw);
  if (!norm) return;
  ids.add(norm);
  if (!norm.endsWith('@g.us')) ids.add(norm.split('@')[0]);
}

export function participantIdentities(participant = {}) {
  const ids = new Set();
  addIdentity(ids, participant.id);
  addIdentity(ids, participant.jid);
  addIdentity(ids, participant.lid);
  addIdentity(ids, participant.phoneNumber);
  return ids;
}

export function expandWithParticipants(seedIds, participants = []) {
  const expanded = new Set(seedIds || []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const participant of participants || []) {
      const ids = participantIdentities(participant);
      const intersects = [...ids].some((id) => expanded.has(id));
      if (!intersects) continue;
      for (const id of ids) {
        if (!expanded.has(id)) {
          expanded.add(id);
          changed = true;
        }
      }
    }
  }
  return expanded;
}

export function collectOwnerIdentities(msg, groupMetadata) {
  let ids = new Set();
  addIdentity(ids, msg?.sender);
  addIdentity(ids, msg?.key?.participant);
  addIdentity(ids, msg?.participant);
  if (!String(msg?.chat || '').endsWith('@g.us')) addIdentity(ids, msg?.chat);
  ids = expandWithParticipants(ids, groupMetadata?.participants || []);
  return [...ids];
}

export function sameIdentity(left = [], right = []) {
  const a = new Set(left.map(normalizeIdentityJid).filter(Boolean));
  for (const value of right) {
    const norm = normalizeIdentityJid(value);
    if (norm && a.has(norm)) return true;
  }
  return false;
}

export function parseActionButtonId(buttonId = '', prefix = '') {
  const raw = String(buttonId || '');
  if (!prefix || !raw.startsWith(prefix)) return null;
  const body = raw.slice(prefix.length);
  const legacy = /^(si|no)_(.+)$/.exec(body);
  if (legacy) return { action: legacy[1], eventId: legacy[2], token: '' };
  const modern = /^([a-z0-9]+)_(si|no)_(.+)$/i.exec(body);
  if (!modern) return null;
  return { token: modern[1], action: modern[2], eventId: modern[3] };
}

export function createEventToken() {
  return `ev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
