# Bloque A — Resiliencia liviana · Estado en Lab2

> Registro vivo del Bloque A. Cada punto se marca cuando está implementado y
> **verificado**. No pasa a estable hasta que lo pruebes en Termux.

## Punto 1 — Fijar versión exacta de Baileys ✅ (ya existía)

- Hoy `package.json` fija Baileys a un commit exacto:
  `github:this-xys/WaSocket#41ce95870eb3c78d038ad9055705d270052cdfe2`.
- No hay `"latest"` suelto en Baileys. **No requiere trabajo.**

## Punto 2 — Auditar comandos muertos 🚧 en curso

- La auditoría de `audit/REPORTE-AUDITORIA.md` es del **2026-08-12** (base vieja).
  Desde entonces el bot migró `.play`/`.mp3` a **yt-dlp local**, así que esa lista
  está desactualizada: varios "rotos" ya no dependen de la API muerta.
- Inventario real actual (generado el 2026-08-28): **192 archivos** en `cmds/`,
  **186 con `run`** y 6 que son *hooks/tareas de fondo* (antilink, antistatus,
  events, level, gachareserved, afktime) — NO son comandos muertos.
- **Siguiente paso:** re-verificar contra el código actual cuáles siguen rotos
  (APIs externas caídas) y decidir: arreglar / hacer local / eliminar.

## Punto 3 — `.health` / `.statsbot` ✅ implementado (este cambio)

Comando nuevo:

- Aliases: `health`, `statsbot`, `salud`.
- Categoría: `main`.
- Muestra: estado de conexión, tipo de bot, Node, uptime (bot + sistema), CPU,
  RAM (sistema + proceso), estado **yt-dlp**, estado **ffmpeg**, usuarios/grupos/
  comandos, y **últimos errores** (detalle solo para owner).
- Subcomando owner: `health clear` (borra historial de errores).
- Archivos tocados:
  - `core/lib/diagnostics.js` (nuevo) — buffer de errores + helpers (aditivo, seguro).
  - `cmds/main/health.js` (nuevo) — el comando.
  - `core/system/commands.js` — solo una línea descriptiva en el menú `main`.
- **No se tocó** `index.js` ni `main.js` (protegidos). En chat privado solo lo usa
  el owner; en grupos funciona para todos (igual que `.status`).

## Punto 4 — Separar errores de usuario vs. técnicos 🚧 pendiente

- Requiere tocar el `catch` del despachador (`main.js`), que está **protegido**.
- Se hará en su propio bloque, con checkpoint previo, para que nunca se rompa
  el flujo central.
- El buffer de `core/lib/diagnostics.js` ya queda preparado para ahí.

## Verificación hecha (antes de tocar estable)

- `node --check` de los 3 archivos tocados → OK.
- Suite de 13 asserts sobre `diagnostics.js` (buffer, orden, límite, clear,
  formatUptime, truncateError) → **13/13 OK**.
- Resolución de aliases `#lib/fastFetch` y `#lib/diagnostics` → OK.
- Registro del comando en el loader (`[health, statsbot, salud]`) → OK.

> Nota: la prueba real de envío en WhatsApp se hace en **Termux**. En el sandbox
> no se puede arrancar el bot (requiere Node ≥ 22.5 y la sesión de WhatsApp).
