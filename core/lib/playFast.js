export const PLAYFAST_PREFIX = '__ginko_playfast_';

export function makePlayFastToken() {
  return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makePlayFastButtonId(token, action) {
  return `${PLAYFAST_PREFIX}${token}_${action}`;
}

export function parsePlayFastButtonId(id = '') {
  const raw = String(id || '');
  if (!raw.startsWith(PLAYFAST_PREFIX)) return null;
  const rest = raw.slice(PLAYFAST_PREFIX.length);
  const index = rest.lastIndexOf('_');
  if (index <= 0) return null;
  const token = rest.slice(0, index);
  const action = rest.slice(index + 1);
  if (!token || !['audio', 'doc'].includes(action)) return null;
  return { token, action };
}

export function sanitizeAudioFilename(name = 'audio') {
  return String(name || 'audio')
    .replace(/\.(mp3|mp4|mkv|webm|mov|avi|m4a)$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'audio';
}

export function buildPlayFastCaption({ title = 'Audio', channel = 'Desconocido', duration = '??', url = '', source = 'oEmbed' } = {}) {
  return [
    '⚡ *PLAYFAST · Lab2*',
    '',
    `> ❖ Título › *${title}*`,
    `> ❖ Canal › *${channel}*`,
    `> ⴵ Duración › *${duration || '??'}*`,
    `> ❒ Enlace › ${url}`,
    '',
    `Metadata: *${source}*`,
    '',
    '🟢 Toca un botón:',
    '*Audio ⚡* = MP3 con portada/nombre Ginko',
    '*Doc MP3* = MP3 como documento',
    '',
    '_Comando experimental: no reemplaza .play/.mp3._',
  ].join('\n');
}
