import { fastFetch } from '#lib/fastFetch';

const YOUTUBE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'es-MX,es;q=0.9,en;q=0.8',
};

export function getYouTubeVideoId(input = '') {
  const raw = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  return raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/,
  )?.[1] || null;
}

function textFromRuns(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run?.text || '').join('').trim();
  if (Array.isArray(value)) return value.map((run) => run?.text || '').join('').trim();
  return '';
}

function lastThumbnail(value) {
  const thumbnails = value?.thumbnail?.thumbnails || value?.thumbnails || [];
  return thumbnails.length ? thumbnails[thumbnails.length - 1]?.url : null;
}

function normalizeViewCount(text = '') {
  const raw = String(text || '0');
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function extractJsonObject(html, marker = 'var ytInitialData = ') {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = markerIndex + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function collectVideos(node, videos = [], seen = new Set()) {
  if (!node || typeof node !== 'object') return videos;
  if (node.videoRenderer?.videoId && !seen.has(node.videoRenderer.videoId)) {
    const renderer = node.videoRenderer;
    const videoId = renderer.videoId;
    seen.add(videoId);
    const title = textFromRuns(renderer.title) || 'Video';
    const channel = textFromRuns(renderer.ownerText) || textFromRuns(renderer.shortBylineText) || 'Desconocido';
    const timestamp = textFromRuns(renderer.lengthText) || '??';
    const ago = textFromRuns(renderer.publishedTimeText) || '';
    const viewsText = textFromRuns(renderer.viewCountText) || '0';
    const thumbnail = lastThumbnail(renderer) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    videos.push({
      type: 'video',
      videoId,
      title,
      url: `https://youtu.be/${videoId}`,
      thumbnail,
      image: thumbnail,
      author: { name: channel },
      timestamp,
      ago,
      views: normalizeViewCount(viewsText),
      viewsLabel: viewsText,
    });
  }
  for (const value of Object.values(node)) collectVideos(value, videos, seen);
  return videos;
}

export async function getVideoInfoById(videoId) {
  const id = getYouTubeVideoId(videoId);
  if (!id) return null;
  try {
    const res = await fastFetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`, {
      timeout: 6000,
      headers: YOUTUBE_HEADERS,
    });
    if (res.ok) {
      const json = await res.json();
      return {
        type: 'video',
        videoId: id,
        url: `https://youtu.be/${id}`,
        title: json.title || 'Audio',
        thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        image: json.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        author: { name: json.author_name || 'Desconocido' },
        timestamp: '??',
        ago: '',
        views: 0,
      };
    }
  } catch {}
  return {
    type: 'video',
    videoId: id,
    url: `https://youtu.be/${id}`,
    title: 'Audio',
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    author: { name: 'Desconocido' },
    timestamp: '??',
    ago: '',
    views: 0,
  };
}

export async function searchYouTube(query, { limit = 10 } = {}) {
  const raw = String(query || '').trim();
  if (!raw) return { videos: [], all: [] };
  const directId = getYouTubeVideoId(raw);
  if (directId) {
    const info = await getVideoInfoById(directId);
    return { videos: info ? [info] : [], all: info ? [info] : [] };
  }
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(raw)}`;
  const res = await fastFetch(url, { timeout: 12_000, headers: YOUTUBE_HEADERS });
  if (!res.ok) throw new Error(`YouTube search HTTP ${res.status}`);
  const html = await res.text();
  const jsonText = extractJsonObject(html);
  if (!jsonText) throw new Error('YouTube no devolvió datos de búsqueda parseables');
  const data = JSON.parse(jsonText);
  const videos = collectVideos(data).slice(0, limit);
  return { videos, all: videos };
}

export default async function ytsSafe(input) {
  if (input && typeof input === 'object' && input.videoId) return getVideoInfoById(input.videoId);
  return searchYouTube(input);
}

export const __youtubeSearchTest = {
  textFromRuns,
  extractJsonObject,
  collectVideos,
  normalizeViewCount,
};
