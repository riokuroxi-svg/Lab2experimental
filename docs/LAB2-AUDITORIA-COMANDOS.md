# 🔍 Re-auditoría de comandos — Lab2experimental

**Fecha:** 2026-08-28
**Base:** rama `main` (commit `5f46be0` + `.health` en `71d059c`)
**Método:** inspección del código actual + pruebas HTTP reales a cada endpoint de las APIs externas (curl con timeout).

> ⚠️ **La auditoría anterior** (`audit/REPORTE-AUDITORIA.md`, 2026-08-12) quedó **desactualizada**: desde entonces el bot migró `.play`/`.mp3` a **yt-dlp local** y **cambió varias APIs** (tiktok ahora usa `tikwm`, emojimix usa `emojik`, waifu usa `nekos.life`). Varios comandos que antes estaban "rotos" **ya funcionan**, y aparecieron **problemas nuevos** (la API de lempi ahora exige una key válida).

---

## 🟢 Resumen ejecutivo

| Estado | Cuántos | Qué significa |
|---|---|---|
| ✅ **Vivo** | la gran mayoría | Funciona hoy (local o API viva). |
| ⚠️ **Frágil** | ~8 | Depende de una API floja / scraping que puede fallar intermitentemente. Tiene fallback. **Hay que probarlo en Termux.** |
| ❌ **Roto** | **4** | Ningún backend usable confirmado hoy: `.play2/.mp4`, `.qc`, `.twitter`, `.imagen`. |

El bot está **mucho más sano** de lo que sugería la auditoría vieja. Ya no hay "36 rotos": hoy el problema real se concentra en **4 comandos**, y **2 de ellos son los más usados** (`.play2/.mp4` y `.imagen`).

---

## 📊 Por categoría

### 🗄️ Local (sin APIs externas) → ✅ funcionan
`.ping` · `.menu`/`.menumanual` · `.status` · `.health` (nuevo) · `.infobot` · invite/report/suggest · owner (exec/restart/update) · socket (setprefix, setname, setowner, join/leave/logout/reload/self, etc.) · group (kick/promote/warn/welcome/antilink...) · economy (todo) · gacha local · profile · `.getpic` · `.read` · `.say` · `.morse` · `.encuesta` · `.recordar` · `.level` · eventos bienvenida/anti-link/anti-status.

### 📥 Descargas
| Comando | Fuente | Estado | Nota / Decisión |
|---|---|---|---|
| `.play` / `.mp3` | **yt-dlp local** (principal) + lempi (fallback) | ✅ | Totalmente operativo si tienes yt-dlp (requisito). El fallback a lempi está roto (key) pero no importa si hay yt-dlp. |
| `.ytdlp` | yt-dlp local turbo | ✅ | Operativo. |
| `.ytsearch` | `core/lib/youtubeSearch.js` (local) | ✅ | Reemplaza al `yt-search` que fallaba. |
| `.mp4` / `.play2` | lempi `dl/ytv` | ❌ **ROTO** | lempi devuelve **401** (la key `montekey28` ya no es válida). **Decisión:** portar la ruta yt-dlp de `.mp3` hacia `.mp4` (así funciona local igual que audio). |
| `.tiktok` | `tikwm.com` | ✅ | Cambiado a tikwm; responde 200. |
| `.deezer` | `api.deezer.com` | ✅ | 200. |
| `.apk` | aptoide-scraper | ✅ | Paquete npm. |
| `.banchdl` (benchdl) | yt-dlp (lab) | ✅ | Solo medición, no envía archivo. |
| `.facebook` | scraping + `global.APIs` | ⚠️ | Backends: `vreden`/`zenzxz` DNS muerto, `delirius` timeout, lempi key rota. Solo `ootaizumi`/`yuki`/`siputzx` podrían servir. **Probar en Termux; decidir reemplazo.** |
| `.instagram` | `global.APIs` | ⚠️ | `ootaizumi` vivo; `delirius`/`zenzxz`/lempi caídos. **Probar en Termux** (puede funcionar vía ootaizumi). |
| `.twitter` / `.x` | `global.APIs` | ❌ **ROTO** | deliraius timeout, Ginko/lempi 401, zenzxz DNS muerto → los 3 backends fallan. **Decisión:** reemplazar por API viva (probar ootaizumi/yuki/siputzx) o eliminar. |
| `.pinterest` | — (stub) | ✅ (aviso) | Es un **aviso elegante** de "fuera de servicio", ya está bien resuelto. No es error del bot. |
| `.imagen` | lempi `search/image` + delirius `gimage` | ❌ **ROTO** | lempi `search/image` → **404**, delirius → **timeout**. **Decisión:** cambiar a una fuente de imágenes que funcione (scrape de Bing/Google o API viva). Es un comando muy usado. |
| `.mediafire` | scraping `mediafire.com` | ⚠️ | Scraping directo, frágil. Probar en Termux. |
| `.gdrive` | `drive.google.com/uc` directo | ⚠️ | Frágil (Google suele pedir cookies/confirmar). Probar en Termux. |

