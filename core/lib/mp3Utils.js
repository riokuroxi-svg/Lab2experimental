// Utilidades para manejar MP3 sin corrupciones
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const exec = promisify(execFile);
const COVER_PATH = path.join(process.cwd(), 'media', 'audio-cover.jpg');

// Verifica si un buffer es un MP3 válido por magic bytes
export function isMp3Valid(buf) {
  if (!buf || buf.length < 4) return false;
  // ID3 header (tags con portada/metadatos)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MPEG frame sync
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true;
  return false;
}

// Agrega portada personalizada + metadatos a un MP3 usando archivo temporal (sin corromper)
export async function addCustomCoverToMp3(inputBuffer, titulo, artista = 'Ginko Bot') {
  // Si no hay ffmpeg o no hay portada, devolver tal cual
  try {
    await exec('ffmpeg', ['-version'], { timeout: 5000 });
  } catch {
    return inputBuffer;
  }
  if (!fs.existsSync(COVER_PATH)) return inputBuffer;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-mp3-'));
  const inPath = path.join(tmpDir, 'input.mp3');
  const outPath = path.join(tmpDir, 'final.mp3');
  
  try {
    fs.writeFileSync(inPath, inputBuffer);
    
    // Comando ffmpeg para agregar portada SIN romper el audio
    await exec('ffmpeg', [
      '-y',
      '-i', inPath,
      '-i', COVER_PATH,
      '-map', '0:a',          // Solo tomar el audio del primer archivo
      '-map', '1:v',          // Tomar la imagen del segundo archivo
      '-c', 'copy',           // No recodificar audio, es rápido
      '-id3v2_version', '3',  // Versión de ID3 compatible con TODOS los reproductores y WhatsApp
      '-metadata:s:v', 'title=Album cover',
      '-metadata:s:v', 'comment=Cover (front)',
      '-metadata', `title=${titulo}`,
      '-metadata', `artist=${artista}`,
      '-metadata', 'album=Ginko Bot',
      '-disposition:v', 'attached_pic',
      outPath
    ], { timeout: 45000 });

    if (!fs.existsSync(outPath)) return inputBuffer;
    const finalBuf = fs.readFileSync(outPath);
    // Verificar que el resultado siga siendo un MP3 válido
    if (isMp3Valid(finalBuf)) return finalBuf;
    return inputBuffer;
  } catch (e) {
    console.log('[mp3Utils] Error agregando portada:', e.message);
    return inputBuffer;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// Descarga audio de YouTube con yt-dlp a un ARCHIVO TEMPORAL (sin mezclar logs con binario)
export async function downloadAudioYtdlp(url, modo = 'fast', ytdlpPath = 'yt-dlp') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-dl-'));
  const outTemplate = path.join(tmpDir, 'audio.%(ext)s');
  let audioQuality = '9'; // rápido por defecto
  if (modo === 'mp3') audioQuality = '0'; // 320k
  if (modo === 'normal') audioQuality = '2'; // 192k

  const args = [
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', audioQuality,
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--extractor-args', 'youtube:player_client=android,web,web_embedded',
    '-N', '8',
    '-o', outTemplate,
    '--', url
  ];

  let outputFile = null;
  try {
    await exec(ytdlpPath, args, {
      timeout: 120000,
      windowsHide: true,
      cwd: tmpDir
    });
    // Buscar el archivo descargado
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp3'));
    if (files.length === 0) throw new Error('No se encontró el archivo MP3 descargado');
    outputFile = path.join(tmpDir, files[0]);
    let buf = fs.readFileSync(outputFile);
    if (!isMp3Valid(buf)) throw new Error('El archivo descargado no es un MP3 válido');
    
    // Limpiar tmpdir menos el buffer que ya tenemos
    return buf;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
