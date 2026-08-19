# 📥 Instalar y mantener yt-dlp en Ginko-MD-Lab

*(Texto de integración paso a paso — vale para VPS, Railway, Render o cualquier host con terminal)*

---

## PARTE A — ¿Se actualiza solo? (respuesta corta: NO por sí mismo, pero TU BOT lo hace por ti)

**yt-dlp no trae auto-actualización**: publica una versión estable cada ~2-4 semanas y un canal **nightly que compila todos los días** (el propio README recomienda nightly para usuarios regulares). Como YouTube rompe extractores cada pocas semanas, quedarse en una versión vieja = fallos seguros.

**Por eso el plugin `ytdlp.js` v2.1 trae el AUTO-UPDATE integrado.** No necesitas cron ni tocar nada:

- **Cada 24 h** el bot ejecuta `python3 -m pip install -U --pre "yt-dlp[default]"` (canal **nightly** → fixes del mismo día).
- Si yt-dlp se instaló como **binario** en vez de pip, detecta el fallo de pip y usa `yt-dlp --update-to nightly` / `yt-dlp -U`.
- Corre a los **60 segundos** de arrancar el bot y luego cada 24 h. **Funciona en cualquier host** (VPS, Railway, Render…), porque vive dentro del proceso del bot, no en el sistema.
- Logs en la consola del bot: `[ytdlp] 🔄 auto-update (pip/nightly): 2026.07.04 → 2026.08.18.122307`
- Configuración opcional en `.env`:

```
YTDLP_CHANNEL=nightly          # nightly (default) o stable
YTDLP_AUTO_UPDATE=off          # para desactivar el auto-update
YTDLP_PLUGIN_URL=https://raw.githubusercontent.com/riokuroxi-svg/Ginko-MD-Lab/main/cmds/downloads/ytdlp.js
```

**El propio plugin también se auto-actualiza** si pones `YTDLP_PLUGIN_URL` apuntando al archivo en tu repo de GitHub: subes una versión nueva al repo y el bot la descarga, la compara con su `VERSION` interna y se reemplaza solo (el hot-reload de tu `cmdsLoader` la carga al instante, sin reiniciar).

### Verificación manual (por si algún día quieres forzar)

```bash
yt-dlp --version                 # ver qué versión hay
python3 -m pip install -U --pre "yt-dlp[default]"   # forzar update a nightly ahora
```

### ⏱️ ¿Cuánto tarda la actualización y cuánto se cae el bot?

*(Todo medido en vivo durante la preparación de este plugin, agosto 2026)*

| Situación | Tiempo medido |
|---|---|
| Chequeo diario cuando ya está al día | **0.75 s** |
| Actualización real (descarga wheel + instala) | **~2.5–2.7 s** |
| Caída del bot durante el update | **0 s** — el update corre como proceso hijo async; el bot no se reinicia ni se congela, y sigue respondiendo comandos |
| Descarga en curso durante el update | **No se interrumpe** — probado en vivo: 30 MB descargados al 100% con 0 errores mientras pip reinstalaba yt-dlp en medio (en Linux el proceso en marcha conserva su código en memoria) |
| Desde que termina el update hasta que se usa | **0 s** — el siguiente comando `.ytdlp` ya usa la versión nueva |

**Dos matices:**

1. **Windows**: si el bot corre en Windows, reemplazar archivos en uso puede fallar con "file in use". El plugin lo detecta: marca la descarga como activa (`__ytdlpBusy`) y **pospone el update** al siguiente ciclo (24 h después). En Linux no existe ese problema.
2. **Cuándo cae YouTube, no el update**: cuando YouTube cambia algo y rompe el extractor, con el canal **nightly los fixes salen normalmente el mismo día** (se han visto commits de arreglo a las pocas horas de la rotura). Eventos grandes (como el 403 Forbidden de oct-2025) tuvieron parche de emergencia parcial el mismo día y fix completo en 1–3 días. El bot aplica el fix en su ciclo de 24 h → **la ventana típica de "caída" es de menos de 24 h, muchas veces el mismo día**. Con el canal *stable* esa ventana sería de 2–4 semanas, por eso el plugin usa nightly por defecto. Para no esperar al ciclo: `python3 -m pip install -U --pre "yt-dlp[default]"` (0.75–2.7 s).

### Opcional: cron como respaldo (solo VPS con shell)

Si además quieres un cron del sistema por redundancia:

