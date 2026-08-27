# Selector nativo de `.menu`

`.menu` intenta enviar un selector `single_select` con `interactiveMessage.nativeFlowMessage` y conserva `media/menu.jpg` como imagen del encabezado. `.menumanual` mantiene la ruta de texto/imagen para clientes incompatibles o si falla el relay.

Este documento es un **plan de prueba**, no un resultado. No se debe hacer merge a `main` hasta completar los seis puntos y conservar sus logs/capturas.

## Checklist obligatorio para aceptar el merge

La prueba real debe ejecutarse en este orden exacto:

| # | Punto | Qué se debe comprobar | Evidencia mínima |
|---:|---|---|---|
| 1 | **Visualización del banner** | Enviar `.menu` y confirmar que el mensaje nativo muestra el selector junto con `media/menu.jpg`. | Captura del mensaje recibido. |
| 2 | **Compatibilidad del wrapper `viewOnceMessage`** | Con la configuración normal, sin cambiar la variable, comprobar que el selector se muestra y se puede abrir. Esta es la ruta predeterminada. | Captura y salida de consola de esa ejecución. |
| 3 | **Prueba con `GINKO_NATIVE_MENU_VIEW_ONCE=0`** | Detener y reiniciar el bot con el wrapper desactivado; repetir `.menu` y comparar selector, banner y apertura. | Comando utilizado, logs y captura comparativa. |
| 4 | **Callback de cada fila** | Tocar las 12 filas y confirmar que cada una abre su categoría correcta, usando el render normal de `.menu <categoría>` y sin ejecutar un comando arbitrario. | Captura o video de las filas y respuesta; anotar cualquier fila fallida. |
| 5 | **Clientes incompatibles y fallback** | Comprobar el fallback cuando falla la preparación/serialización/relay. Si se dispone de un cliente que no renderiza nativeFlow, comprobar también ese caso. | Log `[NATIVE MENU FALLBACK]` y captura del menú manual. Si no hay un cliente incompatible, marcar este subcaso como `PENDIENTE`, no como aprobado. |
| 6 | **Fallback explícito a `.menumanual`** | Enviar `.menumanual` directamente y confirmar que siempre entrega el banner y el menú completo en texto/imagen. | Captura del resultado y log de consola sin error. |

### Correspondencia de las filas

La prueba del punto 4 debe cubrir todas estas filas:

| Fila visible | Categoría esperada |
|---|---|
| Descargas | `downloads` |
| Economía | `economia` |
| Entretenimiento | `fun` |
| Gacha | `gacha` |
| Principal | `main` |
| Grupos | `grupo` |
| Anime | `anime` |
| NSFW | `nsfw` |
| Perfiles | `profile` |
| Sockets | `sockets` |
| Stickers | `stickers` |
| Utilidades | `utils` |

## Requisitos

- Node.js **22.5 o superior** (el proyecto usa `node:sqlite`).
- Dependencias instaladas con `npm install`.
- Una sesión de WhatsApp de prueba; no usar la cuenta principal para la primera prueba.

## Verificación estática previa

Desde la raíz del repositorio:

```sh
node --version                 # debe ser v22.5.0 o superior
npm install
npm run test:native-menu
node --check core/lib/native-menu.js
node --check core/lib/interactive-response.js
node --check cmds/main/help.js
```

La prueba estática verifica las filas, el JSON de `single_select`, el wrapper `viewOnceMessage`, la ruta directa sin wrapper y la lectura de `nativeFlowResponseMessage.paramsJson`. Esto no sustituye la prueba en WhatsApp.

## Ejecución de los puntos 1 y 2

Arrancar el bot normalmente:

```sh
npm start
```

Sin modificar `GINKO_NATIVE_MENU_VIEW_ONCE`, enviar `.menu` en un chat privado de prueba. Después repetir en un grupo donde el bot pueda responder.

En la consola no debería aparecer:

```text
[NATIVE MENU RESPONSE ERROR]
```

Si el relay o la preparación fallan, debe aparecer `[NATIVE MENU FALLBACK]` y el bot debe enviar el menú manual con la imagen.

## Ejecución del punto 3

Detener el bot y arrancarlo con la ruta directa de WaSocket:

```sh
GINKO_NATIVE_MENU_VIEW_ONCE=0 npm start
```

Repetir `.menu` en el mismo chat y anotar:

| Configuración | Selector visible | Banner visible | Fila abre categoría | Resultado |
|---|---:|---:|---:|---|
| Variable no definida o valor normal |  |  |  |  |
| `GINKO_NATIVE_MENU_VIEW_ONCE=0` |  |  |  |  |

La variable solo cambia el contenedor del mensaje; la estructura `interactiveMessage.nativeFlowMessage` y el botón `single_select` se mantienen.

## Aclaración importante sobre clientes incompatibles

Hay dos fallos diferentes:

1. **Fallo conocido del bot:** preparación multimedia, serialización o `relayMessage` fallan. El código puede detectarlo y continuar automáticamente por la ruta manual; debe quedar el log `[NATIVE MENU FALLBACK]`.
2. **Cliente que recibe el mensaje pero no dibuja el selector:** WhatsApp puede no informar al bot de ese problema. En ese caso no es posible garantizar una detección automática desde el servidor; el mensaje orienta a usar `.menumanual` y el usuario debe ejecutarlo.

No se debe romper la instalación principal para provocar un fallo. Si no hay un segundo cliente incompatible disponible, el punto 5 debe quedar anotado como pendiente parcial.

## Criterio de cierre

Solo se puede evaluar el merge cuando estén guardados los logs y capturas de los seis puntos. Si falla una fila, el banner, cualquiera de las dos variantes del wrapper o el fallback, no se debe mergear a `main`; primero se documenta el fallo y se corrige en `feat/native-menu`.
