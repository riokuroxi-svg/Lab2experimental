import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fastFetch } from '#lib/fastFetch';
import { downloadAudioYtdlp, downloadAudioSourceYtdlp, processMp3ForWhatsApp, isMp3Valid } from '#lib/mp3Utils';
import { adquirir } from '#lib/humanize';
import {
  formatBytes,
  measureStep,
  normalizeBenchmarkMode,
  renderBenchReport,
  validateBenchUrl,
} from '#lib/downloadBench';

const exec = promisify(execFile);
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

async function getYtdlpVersion() {
  const { stdout } = await exec(YTDLP, ['--version'], { timeout: 15_000 });
  return String(stdout || '').trim();
}

async function getOEmbedInfo(videoId) {
  if (!videoId) return null;
  const url = `https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`;
  const res = await fastFetch(url, { timeout: 8_000 });
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  return res.json();
}

async function getYtdlpMetadata(url) {
  const { stdout } = await exec(YTDLP, [
    '--dump-single-json',
    '--no-warnings',
    '--no-playlist',
    '--skip-download',
    '--',
    url,
  ], {
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(String(stdout || '{}'));
}

export default {
  command: ['benchdl'],
  category: 'downloads',
  description: 'Lab2: mide tiempos de metadatos y descarga yt-dlp sin tocar .play/.mp3.',
  run: async ({ msg, sock, args, usedPrefix }) => {
    const url = String(args[0] || '').trim();
    const mode = normalizeBenchmarkMode(args[1] || 'fast');

    const validation = validateBenchUrl(url);
    if (!validation.ok) {
      return msg.reply(
        `🧪 *BenchDL · Lab2*\n\n` +
        `⚠️ ${validation.reason}\n\n` +
        `Uso:\n*${usedPrefix}benchdl* <url real de YouTube> [fast|normal|mp3]\n\n` +
        `Ejemplo:\n*${usedPrefix}benchdl* https://youtu.be/dQw4w9WgXcQ fast\n\n` +
        `_Este comando solo mide; no modifica ni reemplaza .play/.mp3._`,
      );
    }

    let liberar = null;
    const steps = [];
    let audioBytes = 0;
    let mp3Valid = false;
    let title = '';

    try {
      liberar = await adquirir('descargas', 1);
      await sock.sendMessage(msg.chat, {
        text: `🧪 *BenchDL iniciado*\n\nModo: *${mode}*\nURL: ${url}\n\nMidiendo sin enviar archivo...`,
      }, { quoted: msg });
      try { await sock.sendMessage(msg.chat, { react: { text: '🧪', key: msg.key } }); } catch {}

      const versionStep = await measureStep('yt-dlp versión', getYtdlpVersion);
      steps.push(versionStep);
      if (!versionStep.ok) throw new Error(`yt-dlp no disponible: ${versionStep.error}`);

      const videoId = validation.videoId;
      const oembedStep = await measureStep('metadata oEmbed', () => getOEmbedInfo(videoId));
      steps.push(oembedStep);
      if (oembedStep.ok && oembedStep.value?.title) title = oembedStep.value.title;

      if (mode === 'play') {
        let source = null;
        const sourceStep = await measureStep('descarga fuente yt-dlp', async () => {
          source = await downloadAudioSourceYtdlp(url, YTDLP);
          return { bytes: source.buffer.length, ext: source.ext };
        });
        if (sourceStep.value) sourceStep.value = { bytes: sourceStep.value.bytes, ext: sourceStep.value.ext };
        steps.push(sourceStep);

        if (sourceStep.ok && source?.buffer?.length) {
          const processStep = await measureStep('proceso MP3 Ginko 128K', async () => {
            const processed = await processMp3ForWhatsApp(source.buffer, title || 'Audio', 'Ginko Bot', 128, 'api');
            audioBytes = processed.buffer.length;
            mp3Valid = isMp3Valid(processed.buffer);
            return processed;
          });
          if (processStep.value) processStep.value = { bytes: audioBytes, mp3Valid };
          steps.push(processStep);
        }
      } else {
        const metadataStep = await measureStep('metadata yt-dlp', () => getYtdlpMetadata(url));
        steps.push(metadataStep);
        if (metadataStep.ok && metadataStep.value?.title) title = metadataStep.value.title;

        const downloadStep = await measureStep(`descarga audio ${mode}`, async () => {
          const buffer = await downloadAudioYtdlp(url, mode, YTDLP);
          audioBytes = buffer.length;
          mp3Valid = isMp3Valid(buffer);
          return buffer;
        });
        // No guardamos ni reenviamos el buffer; solo medimos tamaño/validez.
        if (downloadStep.value) downloadStep.value = { bytes: audioBytes, mp3Valid };
        steps.push(downloadStep);
      }

      await sock.sendMessage(msg.chat, {
        text: renderBenchReport({ url, mode, steps, audioBytes, mp3Valid, title }),
      }, { quoted: msg });
      try { await sock.sendMessage(msg.chat, { react: { text: downloadStep.ok ? '✅' : '⚠️', key: msg.key } }); } catch {}
    } catch (error) {
      await sock.sendMessage(msg.chat, {
        text: renderBenchReport({ url, mode, steps, audioBytes, mp3Valid, title }) +
          `\n\n❌ *BenchDL se detuvo:* ${error?.message || error}`,
      }, { quoted: msg });
      try { await sock.sendMessage(msg.chat, { react: { text: '❌', key: msg.key } }); } catch {}
    } finally {
      if (liberar) liberar();
    }
  },
};

export const __benchdlInternals = {
  getYtdlpVersion,
  getOEmbedInfo,
  getYtdlpMetadata,
  formatBytes,
};
