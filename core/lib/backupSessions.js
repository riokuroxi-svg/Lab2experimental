// ════════════════════════════════════════════════════════════
//  backupSessions.js — Respaldo automático de sesiones
//
//  El SQLite evita la CORRUPCIÓN de creds, pero no la PÉRDIDA:
//  si el VPS muere o se borra Sessions/ por accidente, toca
//  re-vincular todos los bots a mano. Esto lo resuelve:
//
//   · 1 vez al día: checkpoint de cada auth.db (WAL → archivo
//     principal, copia consistente) y copia completa de Sessions/
//     a backups/sessions-YYYYMMDD.
//   · Rotación: conserva las últimas N copias (default 7 días).
//   · Sin dependencias nuevas (solo fs + node:sqlite).
//
//  .env (opcional):
//   GINKO_BACKUP_SESSIONS=off   → desactiva el respaldo
//   GINKO_BACKUP_KEEP=7         → cuántas copias conservar
// ════════════════════════════════════════════════════════════
import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'

const BACKUP_ROOT = path.join(process.cwd(), 'backups')
const SESSIONS_DIR = path.join(process.cwd(), 'Sessions')

function habilitado() {
  return (process.env.GINKO_BACKUP_SESSIONS || 'on').toLowerCase() !== 'off'
}

function keepCount() {
  const n = parseInt(process.env.GINKO_BACKUP_KEEP || '7', 10)
  return Number.isFinite(n) && n > 0 ? n : 7
}

// checkpoint de TODOS los auth.db (asegura copia consistente con WAL)
function checkpointTodos() {
  if (!fs.existsSync(SESSIONS_DIR)) return
  const archivos = []
  const buscar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) buscar(p)
      else if (e.name === 'auth.db') archivos.push(p)
    }
  }
  try { buscar(SESSIONS_DIR) } catch { return }
  for (const dbPath of archivos) {
    let db = null
    try {
      db = new DatabaseSync(dbPath)
      db.exec('PRAGMA busy_timeout = 3000')
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch { /* un db en uso o raro: la copia igual se intenta */ }
    finally {
      try { db?.close() } catch {}
    }
  }
}

// rota: borra las copias que exceden N
function rotar() {
  try {
    const copias = fs.readdirSync(BACKUP_ROOT)
      .filter(n => /^sessions-\d{8}$/.test(n))
      .sort() // nombre por fecha → orden cronológico
    const exceso = copias.length - keepCount()
    for (let i = 0; i < exceso; i++) {
      try { fs.rmSync(path.join(BACKUP_ROOT, copias[i]), { recursive: true, force: true }) } catch {}
    }
  } catch {}
}

export function backupSessions() {
  if (!habilitado()) return { ok: false, razon: 'desactivado' }
  if (!fs.existsSync(SESSIONS_DIR)) return { ok: false, razon: 'sin carpeta Sessions' }

  const t0 = Date.now()
  checkpointTodos()

  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
  const destino = path.join(BACKUP_ROOT, `sessions-${fecha}`)

  try {
    fs.rmSync(destino, { recursive: true, force: true }) // si ya existe hoy, se reemplaza
    fs.mkdirSync(BACKUP_ROOT, { recursive: true })
    fs.cpSync(SESSIONS_DIR, destino, { recursive: true })
    rotar()
    return { ok: true, destino, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, razon: String(e?.message || e).slice(0, 120) }
  }
}

export function startSessionBackup() {
  if (!habilitado()) return
  const UN_DIA = 24 * 60 * 60 * 1000
  // primera copia a los 5 minutos del arranque (no molestar la conexión)
  setTimeout(() => {
    const r = backupSessions()
    if (r.ok) console.log(`[backup] ✅ Sesiones respaldadas en ${r.destino} (${Math.round(r.ms / 1000)}s)`)
    else console.log(`[backup] ⚠️ Respaldo omitido: ${r.razon}`)
  }, 5 * 60 * 1000)
  setInterval(() => {
    const r = backupSessions()
    if (r.ok) console.log(`[backup] ✅ Sesiones respaldadas en ${r.destino} (${Math.round(r.ms / 1000)}s)`)
    else console.log(`[backup] ⚠️ Respaldo omitido: ${r.razon}`)
  }, UN_DIA)
}
