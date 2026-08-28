# Ginko Blocks

Plan de trabajo por bloques. La regla es terminar, probar y cerrar un bloque antes de pasar al siguiente.

## Estado general

- [x] Bloque 0 — Estabilización del entorno, reglas y README
- [ ] Bloque 1/11 — Health/stats owner
- [ ] Bloque 2/11 — Cache manager
- [ ] Bloque 3/11 — Manejo limpio de errores
- [ ] Bloque 4/11 — Protección contra saturación
- [ ] Bloque 5/11 — Optimización extra de `.play`
- [ ] Bloque 6/11 — Backup/restore para Termux
- [ ] Bloque 7/11 — Auditoría de dependencias
- [ ] Bloque 8/11 — Limpieza de comandos muertos o duplicados
- [ ] Bloque 9/11 — UX, mensajes y menú
- [ ] Bloque 10/11 — Velocidad de arranque
- [ ] Bloque 11/11 — Auditoría final y migración limpia

## Regla de enfoque

Si aparece una idea que pertenece a otro bloque, se anota aquí o en urgencias, pero no se mezcla con el bloque actual salvo que sea una emergencia real.

## Bloque 1/11 — Health/stats owner

Objetivo futuro: crear un comando solo owner para revisar salud del bot sin ensuciar consola.

Debe mostrar, como mínimo:

- uptime,
- uso de RAM,
- versión de Node,
- disponibilidad de `yt-dlp`,
- disponibilidad de `ffmpeg`,
- tamaño de cache,
- descargas activas si aplica.

Estado: pendiente.
