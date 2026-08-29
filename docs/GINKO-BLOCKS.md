# Ginko Blocks

Plan oficial de trabajo por bloques. La regla es terminar, probar y cerrar un punto antes de avanzar al siguiente.

## Estado general

- [x] Bloque 0 — Estabilización del entorno, reglas y README

## Bloque A — Resiliencia liviana (sin costo de rendimiento)

- [x] 1. Fijar versión exacta de Baileys/WaSocket en `package.json`.
- [x] 2. Auditar y decidir destino de comandos muertos: arreglar, hacer local o eliminar.
- [x] 3. `.health` / `.statsbot`: RAM, uptime, errores recientes, estado `yt-dlp`/`ffmpeg`.
- [x] 4. Separar errores de usuario vs. errores técnicos internos.

## Bloque B — Cache y saturación

- [x] 5. `.cache` / `.cache clear` con límites de espacio.
- [x] 6. Límite de concurrencia en comandos pesados: imágenes, stickers, APIs lentas y descargas.
- [x] 7. Circuit breaker simple para APIs externas que fallen repetidamente.

## Bloque C — Disciplina de repos

- [x] 8. Formalizar regla: `Ginko-MD` solo recibe cambios probados; experimentos se quedan en `Lab2experimental`.
- [x] 9. Auditoría de dependencias sin `npm audit fix --force` a ciegas.

## Bloque D — Continuidad

- [ ] 10. Backup/restore de sesión, base de datos y configs privadas para cuando Termux falle.

## Bloque E — Calidad

- [ ] 11. Tests automáticos ampliados para comandos críticos: `.play`, `.mp3`, `.ytsearch`, menú, botones, permisos.
- [ ] 12. Pulir mensajes de error y UX general.
- [ ] 13. Revisar tiempo de arranque del bot: imports pesados y cargas innecesarias.

## Bloque F — Opcional, solo si algún día hace falta

- [ ] 14. Copia local `vendor/` del fork de Baileys como respaldo.
- [ ] 15. Evaluar mover más procesamiento a local en vez de APIs externas, caso por caso.

## Bloque G — Gobernanza del repo

- [ ] 16. Confirmar/definir licencia y enlazarla claramente en README.
- [ ] 17. Crear `CHANGELOG.md` con historial real de cambios.

## Regla de enfoque

Si aparece una idea que pertenece a otro bloque, se anota aquí o en `docs/GINKO-URGENT-FIXES.md`, pero no se mezcla con el punto actual salvo que sea una emergencia real.

## Punto actual

Bloques A y B completados en Lab2 — pendiente de **prueba en Termux** y visto bueno del usuario antes de migrar a `Ginko-MD`.

> Detalles: `docs/LAB2-BLOQUE-A-STATUS.md` (A) y `docs/LAB2-BLOQUE-B-STATUS.md` (B).
