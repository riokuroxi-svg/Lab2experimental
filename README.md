<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=13,21,27,30&text=🧪%20LAB%20EXPERIMENTAL%20v2%20⚡&fontSize=46&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Descargas%20instant%C3%A1neas%20con%20yt-dlp%20local%20+%20optimizaciones%20de%20velocidad&descSize=16&descAlignY=60" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=26&duration=2800&pause=600&color=60A5FA&center=true&vCenter=true&width=640&lines=🧪+Zona+de+experimentos+🧪;🚧+NO+usar+en+producción;🌿+Todo+lo+nuevo+se+prueba+antes;✅+Se+fusiona+al+estable+al+funcionar" alt="Typing SVG"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&duration=3200&pause=800&color=FBBF24&center=true&vCenter=true&width=640&lines=⚗️+Comandos+nuevos+en+prueba;🐛+Arreglos+y+revisiones;🏷️+Checkpoints+con+git+tag" alt="Typing SVG"/>

<br/>

<img src="https://img.shields.io/badge/Status-Laboratorio-FBBF24?style=for-the-badge"/>
<img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-22.5%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
<img src="https://img.shields.io/badge/Baileys-Multi%20Device-25D366?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Inestable-Pruebas-F87171?style=for-the-badge"/>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

</div>

## 🧭 Estado del repositorio y reglas de trabajo

**Rol:** `LABORATORIO ACTIVO / EXPERIMENTAL` — zona para experimentar fuerte, medir y descartar.

**Estado actual:** Banco de pruebas activo para mejoras de rendimiento, salud y UX.

**Reglas:**

- Aquí nacen las ideas nuevas.
- Todo se hace por bloques pequeños.
- Cada bloque debe probarse antes de continuar.
- Se permite experimentar, pero no dejar basura si falla.
- Solo lo útil, limpio y probado puede migrar a Ginko-MD o Ginko-MD-Lab.

Documentos de control:

- [`docs/GINKO-WORKFLOW.md`](docs/GINKO-WORKFLOW.md)
- [`docs/GINKO-BLOCKS.md`](docs/GINKO-BLOCKS.md)
- [`docs/GINKO-URGENT-FIXES.md`](docs/GINKO-URGENT-FIXES.md)

> Regla central: laboratorio primero, estable después. Nada de arrastrar experimentos completos.

## 🧪 ¿Qué es Lab2experimental?

<p align="center">
  <img src="https://raw.githubusercontent.com/riokuroxi-svg/Ginko-MD-Lab/main/media/menu.jpg" alt="Menú de prueba (Bocchi)" width="620"/>
</p>

> ⚗️ **Lab2experimental** es el laboratorio activo de Ginko-MD. Aquí se prueban ideas nuevas, mediciones y cambios delicados antes de decidir si pasan al laboratorio intermedio o al repositorio estable.
>
> Si buscas la versión lista para usar, ve al repositorio principal 👇

<p align="center">
  <a href="https://github.com/riokuroxi-svg/Ginko-MD">
    <img src="https://img.shields.io/badge/🌿%20Ir%20al%20repo%20ESTABLE%20(Ginko--MD)-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
  </a>
</p>

### 📌 ¿Para quién es este repo?

| ✅ Sí usa Lab | ❌ No usa Lab |
|:---|:---|
| Quieres probar las funciones más nuevas | Quieres algo que no se rompa |
| Te gusta ayudar a reportar bugs | No quieres lidiar con errores |
| Quieres aportar ideas/código | Es tu primera vez instalando el bot |

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## 🧬 Cambios en esta versión (Lab2experimental)

> 🚀 Lo nuevo de esta rama de laboratorio:

