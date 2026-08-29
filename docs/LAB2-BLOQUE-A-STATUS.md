# Bloque A — Resiliencia liviana · Estado en Lab2

> Registro vivo del Bloque A. Cada punto se marca cuando está implementado y
> **verificado**. No pasa a estable hasta que lo pruebes en Termux.

## Punto 1 — Fijar versión exacta de Baileys ✅ (ya existía)

- Hoy `package.json` fija Baileys a un commit exacto:
  `github:this-xys/WaSocket#41ce95870eb3c78d038ad9055705d270052cdfe2`.
- No hay `"latest"` suelto en Baileys. **No requiere trabajo.**

## Punto 2 — Auditar comandos muertos ✅ (re-auditoría hecha)

- Resultado completo en [`docs/LAB2-AUDITORIA-COMANDOS.md`](LAB2-AUDITORIA-COMANDOS.md).
  Re-análisis a live **contra el código actual** (la auditoría vieja quedó obsoleta).
- Inventario real actual (2026-08-28): **192 archivos** en `cmds/`, **186 con `run`**
  y 6 que son *hooks/tareas de fondo* (antilink, antistatus, events, level,
  gachareserved, afktime) — NO son comandos muertos.
- **Conclusión:** ya NO hay 36 rotos. Hoy el problema real se reduce a **4 comandos**:
  1. `.mp4`/`.play2` (lempi 401).
  2. `.qc` (SSL 526).
  3. `.twitter` (los 3 backends caídos).
  4. `.imagen` (lempi 404 + delirius timeout).
- Varios "antes rotos" ahora están **vivos** (danbooru, gelbooru, nekos.life,
  tikwm, emojik, .waifu, .anime, .carbon, .brat, .apk).

### Decisión tomada sobre los 4 rotos (2026-08-28)
| Comando | Decisión | Cómo |
|---|---|---|
| `.mp4` / `.play2` | ✅ **Arreglado** | Ahora usa **yt-dlp local** (igual que `.play`/`.mp3`), con la API como respaldo. Ya no depende de la key de lempi. |
| `.imagen` | ✅ **Arreglado** | Ahora usa **Bing Images local** (scrapeo sin API key), con las APIs de respaldo. |
| `.qc` | 🟡 **Desactivado con aviso claro** | No hay API de quote estable (SSL roto; las alternativas están caídas). Se muestra un mensaje que sugiere `.brat`/`.bratv`/`.sticker`. Reinicio fácil cuando haya API. |
| `.twitter` | 🟡 **Desactivado con aviso claro** | Los 3 backends de `global.APIs` están caídos. Se muestra un mensaje que sugiere otras descargas. Reinicio fácil cuando haya servidor. |

> Toda esta tanda se hizo **solo en Lab2** y con checkpoint. Nada pasó a Ginko-MD.

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
- **No se tocó** `index.js`. En chat privado solo lo usa el owner; en grupos
  funciona para todos (igual que `.status`).

## Punto 4 — Separar errores de usuario vs. técnicos ✅ implementado

- Se creó [`core/lib/errors.js`](../core/lib/errors.js) con:
  - `UserError` / `userError()` → errores de **usuario** (mensaje claro y seguro).
  - `formatCommandError()` → decide el texto según si es error de usuario o técnico.
- **Cambio mínimo en `main.js`** (el despachador): se reemplazó solo la línea del
  `catch` para usar `formatCommandError()`.
  - Error de usuario → se muestra el mensaje tal cual.
  - Error técnico → se registra (en `.health`) y **solo el owner ve el detalle**;
    al resto se le muestra un mensaje genérico y **sin stack**.
- `index.js` **no se tocó**. El supervisor de errores (`processGuard`) sigue intacto.
- Los comandos ya pueden usar `userError('...')` para mensajes limpios.

## Verificación hecha (antes de tocar estable)

## Verificación hecha (antes de tocar estable)

- `node --check` de **todos** los archivos `cmds/` y `core/` (216 .js) → **0 errores de sintaxis**.
- Suite de **13 asserts** sobre `diagnostics.js` → **13/13 OK**.
- Suite de **8 asserts** sobre `errors.js`/`formatCommandError` → **8/8 OK**.
- Resolución de aliases `#lib/*` → OK.
- Registro del comando en el loader (`.health`, `.mp4`, `.imagen`, `.qc`, `.twitter`) → OK.
- `test:lab2-fixes` falla **solo** por `baileys`/deps no instaladas en el sandbox (ambiental,
  no por estos cambios). En Termux con `npm install` debería pasar.
- API probes en vivo para los comandos modificados (Bing Images, yt-dlp, backends) → OK.

> No todos los tests ambientales corren aquí: el sandbox no tiene las dependencias
> (`baileys`, `jimp`...) ni Node ≥ 22.5. La validación real final es en **Termux**.

> Nota: la prueba real de envío en WhatsApp se hace en **Termux**. En el sandbox
> no se puede arrancar el bot (requiere Node ≥ 22.5 y la sesión de WhatsApp).