```
0 4 * * * python3 -m pip install -U --pre "yt-dlp[default]" >> /var/log/ytdlp-update.log 2>&1
```

- **ffmpeg** se actualiza con el sistema: `apt update && apt upgrade -y` (si lo instalaste con apt).

---

## PARTE B — Integración en tu bot (paso a paso)

### Paso 1 · Instalar dependencias en el VPS (una sola vez)

```bash
apt update && apt install -y python3 python3-pip ffmpeg
pip install -U --pre "yt-dlp[default]"    # canal nightly (compilación diaria)
```

Comprobar que todo quedó bien:

```bash
yt-dlp --version     # ej. 2026.08.18.122307 (fecha de la compilación nightly)
ffmpeg -version      # debe imprimir la versión de ffmpeg
```

> ffmpeg solo es obligatorio si quieres el modo `.ytdlp <enlace> mp3`. El modo `audio` (turbo) no lo necesita.

### Paso 2 · Copiar el plugin a la carpeta de comandos

Coge el archivo **`plugins-extra/ytdlp.js`** del workspace y ponlo en:

```
cmds/downloads/ytdlp.js
```

Tres formas de hacerlo:

**Opción A — scp desde tu PC** (si descargaste el archivo):

```bash
scp ytdlp.js root@TU-VPS:/ruta/de/tu/bot/cmds/downloads/ytdlp.js
```

**Opción B — directo por terminal:**

```bash
nano /ruta/de/tu/bot/cmds/downloads/ytdlp.js
```

…pegas todo el contenido del archivo, `Ctrl+O`, `Enter`, `Ctrl+X`.

**Opción C — descargarlo dentro del VPS** (cuando esté publicado en un repo o gist).

**No hace falta reiniciar el bot**: el cargador (`core/system/cmdsLoader.js`) vigila la carpeta `cmds/` y registra el comando solo. En la consola del bot verás el log de que el plugin se cargó.

### Paso 3 · (Opcional) Configurar `.env`

Solo si yt-dlp no está en el PATH del usuario que corre el bot:

```
YTDLP_PATH=/usr/local/bin/yt-dlp
```

### Paso 4 · Probar

En WhatsApp, a tu bot:

```
.ytdlp https://youtu.be/xxxx audio    → canción m4a (rápido)
.ytdlp https://youtu.be/xxxx mp3      → mp3 320k
.ytdlp https://youtu.be/xxxx          → video 720p
.ytdlp https://youtu.be/xxxx fast     → m4a ligero, máxima velocidad
```

### Paso 5 · Mantenimiento (ninguno, ya es automático)

El bot se actualiza solo cada 24 h. Si aun así un día algo falla y no quieres esperar al ciclo:

```bash
python3 -m pip install -U --pre "yt-dlp[default]"   # forzar update ya
```

Si el error dice *"Sign in to confirm you're not a bot"*: es bloqueo de IP del VPS, no del plugin (ver sección de troubleshooting en la guía general — se arregla con cookies de sesión).

---

## PARTE C — Problemas frecuentes (atajos)

| Síntoma | Causa | Solución |
|---|---|---|
| "yt-dlp: command not found" | No instalado o no está en PATH | `pip install -U yt-dlp` o define `YTDLP_PATH` en `.env` |
| "ffmpeg no encontrado" al pedir mp3 | Falta ffmpeg | `apt install ffmpeg` |
| Error de extractor de repente | YouTube cambió algo | Normalmente el auto-update lo arregla en ≤24 h; para forzar: `python3 -m pip install -U --pre "yt-dlp[default]"` |
| "Video unavailable" / "confirm you're not a bot" | IP de datacenter bloqueada por YouTube | Cookies de sesión o cambiar de proveedor/IP |
| Descarga lenta | YouTube aplica throttling al cliente web | Ya resuelto en v2 (cliente android); si vuelve, avísame |
| Bot se congela con videos grandes | RAM insuficiente en el VPS | Usar modos `audio`/`fast`, o pedirme la v3 con cola de descargas |
| Canción repetida tarda igual | Caché no se creó (permisos) | Revisa que exista `media/cache-ytdlp/` y tenga permisos de escritura |

---

**Resumen:** instalar es 1 comando + copiar 1 archivo. Después de eso, **cero mantenimiento**: el bot actualiza yt-dlp (canal nightly) y opcionalmente el propio plugin cada 24 h, todo desde dentro del proceso, funcione donde funcione (VPS, Railway, Render).
