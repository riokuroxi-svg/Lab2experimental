// Utilidades para manejar MP3 sin corrupciones
// Basado en las recomendaciones oficiales de issues de Baileys (#1797) y pruebas reales
// WhatsApp Android renombra a AUD-xxxx cuando:
//   1. El MP3 tiene metadatos ID3 corruptos/duplicados/gigantes
//   2. La portada embebida es demasiado grande (>500KB o >1000px causa fallos)
//   3. El codec/header MPEG no es estándar (Xing/VBR headers rotos)
// Solución: RECODIFICAR COMPLETAMENTE el MP3 con libmp3lame a 128kbps 44100Hz stereo,
//           portada 500x500 JPEG comprimida (~30KB), ID3v2.3 limpio.
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const exec = promisify(execFile);
const COVER_PATH = path.join(process.cwd(), 'media', 'audio-cover.jpg');

// Verifica si un buffer es un MP3 válido por magic bytes
export function isMp3Valid(buf) {
  if (!buf || buf.length < 10) return false;
  // ID3v2 header (10 bytes): 'ID3' + ver_mayor + ver_menor + flags + tamaño(4 bytes syncsafe)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    // Tamaño del tag en bytes 6-9 (syncsafe: cada byte usa solo 7 bits)
    const tagSize = ((buf[6] & 0x7F) << 21) | ((buf[7] & 0x7F) << 14) | ((buf[8] & 0x7F) << 7) | (buf[9] & 0x7F);
    if (tagSize > 512 * 1024) return false; // ID3 tag demasiado grande, WhatsApp lo renombra a AUD-xxxx
    return true;
  }
  // MPEG frame sync (0xFF 0xE0..0xFF) - MP3 sin ID3
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true;
  return false;
}

// Obtener duración en segundos con ffprobe (exportable para que el comando lo use como 'seconds')
export async function getMp3Duration(filePath) {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ], { timeout: 10000 });
    const data = JSON.parse(stdout);
    return Math.round(parseFloat(data.format?.duration || 0));
  } catch {
    return 0;
  }
}

// Redimensionar portada en memoria a 500x500 JPEG ~30-50KB con ffmpeg
// (si no hay ffmpeg, usar la versión ya redimensionada en disco)
async function getOptimizedCover() {
  // La portada en disco ya fue redimensionada a 500x500 ~33KB
  if (fs.existsSync(COVER_PATH)) {
    const stat = fs.statSync(COVER_PATH);
    // Si la portada en disco es menor de 200KB, usarla directamente (ya está optimizada)
    if (stat.size < 200 * 1024) return COVER_PATH;
  }
  return COVER_PATH;
}

/**
 * REMUX rápido: copia el audio sin recodificar y solo incrusta portada +
 * metadatos limpios. Válido únicamente para MP3 generados por ffmpeg
 * (descargas locales con yt-dlp). Devuelve null si no valida → el
 * llamador cae a la recodificación completa (seguridad AUD-xxxx intacta).
 */