| Cambio | Detalle |
|:---|:---|
| ⚡ **`.play` USA YT-DLP AUTOMÁTICAMENTE** | Si tienes yt-dlp instalado, `.play` y `.mp3` descargan **directamente desde tu celular** (8 conexiones en paralelo, sin APIs lentas de terceros). Las canciones se envían CASI INSTANTÁNEAMENTE, igual que los bots más rápidos. Si no tienes yt-dlp, hace fallback automático a la API de siempre. |
| ⚡ **Comando `.ytdlp` dedicado** | Motor de descargas **local con yt-dlp** (compatible con +1000 sitios). Modos: `video` (720p), `audio` (m4a nativo turbo, sin conversión), `mp3` (320k) y `fast` (ligero). Caché de 24 h, bypass del throttling de YouTube y 8 fragmentos en paralelo. |
| 🔄 **Auto-update integrado** | El bot actualiza yt-dlp solo cada 24 h (canal *nightly*, fixes diarios de YouTube). Con `YTDLP_PLUGIN_URL` en `.env`, el plugin también se auto-reemplaza desde el repo. **Cero mantenimiento.** |
| 🚀 **Optimizaciones generales de velocidad** | Metadata de YouTube por oEmbed en 60ms (antes 2-3s), personajes de gacha en caché de memoria, imágenes de waifu buscadas en paralelo, banner del menú cacheado en RAM, fetch nativo de Node con keep-alive, reacciones inmediatas al recibir comandos. |
| 🛡️ **Requisito de Node corregido** | `engines` actualizado a **Node ≥ 22.5** (el bot usa `node:sqlite`; con Node 20 crashea al arrancar). |
| 🌸 **Selector nativo de `.menu`** | `.menu` usa `interactiveMessage.nativeFlowMessage` con `single_select`, banner local y fallback automático; `.menumanual` conserva el menú completo en texto/imagen. |
| 🧰 **Extras** | `.env.example` extendido, carpeta `docs/` con guías. |

### ⚡ Uso rápido

```
.menu                                  → selector nativo de categorías
.menumanual                            → menú completo con texto/imagen
.ytdlp https://youtu.be/xxxx          → video 720p
.ytdlp https://youtu.be/xxxx audio    → canción m4a turbo ⚡
.ytdlp https://youtu.be/xxxx mp3      → mp3 320k
.ytdlp https://youtu.be/xxxx fast     → m4a ligero
```

**Requisitos del host:** Node ≥ 22.5 · `pip install -U --pre "yt-dlp[default]"` · `apt install ffmpeg` (solo para el modo mp3).

> 📚 Detalles completos en [`docs/YTDLP-INSTALACION.md`](docs/YTDLP-INSTALACION.md), [`docs/GUIA-INTEGRACION.md`](docs/GUIA-INTEGRACION.md) y [`docs/NATIVE-MENU-TERMUX.md`](docs/NATIVE-MENU-TERMUX.md).

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## 📦 Instalación en Termux (Lab2experimental ⚡)

Para tener las descargas instantáneas necesitas instalar yt-dlp (es un solo comando):

```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs python ffmpeg
pip install -U yt-dlp
git clone https://github.com/riokuroxi-svg/Lab2experimental
cd Lab2experimental
npm install
npm start
```

Si no instalas yt-dlp, el bot funciona igual pero las descargas usan la API (más lento).

Escanea el QR y listo. Eso sí: **puede romperse en cualquier momento** mientras esté en pruebas.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## 🏷️ Tags de checkpoint (versiones)

Cada cambio importante tiene un tag para poder volver atrás si algo se rompe:

```bash
# Ver todos los tags
git tag

# Volver a una versión anterior (ejemplo: v1.19, que fue la que funcionó el menú)
git reset --hard v1.19
```

### 📜 Historial reciente

| Tag | Estado |
|:---|:---|
| `v2.0-menu-bocchi-tts-bloques1-4` | Menú con imagen (Bocchi) + botón canal + TTS Dalia + bloques 1-4 ✅ |
| `v1.25` | v1.19 + quitado enlace repetido de canal del texto ✅ |
| `v1.19` | Menú con imagen + botón "Ver canal" **(funcional comprobado)** ✅ |
| `v1.20` – `v1.24` | Intentos con externalAdReply (tarjeta/linkPreview) — **fallaron, descartados** ❌ |
| `v1.18` | Antes de botones nativos del menú |

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## ⚙️ ¿Qué se está probando aquí?

Lo que ya funciona y está en camino al repo estable:

| 🧪 Función | Estado |
|:---|:---|
| 🖼️ Menú con imagen (Bocchi) + botón nativo de canal | ✅ Listo (ya en estable) |
| 🔊 TTS con voz femenina Dalia (Edge-TTS) como PTT | ✅ Listo (ya en estable) |
| 🧠 IA Gemini con memoria por chat + imágenes | ✅ Listo (ya en estable) |
| 📊 Encuestas nativas `.encuesta` | ✅ Listo (ya en estable) |
| 🎌 `.anime` con AniList | ✅ Listo (ya en estable) |
| 🔗 `.qrcode`, `.acortar`, `.morse`, `.recordar`, `.wastalk` | ✅ Listo (ya en estable) |
| 😄 Comandos de diversión (chiste, 8ball, ship, dado...) | ✅ Listo (ya en estable) |
| 🎵 `.letra`, `.deezer`, `.btc`, `.carbon`, `.gh` | ✅ Listo (ya en estable) |
| 🎙️ Efectos de voz con ffmpeg nativo (robot, eco, veloz) | 🚧 Planeado |
| 🎨 Más comandos de stickers | 🚧 Planeado |

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## 🔄 Flujo de trabajo

```
1. Idea o bug nuevo
   ↓
2. Se prueba AQUÍ (Ginko-MD-Lab) con tags de checkpoint
   ↓
3. Se verifica en Termux real (sin errores de envío, sin crashes)
   ↓
4. El usuario confirma que funciona
   ↓
5. Se fusiona al repo ESTABLE (Ginko-MD) 🚀
```

### ⚠️ Reglas importantes del Lab

- 🚫 **Nada se pasa al estable sin confirmación** del usuario después de probar en Termux real.
- 🏷️ Siempre se crea un **tag `vX.Y`** antes de un cambio grande, para poder volver atrás (`git reset --hard <tag>`).
- 📱 **ffmpeg-static NO funciona** en Termux/Android: se usa el ffmpeg NATIVO de Termux (`pkg install ffmpeg`).
- 📛 El menú con `externalAdReply`/`linkPreview` está **descartado** por ahora: causaba que WhatsApp rechazara el mensaje silenciosamente en Termux.
- 🔑 El token de GitHub que se usa para push es temporal, se revoca al finalizar la sesión.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## 📣 Enlaces

<p align="center">
  <a href="https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522">
    <img src="https://img.shields.io/badge/📣%20Canal%20de%20WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
  </a>
  <a href="https://www.instagram.com/__ikg.05">
    <img src="https://img.shields.io/badge/📸%20Instagram%20del%20creador-E4405F?style=for-the-badge&logo=instagram&logoColor=white"/>
  </a>
  <a href="https://github.com/riokuroxi-svg/Ginko-MD">
    <img src="https://img.shields.io/badge/🌿%20Repo%20ESTABLE-181717?style=for-the-badge&logo=github&logoColor=white"/>
  </a>
  <a href="https://github.com/riokuroxi-svg/Lab2experimental">
    <img src="https://img.shields.io/badge/⚡%20Este%20repo%20(Lab2%20experimental)-181717?style=for-the-badge&logo=github&logoColor=white"/>
  </a>
</p>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a139a6edaec5c.gif" width="100%"/>

## ⭐ Créditos

- 🌿 **Creador:** [riokuroxi-svg](https://github.com/riokuroxi-svg) 🇲🇽
- 🤖 **Librería:** [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- 🧠 **IA:** Google Gemini
- 🔊 **TTS:** Microsoft Edge-TTS
- 🎨 **Inspiración del README:** [La Suki Bot](https://github.com/russellxz/LASUKIBOT)

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=22&duration=3000&pause=800&color=60A5FA&center=true&vCenter=true&width=640&lines=🧪+GINKO-MD+LAB+🧪;Todo%20lo%20nuevo+se+prueba+aqu%C3%AD;primero+antes+de+salir+al+estable+%F0%9F%9A%80" alt="Typing SVG"/>

<br/>

<a href="https://github.com/riokuroxi-svg/Ginko-MD-Lab/stargazers">
  <img src="https://img.shields.io/github/stars/riokuroxi-svg/Ginko-MD-Lab?style=social"/>
</a>
<a href="https://github.com/riokuroxi-svg/Ginko-MD-Lab/forks">
  <img src="https://img.shields.io/github/forks/riokuroxi-svg/Ginko-MD-Lab?style=social"/>
</a>

<img src="https://capsule-render.vercel.app/api?type=waving&height=140&color=gradient&customColorList=13,21,27,30&section=footer" width="100%"/>

</div>