### 🎨 Stickers y utilidades
| Comando | Fuente | Estado | Nota |
|---|---|---|---|
| `.sticker`/`.stickers` | ffmpeg local | ✅ | Requiere ffmpeg. |
| `.brat` / `.bratv` | skyzxu | ✅ | 200. |
| `.emojimix` | **emojik** | ✅ | **Cambiado de Tenor** (que estaba muerto) → 200 PNG. |
| `.qc` | bot.lyo.su | ❌ **ROTO** | **526 SSL** (certificado inválido). **Decisión:** buscar API alternativa de quote maker o eliminar. |
| packs de stickers | node-webpmux | ✅ | Local. |
| `.qrcode` | qrserver | ✅ | 200. |
| `.acortar` | tinyurl | ✅ | 200. |
| `.carbon` | carbonara (POST) | ✅ | 200, devuelve PNG. |
| `.btc`/`.crypto` | coingecko | ✅ | 200. |
| `.gitclone`/`.gh` | api.github.com | ✅ | 200. |
| `.translate` | paquete npm | ✅ | — |
| `.tourl` | **litterbox** | ✅ | Probado en vivo: sube y devuelve enlace. El otro host (adoolab) está bloqueado por Cloudflare, pero litterbox funciona. |
| `.toimg` | ezgif | ✅ | — |
| `.hd`/`.remini` | upscale (POST) | ⚠️ | El endpoint responde (400 con body incompleto) → vivo pero exige el POST correcto. Probar en Termux. |
| `.ai`/`.chatgpt` | Gemini | ⚠️ | Texto funciona **si pones `GEMINI_API_KEY`** en `.env`/`config.private.js`. La subida de imágenes usaba `uguu.se` (muerto) → **solo imágenes** falla. |

### 🎌 Anime / NSFW
| Comando | Fuente | Estado | Nota |
|---|---|---|---|
| `.anime` | AniList (POST) | ✅ | 200 (probado: devuelve NARUTO). |
| `.waifu` | nekos.life | ✅ | **Cambiado de waifu.pics** (muerto) → 200. |
| `.ppcouple` | GitHub raw | ✅ | 200. |
| `.danbooru` | danbooru | ✅ | Ahora 200 (antes 403). Con User-Agent funciona. |
| `.gelbooru` / `.gbooru` | gelbooru | ✅ | 200 al seguir redirect + UA. |
| `.rule34` | rule34.xxx | ✅ | 200. |
| `.xnxx` / `.xvideos` | scraping HTML | ✅ | 200. |
| reacciones (`.hug`, `.kiss`...) | assets locales | ✅ | — |

---

## ❌ Lo que estaba ROTO (4 comandos) → Resuelto 2026-08-28 ✅

1. **`.mp4` / `.play2`** — lempi (key inválida, 401). → **✅ Arreglado:** ahora usa **yt-dlp local** (fallback a API).
2. **`.imagen`** — lempi 404 + delirius timeout. → **✅ Arreglado:** ahora usa **Bing Images local** (scrapeo sin key).
3. **`.qc`** — bot.lyo.su (SSL 526). → **🟡 Desactivado con aviso claro** (sin API estable). Reinicio fácil cuando haya API.
4. **`.twitter`** — los 3 backends caídos. → **🟡 Desactivado con aviso claro** (sin servidor estable). Reinicio fácil cuando haya servidor.

## 🎯 Frágiles pendientes (probar en Termux y decidir uno por uno)

- `.facebook`, `.instagram`, `.mediafire`, `.gdrive`, `.hd`, `.ai` (imágenes).
  Estos dependen de scraping/APIs flojas → **se prueban en Termux** antes de decidir.

> Todos estos cambios se harán **en Lab2**, con checkpoint, y **no pasan a Ginko-MD** hasta que los apruebes tras probarlos en Termux.

## ✅ Verificaciones hechas
- Pruebas HTTP en vivo a cada endpoint (2026-08-28).
- Lectura del código actual (los comandos de descarga usan `global.APIs` configurable + fallbacks).

## ⚠️ Pendiente de tu confirmación en Termux
Los marcados **⚠️ Frágil** y los que dependen de **scraping** pueden comportarse distinto en Termux. La prueba real la haces tú.
