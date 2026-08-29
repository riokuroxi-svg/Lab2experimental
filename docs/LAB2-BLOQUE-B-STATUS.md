# Bloque B — Cache y saturación · Estado en Lab2

> Registro vivo del Bloque B. Cada punto se marca cuando está implementado y
> **verificado**. No pasa a estable hasta que lo pruebes en Termux.

---

## Punto 5 — `.cache` / `.cache clear` ✅ implementado

**Qué hace:**
- `.cache` → muestra el estado (temp, yt-dlp, play/mp3) con tamaño y nº de archivos, y el total.
- `.cache clear` → limpia TODO (solo owner).
- `.cache clear <tmp|ytdlp|play>` → limpia un caché concreto (cualquiera).

**Qué NO toca** (por seguridad): los **assets** de `media/` (menu.jpg, audio-cover,
code-banner), la **sesión** y la **base de datos**.

**Archivos:**
- `core/lib/cacheMgmt.js` (nuevo) — escanear/limpiar cachés, defensivo, nunca lanza.
- `cmds/main/cache.js` (nuevo) — el comando.
- `core/system/commands.js` — 1 línea en el menú `main`.

---

## Punto 6 — Límite de concurrencia en comandos pesados ✅ implementado

**Infraestructura:**
- `core/lib/limits.js` (nuevo) → `withLimit(clave, máx, fn)` reutiliza el semáforo
  global ya existente (`#lib/humanize`) y **si está lleno lanza un error de usuario**
  («Espera un momento…») en vez de un error interno.

**Comandos envueltos (los que hacen trabajo pesado):**
| Comando | Clave | Límite | Motivo |
|---|---|---|---|
| `.sticker` | `media` | 3 | ffmpeg (imagen/video → sticker) |
| `.imagen` | `media` | 3 | scrapeo Bing + descarga de las imágenes del álbum |
| `.hd` (enhance/remini) | `api` | 2 | API lenta de upscaling |

> Las **descargas** ya tenían su límite (`adquirir('descargas', 2)` en `.play`/`.ytdlp`/`.benchdl`).
> Ahora los procesamientos de imágenes/stickers y una API lenta también están limitados.

---

## Punto 7 — Circuit breaker para APIs externas ✅ implementado

**Infraestructura:**
- `core/lib/apiBreaker.js` (nuevo) → patrón estándar **Closed → Open → Half-Open**.
  - Si un servicio falla **3 veces seguidas** → se abre (pausa el comando con aviso claro).
  - Mientras está abierto **no llama a la API** (evita spamear y "bot vivo pero roto").
  - Tras **60 s** de cooldown permite una llamada de prueba (half-open); si funciona se
    cierra, si falla se vuelve a abrir.
  - Los errores de **usuario** (datos inválidos) no cuentan como fallo de API.

**Comandos que ya lo usan (APIs externas):**
- `.carbon` → `carbon`
- `.btc`/`.crypto` → `coingecko`
- `.acortar` → `tinyurl`
- `.deezer` → `deezer`
- `.brat` → `brat` · `.bratv` → `bratv`

**Para ver/restablecer:**
- `.health` (owner) ahora muestra el **estado de cada servicio** (🟢 OK / 🟥 PAUSADO / 🟨 SONDEANDO).
- `.health breaker reset` (owner) → reactiva todos.

---

## Verificación hecha (antes de tocar estable)

- Sintaxis: `node --check` de **220** archivos en `cmds/` + `core/` → **0 errores**.
- Pruebas de unidad (asserts):
  - `cacheMgmt`: **9/9** (formatBytes, scan, clear, límites).
  - `limits` (`withLimit`): **5/5 + 3/3** (semáforo lleno → UserError, libera siempre).
  - `apiBreaker`: **11/11** (closed/open/half-open, cooldown, reset, no cuenta UserErrors).
  - Integración de libs juntas: cargan y cooperan sin conflictos de alias.
- Registro del comando `.cache` en el loader → OK.

> ⚠️ El sandbox no tiene `node_modules` (baileys, jimp...) ni Node ≥ 22.5, así que
> los tests que importan `baileys` fallan por ello (ambiental). La validación real
> final es en **Termux**.

## Para probar en Termux

```bash
cd Lab2experimental && git pull && npm install
# en WhatsApp:
.cache                 # ver tamaño de cachés
.cache clear ytdlp    # limpiar uno
.cache clear          # limpiar todo (owner)
.sticker <imagen>     # verificar que no rompe con el límite
.btc bitcoin          # que el breaker no estorba (debe responder normal)
.health               # ver estado + circuit-breakers
```
