# Lab2experimental — Roadmap de pruebas por bloques

Regla de trabajo:

- `Lab2experimental` es el campo de pruebas principal.
- `Ginko-MD` estable no se toca hasta que una función esté probada.
- Cada bloque inicia con checkpoint.
- Si el bloque falla, se revierte completo al checkpoint.
- Evitar parches acumulados: corregir de raíz o retirar el bloque.

## Checkpoint actual

Antes del Bloque 1 se creó un checkpoint Git con prefijo:

```text
checkpoint/lab2-before-rich-block1-*
```

Para volver a ese estado, usar el tag más reciente de ese prefijo.

## Bloque 1 — Rich UI demo

Estado: en pruebas.

Comando agregado:

```text
.richdemo
.richui
```

Modos:

```text
.richdemo botones
.richdemo ig
.richdemo preview
.richdemo ad
.richdemo table
.richdemo ai
.richdemo all
```

Objetivo:

- Probar URL en texto + vista previa estándar de WhatsApp.
- Forzar link preview con `getUrlInfo` de Baileys/WaSocket cuando sea posible.
- Evitar `interactiveMessage/viewOnceMessage` para links.
- Mantener botones solo como modo legacy/no recomendado.
- Probar externalAdReply con miniatura propia.
- Probar tabla/rich message si el socket lo soporta.
- Probar etiqueta `ai: true` solo en privado.

Criterio para pasar:

- No rompe arranque.
- No rompe menú nativo.
- No rompe minería/code.
- En WhatsApp real se ve bien en privado y/o grupo.
- Si una variante falla, debe caer a fallback o mostrar error controlado.

## Protegido

No tocar directamente sin bloque propio:

- `cmds/downloads/ytmp3.js`
- `core/lib/mp3Utils.js`
- flujo de canciones con portada/nombre de Ginko
- `main.js`
- `index.js`
- `Ginko-MD` estable


## Cambio de enfoque — Links

Para links/redes se prioriza:

```text
URL visible en el texto + link preview estándar de WhatsApp
```

No se priorizan botones `cta_url`/`quick_reply` para links, porque dependen de `interactiveMessage`/`viewOnceMessage` y pueden ser más frágiles si WhatsApp cambia algo.

Helper reutilizable:

```text
core/lib/rich-ui.js
- generateStandardLinkPreview()
- sendStandardLinkPreview()
- sendInstagramPreview()
```

Nota Lab2: cuando Instagram entregue solo favicon/data-uri o miniatura débil, `sendInstagramPreview()` puede usar `assets/link-preview-fallback.jpg` como respaldo. Ese respaldo debe ir también como `highQualityThumbnail` real subido con `prepareWAMessageMedia(..., { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' })`, no solo como bytes en `jpegThumbnail`.


Conclusión favicon Lab2: `link-preview-js` expone `favicons`, y forks como `@itsliaaa/baileys`/`@itsmelody/Baileys` documentan `favicon: { url }` convertido a `extendedTextMessage.faviconMMSMetadata`. Se probó replicar esa salida en WaSocket, incluso con favicon de OnlyFans, pero WhatsApp no lo renderizó en prueba real. Se elimina el código de favicon fallido para no dejar experimento inútil; Lab2 conserva solo el preview grande con imagen, que sí fue confirmado.

## Bloque 3 — BenchDL

Estado: primer bloque implementado para prueba real.

Comando agregado:

```text
.benchdl <url de YouTube> [fast|normal|mp3]
```

Objetivo:

- Medir tiempos sin tocar `.play`, `.mp3`, `cmds/downloads/ytmp3.js` ni `core/lib/mp3Utils.js`.
- Reportar versión de `yt-dlp`, metadata rápida por oEmbed, metadata por `yt-dlp`, descarga de audio y validez MP3.
- No enviar el archivo descargado; solo medir tamaño/tiempo para decidir el siguiente bloque.

## Bloque 4 — Optimización directa de `.play`

Estado: primer ajuste implementado para prueba real.

Objetivo:

- Retirar `.playfast`/`.playfats` para no mantener comandos experimentales que confundan.
- Trabajar directamente en `.play` y `.mp3` cuando el usuario ya aprobó ese enfoque.
- Mantener botones, portada y metadatos `Ginko Bot`.
- Evitar `yt-search`, que empezó a fallar con `_title2.trim is not a function`; Lab2 usa `core/lib/youtubeSearch.js`.
- Evitar que `.play` bloquee la descarga actualizando `yt-dlp` antes de cada audio; la actualización ahora se dispara en segundo plano como tarea no bloqueante.
