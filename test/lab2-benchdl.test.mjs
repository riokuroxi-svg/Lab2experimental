import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  formatMs,
  getYouTubeVideoId,
  isYouTubeUrl,
  normalizeBenchmarkMode,
  renderBenchReport,
  validateBenchUrl,
} from '../core/lib/downloadBench.js';

test('BenchDL normaliza modos sin tocar play/mp3', () => {
  assert.equal(normalizeBenchmarkMode('play'), 'play');
  assert.equal(normalizeBenchmarkMode('ginko'), 'play');
  assert.equal(normalizeBenchmarkMode('fast'), 'fast');
  assert.equal(normalizeBenchmarkMode('rapido'), 'fast');
  assert.equal(normalizeBenchmarkMode('normal'), 'normal');
  assert.equal(normalizeBenchmarkMode('320k'), 'mp3');
});

test('BenchDL detecta URLs e IDs de YouTube', () => {
  assert.equal(isYouTubeUrl('https://youtu.be/abcdefghijk'), true);
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=abcdefghijk'), true);
  assert.equal(isYouTubeUrl('https://example.com/watch?v=abcdefghijk'), false);
  assert.equal(getYouTubeVideoId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
  assert.equal(getYouTubeVideoId('https://www.youtube.com/shorts/ABCDEFGHI_1'), 'ABCDEFGHI_1');
});

test('BenchDL formatea reporte de medición', () => {
  assert.equal(formatMs(532), '532 ms');
  assert.equal(formatMs(1532), '1.53 s');
  assert.equal(formatBytes(1024 * 1024), '1.00 MB');
  const report = renderBenchReport({
    url: 'https://youtu.be/abcdefghijk',
    mode: 'fast',
    title: 'Demo',
    steps: [{ label: 'yt-dlp versión', ok: true, ms: 120 }],
    audioBytes: 1024 * 1024,
    mp3Valid: true,
  });
  assert.match(report, /BenchDL/);
  assert.match(report, /yt-dlp versión/);
  assert.match(report, /No envía archivo/);
});

test('BenchDL rechaza el VIDEO_ID literal antes de llamar yt-dlp', () => {
  const invalid = validateBenchUrl('https://youtu.be/VIDEO_ID');
  assert.equal(invalid.ok, false);
  assert.match(invalid.reason, /VIDEO_ID/);

  const valid = validateBenchUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(valid.ok, true);
  assert.equal(valid.videoId, 'dQw4w9WgXcQ');
});



import ytsSafe, { __youtubeSearchTest } from '../core/lib/youtubeSearch.js';

test('YouTube search seguro parsea videoRenderer sin yt-search', () => {
  const initial = 'x var ytInitialData = {"contents":{"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Demo"}]},"thumbnail":{"thumbnails":[{"url":"small"},{"url":"big"}]},"ownerText":{"runs":[{"text":"Canal"}]},"lengthText":{"simpleText":"1:23"},"viewCountText":{"simpleText":"1,234 views"}}}};</script>';
  const json = __youtubeSearchTest.extractJsonObject(initial);
  const videos = __youtubeSearchTest.collectVideos(JSON.parse(json));
  assert.equal(videos[0].videoId, 'abcdefghijk');
  assert.equal(videos[0].title, 'Demo');
  assert.equal(videos[0].thumbnail, 'big');
  assert.equal(videos[0].views, 1234);
});

test('YouTube search seguro resuelve videoId con oEmbed', async () => {
  const info = await ytsSafe({ videoId: 'te7oRUy0L4U' });
  assert.equal(info.videoId, 'te7oRUy0L4U');
  assert.match(info.title, /Marlboro Rojo/i);
});
