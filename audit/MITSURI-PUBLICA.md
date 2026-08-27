# Investigación pública de Mitsuri Bot

**Fecha de consulta:** 26 de agosto de 2026, hora local de México (algunas respuestas HTTP llevan fecha UTC del 27 de agosto).

## Alcance

Revisión pasiva de páginas públicas, JSON público, cabeceras HTTP y repositorios públicos enlazados. No se solicitó ningún código de vinculación, no se hizo POST a la API de subbots y no se intentó acceder a sesiones, paneles o datos privados.

## Sitio desplegado

- Página principal: <https://mitsuri-bot.brayanrk.info/>
- Comandos: <https://mitsuri-bot.brayanrk.info/comandos.html>
- Economía: <https://mitsuri-bot.brayanrk.info/economia.html>
- Estado: <https://mitsuri-bot.brayanrk.info/stats.html>
- Vincular Subbot: <https://mitsuri-bot.brayanrk.info/obtener-subbot.html>

La página principal presenta a Mitsuri como infraestructura de subbots de WhatsApp con sesiones aisladas, panel de estado y vinculación por código. El pie enlaza al GitHub de `BrayanRK`, al canal de WhatsApp y al soporte `wa.me/573223090406`.

Las cabeceras observadas en las páginas/API fueron `nginx/1.24.0 (Ubuntu)` y `X-Powered-By: Express`. Esto solo identifica la capa pública; no implica acceso al servidor.

## Contratos públicos observados

### Lista de comandos

`GET /data/comandos.json` respondió correctamente y contiene **216 comandos en 11 categorías**:

| Categoría | Comandos |
|---|---:|
| Ai | 3 |
| Descargas | 28 |
| Entretenimiento | 60 |
| General | 9 |
| Grupos | 16 |
| Hacking | 8 |
| Herramientas | 25 |
| Juegos | 13 |
| Nsfw | 41 |
| Owner | 10 |
| Sistema | 3 |

La descripción pública de `.menu` dice «Menú interactivo con imagen y selector». También aparecen comandos con selectores/botones como `.apk2`, `.stickerly`, `.ttsearch`, `.ytsearch` y `.menu2`. El JSON sirve como catálogo público, pero no revela la serialización interna de WhatsApp.

### Estado

`GET /api/stats` expone métricas de operación para el dashboard. En la consulta de esta auditoría devolvió aproximadamente:

```json
{"ok":true,"subbotsActivos":7,"subbotsPremium":3,"subbotsFree":4,"subbotsMax":20,"uptimeSeconds":108172,"ramTotalMb":2786}
```

Son valores volátiles, no una garantía histórica.

### Vinculación de subbots

El JavaScript público de `obtener-subbot.html` muestra estos contratos:

- `POST /api/subbot/solicitar` con JSON `{ "numero": "..." }` para pedir un código.
- `GET /api/subbot/estado/:numero` para consultar si la sesión fue encontrada, está conectando o ya conectó.

La auditoría únicamente consultó el estado de un número de prueba no encontrado y **no ejecutó** el POST que genera códigos.

## Repositorios públicos relacionados

- <https://github.com/BrayanRK/BASE-PRESTADA-XD> — repositorio público no marcado como fork, principalmente TypeScript, con `dist/` y `ts/`; su `package.json` declara Baileys `7.0.0-rc10` y `sqlite3`. El `dist/bot/commands/owners/main-menu.js` inspeccionado genera un menú textual dinámico y usa medios de menú, pero no expone en ese archivo la serialización nativeFlow del sitio desplegado.
- <https://github.com/BrayanRK/Draven_Hack> — bot JavaScript centrado en recuperación de mensajes “ver una sola vez”, con Baileys 7.x.
- <https://github.com/BrayanRK/Mi_bot_personal-> — bot JavaScript con menú por carpetas y banner local.
- <https://github.com/BrayanRK/ALEPANDA-BOT> — fork público de `ALEPANDITA/ALEPANDA-BOT`, orientado a Termux, con menú textual e imagen.

No se encontró un repositorio público que demostrara el código exacto del selector nativo usado por el despliegue de Mitsuri. Por eso la implementación de Lab2experimental se mantiene local y no copia código de terceros.

## Referencia de compatibilidad del wrapper

La nota de lanzamiento de Evolution API 2.4.0-rc1 (6 de mayo de 2026) reporta que algunas rutas corrigieron botones quitando `viewOnceMessage` e inyectando nodos mediante `additionalNodes`: <https://newreleases.io/project/github/evolution-foundation/evolution-api/release/2.4.0-rc1>. Es una señal de compatibilidad de otra implementación, no una prueba sobre WaSocket.

## Conclusión útil para Lab2experimental

La evidencia pública confirma la expectativa de un menú con imagen y selector, pero no permite asumir que el wrapper `viewOnceMessage` sea universal. La implementación local conserva ambas pruebas (`viewOnceMessage` por defecto y ruta directa mediante `GINKO_NATIVE_MENU_VIEW_ONCE=0`), añade `.menumanual` como fallback y requiere validación con un cliente real antes de fusionar a `main`.
