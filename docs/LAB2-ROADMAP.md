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
