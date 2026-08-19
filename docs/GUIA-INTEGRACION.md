# 🧪 Guía de integración para Ginko-MD-Lab

Cómo aprovechar los repos de ingeniería inversa/automatización dentro de **tu** bot (Baileys MD, ESM, Node ≥ 20).

---

## 0 · Anatomía de tu bot (lo que necesitas saber)

| Pieza | Dónde está | Para qué sirve aquí |
|---|---|---|
| Plugins de comandos | `cmds/<categoria>/<archivo>.js` | Cada archivo exporta `default` con `{ command, category, description, run }`. El loader (`core/system/cmdsLoader.js`) **recarga en caliente** al guardar el archivo. |
| Contexto del comando | `run({ msg, sock, args, usedPrefix, command })` | `msg.reply()`, `msg.react('🕒')`, `sock.sendMessage(...)` |
| Servidor HTTP | `server.js` (Express, puerto `PORT` o 3000) | Para **webhooks entrantes** (SMS) y paneles de hosting |
| Secretos | `.env` (dotenv ya está instalado) | Tokens/API keys **nunca en el código** |
| Socket principal | `global.sock` | Para enviar mensajes desde webhooks |

### Los 4 patrones de integración (todo se reduce a esto)

1. **Proceso externo** → el bot ejecuta una herramienta CLI con `child_process` (yt-dlp).
2. **Microservicio HTTP local** → la herramienta corre en su propio puerto y el bot la llama con `fetch` (TikTok API, Instagram).
3. **API REST en la nube** → el bot llama a un servicio ya existente (httpSMS).
4. **Webhook entrante** → un servicio externo golpea tu `server.js` (SMS recibidos).

---

## 1 · yt-dlp — motor de descarga universal ✅ *plugin listo y probado*

**Qué es:** extractor de video/audio de +1000 sitios. Es la mejora más directa para tu carpeta `cmds/downloads/`, porque tus comandos actuales (tikwm, APIs públicas) se caen seguido.

**Patrón:** proceso externo (el bot ejecuta el binario `yt-dlp`).

### Instalación en tu VPS

```bash
pip install -U yt-dlp        # o binario desde github.com/yt-dlp/yt-dlp/releases
apt install ffmpeg           # OBLIGATORIO: mp3 y fusión video+audio
yt-dlp --version             # comprobar
```

### Instalación del plugin en el bot

1. Copia `plugins-extra/ytdlp.js` → `cmds/downloads/ytdlp.js` (hot-reload, sin reiniciar).
2. Opcional en `.env`: `YTDLP_PATH=/usr/local/bin/yt-dlp`

**Comandos:**
- `.ytdlp <enlace>` → video ≤720p
- `.ytdlp <enlace> audio` → canción en **m4a nativo** (⚡ turbo: sin conversión)
- `.ytdlp <enlace> mp3` → mp3 320k (usa ffmpeg; único modo "lento", solo si se pide)
- `.ytdlp <enlace> fast` → m4a ~96k, máxima velocidad

**¿Se actualiza solo?** Sí, la v2.1 trae **auto-update integrado**: cada 24 h el bot actualiza yt-dlp por pip (canal **nightly**, compilaciones diarias) o `yt-dlp -U` si es binario. Opcional en `.env`: `YTDLP_CHANNEL=stable`, `YTDLP_AUTO_UPDATE=off`, y `YTDLP_PLUGIN_URL=<raw de tu repo>` para que **el propio plugin se auto-reemplace** desde GitHub cuando subas una versión nueva (hot-reload). Detalles en `instalacion-ytdlp.md`.

**Por qué descarga más rápido (modo turbo v2):**
- **Audio sin ffmpeg:** descarga el stream m4a nativo directo, en vez de descargar todo y convertir (las APIs públicas que usabas descargan video completo, convierten en su servidor y te meten en cola).
- **Bypass del throttling de YouTube:** `player_client=android` evita el límite de velocidad que YouTube aplica al cliente web (~100-300 KB/s).
- **Fragmentos en paralelo** (`-N 8`) y **caché en disco de 24 h** (`media/cache-ytdlp/`) → canción repetida = respuesta instantánea.
- Video ≤16 MB → mensaje de video; >16 MB → documento. Audio ≤50 MB, video ≤100 MB.
- Probado en sandbox: metadatos ✔, modo audio turbo ✔, modo fast ✔ y conversión mp3 con ffmpeg ✔ (archivos válidos en los 4 caminos).

**Troubleshooting conocido:** en algunos VPS YouTube devuelve *"Video unavailable"* (IP de datacenter bloqueada). Solución en ese caso: agregar al comando `--extractor-args "youtube:player_client=web_embedded,android"` o pasar cookies: `--cookies cookies.txt`.

