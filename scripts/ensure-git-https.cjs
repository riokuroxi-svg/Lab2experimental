/**
 * ensure-git-https.cjs — Red de seguridad para `npm install` en contenedores.
 *
 * npm, al resolver una dependencia de GitHub, la representa internamente como
 * `ssh://git@github.com/...`; en algunos entornos (imágenes Docker/BoxMine sin
 * el binario `ssh` ni llaves) git intenta usar SSH y falla. Este script —que
 * corre en `preinstall`— reescribe en la config de git las URLs SSH de GitHub a
 * HTTPS, para que git nunca invoque `ssh`.
 *
 * Es IDEMPOTENTE (solo añade la regla si no existe) y NUNCA lanza error: si no
 * hay git, no hace nada y el install continúa. Vive en el repo para que el fix
 * sea durable y no dependa de una configuración hecha a mano en el servidor.
 *
 * Importante: usamos `--add` porque `url.<base>.insteadOf` admite VARIOS
 * valores (una base, varios prefijos reescritos). Sin `--add`, git sobrescribe
 * y solo quedaría la última regla.
 */
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

// [base_https, prefijo_ssh_a_reescribir]
const REWRITES = [
  ['https://github.com/', 'ssh://git@github.com/'],
  ['https://github.com/', 'git@github.com:'],
  ['https://github.com/', 'git+ssh://git@github.com/'],
];

async function existingRules() {
  const set = new Set();
  try {
    const { stdout } = await exec('git', ['config', '--global', '--get-regexp', '^url\\..*\\.insteadof$'], { timeout: 10000 });
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const m = line.trim().match(/^url\.(.*)\.insteadof\s+(.*)$/);
      if (m) set.add(`${m[1]}||${m[2]}`);
    }
  } catch {
    // '--get-regexp' devuelve código 1 si no hay reglas → lo ignoramos.
  }
  return set;
}

async function main() {
  // 1) Sin git, no hay nada que configurar → salimos sin error.
  try {
    await exec('git', ['--version'], { timeout: 10000 });
  } catch {
    return;
  }
  // 2) Reglas ya existentes (para no duplicar al re-ejecutar).
  const existentes = await existingRules();
  // 3) Añadir solo lo que falta (con --add).
  for (const [base, prefix] of REWRITES) {
    if (existentes.has(`${base}||${prefix}`)) continue;
    try {
      await exec('git', ['config', '--global', '--add', `url.${base}.insteadOf`, prefix], { timeout: 10000 });
    } catch {
      // Continuar con el resto; no abortamos el install.
    }
  }
}

main().catch(() => {});