async function remuxConPortada(inputBuffer, safeTitle, artista, coverPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-remux-'));
  const inPath = path.join(tmpDir, 'input.mp3');
  const outPath = path.join(tmpDir, 'final.mp3');
  try {
    fs.writeFileSync(inPath, inputBuffer);
    const hasCover = fs.existsSync(coverPath);

    const args = ['-y', '-i', inPath];
    if (hasCover) args.push('-i', coverPath);
    args.push('-map', '0:a');
    if (hasCover) {
      args.push('-map', '1:v', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic',
        '-metadata:s:v', 'comment=Cover (front)', '-metadata:s:v', 'title=Album cover');
    }
    args.push(
      '-c:a', 'copy',            // ⚡ NO recodificar: el audio de yt-dlp ya es limpio
      '-id3v2_version', '3',
      '-map_metadata', '-1',
      '-metadata', `title=${safeTitle}`,
      '-metadata', `artist=${artista}`,
      '-metadata', 'album=Ginko Bot',
      '-avoid_negative_ts', 'make_zero',
      outPath,
    );

    await exec('ffmpeg', args, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
    if (!fs.existsSync(outPath)) return null;

    const finalBuf = fs.readFileSync(outPath);
    if (!isMp3Valid(finalBuf)) return null;

    const seconds = await getMp3Duration(outPath);
    return { buffer: finalBuf, seconds };
  } catch (e) {
    console.log('[mp3Utils] remux rápido falló:', e.message?.slice(0, 120));
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Procesa un buffer MP3 para que WhatsApp lo acepte como archivo de música.
 * - origen 'local' (audio descargado con yt-dlp, ya limpio de ffmpeg):
 *   REMUX rápido — copia el audio sin recodificar y solo incrusta portada
 *   y metadatos (~0.1s vs ~6s). Si el resultado no valida, cae
 *   automáticamente a la recodificación completa.
 * - origen 'api' (APIs públicas, MP3s con headers posibles rotos):
 *   RECODIFICACIÓN completa con libmp3lame (fix del AUD-xxxx).
 * Devuelve { buffer, seconds }
 */
export async function processMp3ForWhatsApp(inputBuffer, titulo, artista = 'Ginko Bot', bitrateKbps = 128, origen = 'api') {
  // Verificar que ffmpeg está disponible
  try {
    await exec('ffmpeg', ['-version'], { timeout: 5000 });
  } catch {
    return { buffer: inputBuffer, seconds: 0 };
  }

  const coverPath = await getOptimizedCover();
  const hasCover = fs.existsSync(coverPath);
  const safeTitle = String(titulo || 'Audio').slice(0, 200);

  // ── Vía rápida: remux para audio local ya limpio ──
  if (origen === 'local') {
    const rapido = await remuxConPortada(inputBuffer, safeTitle, artista, coverPath);
    if (rapido) return rapido;
    console.log('[mp3Utils] remux no válido → recodificación completa de respaldo');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-mp3-'));
  const inPath = path.join(tmpDir, 'input.mp3');
  const outPath = path.join(tmpDir, 'final.mp3');

  try {
    fs.writeFileSync(inPath, inputBuffer);

    const args = ['-y', '-i', inPath];

    // Agregar la portada como segundo input si existe
    if (hasCover) {
      args.push('-i', coverPath);
    }

    // Mapear streams: audio del input 0, imagen del input 1 si existe
    args.push('-map', '0:a');
    if (hasCover) {
      args.push('-map', '1:v');
    }

    // ⚠️ REC0DIFICAR SIEMPRE (no usar -c copy) para reparar headers Xing/VBR corruptos
    // y eliminar metadatos antiguos. 44100Hz stereo = formato que WhatsApp acepta 100%
    args.push(
      '-c:a', 'libmp3lame',
      '-b:a', `${bitrateKbps}k`,
      '-ar', '44100',
      '-ac', '2',
      '-id3v2_version', '3',      // ID3v2.3: máxima compatibilidad con Android/iOS/WhatsApp
      '-write_id3v1', '1',         // Agregar ID3v1 también para reproductores antiguos
      '-map_metadata', '-1',       // ❌ BORRAR TODOS los metadatos anteriores de yt-dlp
    );

    if (hasCover) {
      // La portada va como stream de video con disposición attached_pic (portada embebida)
      args.push(
        '-c:v', 'mjpeg',           // JPEG para la portada
        '-disposition:v', 'attached_pic',
        '-metadata:s:v', 'comment=Cover (front)',
        '-metadata:s:v', 'title=Album cover',
      );
    }

    // Metadatos limpios
    args.push(
      '-metadata', `title=${safeTitle}`,
      '-metadata', `artist=${artista}`,
      '-metadata', 'album=Ginko Bot',
    );

    // Asegurar que el MP3 no tenga problemas de timestamps negativos
    args.push('-avoid_negative_ts', 'make_zero');
    args.push(outPath);

    await exec('ffmpeg', args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    if (!fs.existsSync(outPath)) return { buffer: inputBuffer, seconds: 0 };

    const finalBuf = fs.readFileSync(outPath);

    // Verificar que el resultado sea un MP3 válido
    if (!isMp3Valid(finalBuf)) {
      console.log('[mp3Utils] Advertencia: MP3 procesado no superó validación, devolviendo original');
      return { buffer: inputBuffer, seconds: 0 };
    }

    // Calcular duración
    const seconds = await getMp3Duration(outPath);

    return { buffer: finalBuf, seconds };
  } catch (e) {
    console.log('[mp3Utils] Error procesando MP3:', e.message?.slice(0, 200));
    return { buffer: inputBuffer, seconds: 0 };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// Compatibilidad con código viejo que usa addCustomCoverToMp3
export async function addCustomCoverToMp3(inputBuffer, titulo, artista) {
  const { buffer } = await processMp3ForWhatsApp(inputBuffer, titulo, artista);
  return buffer;
}

// Descarga audio de YouTube con yt-dlp a un ARCHIVO TEMPORAL (sin mezclar logs con binario)
export async function downloadAudioYtdlp(url, modo = 'fast', ytdlpPath = 'yt-dlp') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-dl-'));
  const outTemplate = path.join(tmpDir, 'audio.%(ext)s');
  let audioQuality = '128K'; // estándar MP3 pasable sin inflar demasiado el archivo
  if (modo === 'mp3') audioQuality = '192K'; // alta sin peso exagerado para WhatsApp
  if (modo === 'normal') audioQuality = '128K';
  if (modo === 'fast') audioQuality = '128K';

  const args = [
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', audioQuality,
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=android,web,web_embedded',
    '--no-embed-metadata',       // NO embeber metadatos de YouTube (ffmpeg los pondrá limpios)
    '--no-embed-chapters',
    '-N', '8',
    '-o', outTemplate,
    '--', url
  ];

  let outputFile = null;
  try {
    await exec(ytdlpPath, args, {
      timeout: 120000,
      windowsHide: true,
      cwd: tmpDir,
      maxBuffer: 10 * 1024 * 1024
    });
    // Buscar el archivo descargado
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp3'));
    if (files.length === 0) throw new Error('No se encontró el archivo MP3 descargado');
    outputFile = path.join(tmpDir, files[0]);
    let buf = fs.readFileSync(outputFile);
    if (!isMp3Valid(buf)) throw new Error('El archivo descargado no es un MP3 válido');

    return buf;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
