// ════════════════════════════════════════════════════════════
//  sqliteAuth.js — AuthState de Baileys sobre SQLite NATIVO
//  (node:sqlite, Node >= 22.5 — sin better-sqlite3, sin compilar nada)
//
//  Por qué:
//   · useMultiFileAuthState escribe creds.json con writeFile sin fsync:
//     un corte de luz/reinicio feo del VPS puede dejar creds.json corrupto
//     (síntoma: "Sesión inválida" y toca re-vincular el bot).
//   · SQLite escribe de forma atómica (WAL) → el peor caso es perder
//     el ÚLTIMO cambio, nunca corromper la sesión entera.
//
//  Migración automática (sin re-vincular):
//   · creds.json se importa a la DB la primera vez.
//   · Las keys se importan PEROZOSAMENTE: cuando Baileys pide una key
//     que no está en la DB, se lee del archivo suelto antiguo usando el
//     mismo fixFileName() de Baileys (sin reconstruir ids → sin errores)
//     y se guarda en la DB en ese momento.
//   · Los archivos viejos quedan como respaldo (no se borran).
//
//  Basado en la implementación de referencia de Baileys
//  (lib/Utils/use-sqlite-auth-state.js), adaptada a node:sqlite.
// ════════════════════════════════════════════════════════════
import path from 'path'
import fs from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { BufferJSON, initAuthCreds, proto } from 'baileys'

// Mismo mangleo de nombres que Baileys usa para archivos sueltos
const fixFileName = (file = '') => String(file).replace(/\//g, '__').replace(/:/g, '-')

function leerArchivoLegacy(sessionDir, name) {
  try {
    const p = path.join(sessionDir, fixFileName(name))
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8'), BufferJSON.reviver)
  } catch {
    return null
  }
}

export function useSQLiteAuthState(sessionDir) {
  fs.mkdirSync(sessionDir, { recursive: true })
  const db = new DatabaseSync(path.join(sessionDir, 'auth.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(`CREATE TABLE IF NOT EXISTS creds (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  db.exec(`CREATE TABLE IF NOT EXISTS signal_keys (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (type, id)
  )`)

  const stmts = {
    credsSelect: db.prepare('SELECT value FROM creds WHERE key = ?'),
    credsUpsert: db.prepare('INSERT INTO creds (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    keySelect: db.prepare('SELECT value FROM signal_keys WHERE type = ? AND id = ?'),
    keyUpsert: db.prepare('INSERT INTO signal_keys (type, id, value) VALUES (?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET value = excluded.value'),
    keyDelete: db.prepare('DELETE FROM signal_keys WHERE type = ? AND id = ?'),
    clearKeys: db.prepare('DELETE FROM signal_keys'),
  }

  // ── Migración de creds.json → SQLite (una sola vez) ──
  try {
    if (!stmts.credsSelect.get('__creds__')) {
      const legacy = leerArchivoLegacy(sessionDir, 'creds.json')
      if (legacy) {
        stmts.credsUpsert.run('__creds__', JSON.stringify(legacy, BufferJSON.replacer))
        console.log('[sqliteAuth] ✅ creds.json migrado a auth.db (el archivo queda como respaldo)')
      }
    }
  } catch { /* nunca bloquear el arranque por la migración */ }

  const deserializar = (raw, type) => {
    try {
      let value = JSON.parse(raw, BufferJSON.reviver)
      if (type === 'app-state-sync-key' && value) {
        value = proto.Message.AppStateSyncKeyData.fromObject(value)
      }
      return value
    } catch {
      return null
    }
  }

  const creds = (() => {
    const row = stmts.credsSelect.get('__creds__')
    if (row) {
      try { return JSON.parse(row.value, BufferJSON.reviver) } catch {}
    }
    return initAuthCreds()
  })()

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {}
        for (const id of ids) {
          const row = stmts.keySelect.get(type, id)
          if (row) {
            data[id] = deserializar(row.value, type)
            continue
          }
          // Migración perezosa: la key aún vive en archivo suelto
          const legacy = leerArchivoLegacy(sessionDir, `${type}-${id}.json`)
          if (legacy) {
            const value = type === 'app-state-sync-key'
              ? proto.Message.AppStateSyncKeyData.fromObject(legacy)
              : legacy
            stmts.keyUpsert.run(type, id, JSON.stringify(legacy, BufferJSON.replacer))
            data[id] = value
          }
        }
        return data
      },
      set: async (data) => {
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id]
            if (value) stmts.keyUpsert.run(category, id, JSON.stringify(value, BufferJSON.replacer))
            else stmts.keyDelete.run(category, id)
          }
        }
      },
    },
  }

  return {
    state,
    saveCreds: () => stmts.credsUpsert.run('__creds__', JSON.stringify(creds, BufferJSON.replacer)),
    clear: () => {
      stmts.clearKeys.run()
      stmts.credsUpsert.run('__creds__', JSON.stringify(initAuthCreds(), BufferJSON.replacer))
    },
  }
}
