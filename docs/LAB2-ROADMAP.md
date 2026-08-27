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

- Probar imagen + botones nativos.
- Probar botón URL a Instagram real.
- Probar botón copiar.
- Probar link preview con miniatura propia.
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