> ⚠️ Legal: úsalo para contenido propio, público o con permiso. El uso que le den tus usuarios es responsabilidad de cada quien, pero evita promocionar el bot como "descargador de música con copyright".

---

## 2 · TikTok con endpoints internos — `Evil0ctal/Douyin_TikTok_Download_API`

**Qué es:** el repo concreto que corresponde a "TikTok-Download-With-API": un servicio FastAPI que usa los endpoints de la **app móvil** de TikTok (sin marca de agua, estable) + Douyin, Bilibili, etc.

**Patrón:** microservicio local (puerto 8000) + `fetch` desde tu `tiktok.js`.

### Despliegue

```bash
# Opción A: instalador
wget -O install.sh https://raw.githubusercontent.com/Evil0ctal/Douyin_TikTok_Download_API/main/bash/install.sh
sudo bash install.sh

# Opción B: Docker
docker run -d -p 8000:8000 evil0ctal/douyin_tiktok_download_api
```

### Integración en `cmds/downloads/tiktok.js`

Agrega este proveedor **antes** de tikwm en tu función (tus APIs públicas quedan como respaldo):

```js
// Proveedor 1: API local con endpoints de la app (si está desplegada)
const TIKTOK_LOCAL = process.env.TIKTOK_API_LOCAL // ej: http://127.0.0.1:8000
if (TIKTOK_LOCAL) {
  const r = await fetchJson(`${TIKTOK_LOCAL}/api/hybrid/video_data?url=${encodeURIComponent(url)}&minimal=true`)
  if (r?.code === 200 && r?.data) {
    const vd = r.data.video_data || {}
    const videoUrl = vd.nwm_video_url_HQ || vd.nwm_video_url || vd.play || vd.wm_video_url
    if (videoUrl) { /* usar videoUrl igual que hoy usas d.hdplay */ }
  }
}
// Proveedor 2: tikwm.com (tu código actual, como respaldo)
```

Documentación de endpoints en `http://localhost:8000/docs` (Swagger). También trae `pip install` del paquete por si prefieres importarlo en un script aparte.

---

## 3 · Instagram con API privada — microservicio (recomendado)

**Estado real de los repos:** el `instagram-private-api` de dilame **ya no recibe releases desde 2024** y se queda atrás contra los cambios de Instagram. La comunidad se movió a **`instagrapi`/`aiograpi` (Python)**, con wrappers REST ya hechos, p. ej. `subzeroid/instagrapi-rest`.

**Patrón recomendado:** microservicio Docker (Python) + `fetch` desde `cmds/downloads/instagram.js`.

```bash
# En tu VPS, junto al bot
docker run -d -p 8001:8000 subzeroid/instagrapi-rest   # revisa su README para env vars (credenciales)
```

Luego en `instagram.js`, antes de tus APIs públicas:

```js
const IG_LOCAL = process.env.IG_API_LOCAL // ej: http://127.0.0.1:8001
if (IG_LOCAL) {
  const r = await fetchJson(`${IG_LOCAL}/media/by_url?url=${encodeURIComponent(args[0])}`) // ruta según su Swagger /docs
  if (r?.url) { /* enviar como hoy */ }
}
```

**Opción B (menos recomendada):** `npm install instagram-private-api` directo en el bot. Funciona para lectura (posts/reels), pero:
- El paquete está estancado → se rompe cada cierto tiempo.
- Un solo login con sesión persistente en `Sessions/` (no loguear en cada comando o te banean).

> ⚠️ **Cuenta desechable obligatoria** (nunca tu cuenta personal ni la del número del bot): Instagram banea cuentas que usan API privada, y es contra sus términos. Lo mismo aplica a TikTok con el servicio local.

---

## 4 · SMS y verificación (OTP)

### 4.1 httpSMS — tu propio Android como pasarela ✅ legal y útil

**Qué es:** app Android que convierte **tu propio teléfono** en una puerta de enlace SMS por HTTP. Base URL `https://api.httpsms.com`, autenticación por header `x-api-key`.

**Patrón:** API REST + webhook entrante.

**1) Comando para enviar SMS** (nuevo `cmds/utils/sms.js`):

```js
import fetch from 'node-fetch'

export default {
  command: ['sms'],
  category: 'utils',
  description: 'Enviar SMS desde el teléfono vinculado (httpSMS).',
  isOwner: true, // solo el dueño del bot
  run: async ({ msg, args, usedPrefix }) => {
    if (args.length < 2) return msg.reply(`《✧》 Uso: *${usedPrefix}sms* <numero> <texto>`)
    const res = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST',
      headers: { 'x-api-key': process.env.HTTPSMS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: args.slice(1).join(' '), from: process.env.HTTPSMS_PHONE, to: args[0] })
    })
    const j = await res.json()
    await msg.reply(res.ok ? '《✧》 SMS enviado ✔' : `《✧》 Error: ${JSON.stringify(j)}`)
  }
}
```

**2) Webhook para recibir SMS** (agregar a `server.js`):

```js
app.use(express.json()) // si no está ya

app.post('/httpsms', (req, res) => {
  res.status(200).send('OK')
  try {
    const d = req.body?.data || req.body || {}
    const texto = d.content || ''
    const de = d.from || '?'
    if (texto && global.sock?.user) {
      const destino = (global.owner[0] || '') + '@s.whatsapp.net'
      global.sock.sendMessage(destino, { text: `📩 *SMS recibido*\nDe: ${de}\n\n${texto}` }).catch(() => {})
    }
  } catch {}
})
```

**3) Exponer tu puerto con HTTPS** (los webhooks de httpSMS necesitan URL pública):
`cloudflared tunnel --url http://localhost:3000` y registrar esa URL en la app httpSMS.

### 4.2 `android-sms-gateway` (SMS Gateway for Android) — alternativa self-hosted

Misma idea que httpSMS pero con tu propio backend: instalas la app **"SMS Gateway for Android"** (sms-gate.app) y configuras su webhook hacia tu servidor. El repo `bogkonstantin/android_income_sms_gateway_webhook` es justo ese backend receptor; puedes ignorarlo y recibir los POST directamente en `server.js`:

```js
app.post('/sms-gateway', (req, res) => {
  res.status(200).send('OK')
  // El app envía JSON: { phone, message, ... }
  const { phone, message } = req.body || {}
  if (message && global.sock?.user) {
    global.sock.sendMessage((global.owner[0] || '') + '@s.whatsapp.net',
      { text: `📩 *SMS de ${phone || '?'}*\n\n${message}` }).catch(() => {})
  }
})
```

### 4.3 `free-otp-api` — ❌ no lo integres

Ese proyecto recolecta números virtuales de pasarelas públicas para recibir OTPs de **cuentas de terceros**. Esos números no son tuyos, y usarlos para crear/verificar cuentas es fraude de identidad/abuso de servicio en casi cualquier país (y te cierran el VPS). **Para tus propias verificaciones usa 4.1 o 4.2 con tu propio SIM**, que es legal y no depende de nadie.

---

## 5 · `revanced-patches` — ojo: esto NO va dentro de un bot

ReVanced es un catálogo de *patches* para modificar APKs de Android (quitar anuncios, desbloquear funciones). No tiene nada que ver con WhatsApp/Baileys: **no se puede "instalar" dentro de tu bot**.

La única relación posible (proyecto aparte, pesado): montar `revanced-cli` + Java en el VPS y hacer un comando `.patchapk` que genere APKs parcheados y los mande por WhatsApp. Si te interesa, se hace como proceso externo (patrón 1), pero es un mini-proyecto en sí mismo y parchear apps de terceros viola sus términos.

---

## 6 · Plan recomendado (en orden)

| # | Integración | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | **yt-dlp** (plugin ya listo) | 10 min | Alto — reemplaza APIs públicas que se caen |
| 2 | **TikTok API local** (Docker) | 30 min | Alto — tu `.tiktok` deja de depender de tikwm |
| 3 | **httpSMS** (tu propio SIM) | 20 min | Medio — SMS/OTP propios, legal |
| 4 | **Instagram vía instagrapi-rest** | 1 h | Medio — respaldo cuando fallen los scrapers |
| 5 | Revanced CLI (opcional) | proyecto aparte | Bajo para el bot |

---

## 7 · Checklist de seguridad y hosting

- [ ] Claves/tokens SOLO en `.env` (nunca commits a GitHub).
- [ ] Cuentas desechables para Instagram/TikTok; jamás la cuenta personal ni el número del bot.
- [ ] Límites de tamaño respetados (WhatsApp: video directo ≤16 MB, documento ≤100 MB).
- [ ] Webhooks expuestos solo con HTTPS y, si puedes, con un token/secreto en la URL.
- [ ] El VPS necesita **ffmpeg**, Python 3 (para yt-dlp), y espacio en disco para las descargas.
- [ ] Recuerda que usar APIs privadas va contra los términos de esas plataformas: riesgo de ban de la cuenta, no del número de WhatsApp del bot.
