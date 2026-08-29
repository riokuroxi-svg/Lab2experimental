# 🧠 Bloque C — Agente IA "Ginko" (experimental, solo Lab2)

**Fecha:** 2026-08-28 · **Commits:** `5c3e37a` + checkpoint `checkpoint/lab2-agent-ginko-20260828`

## Qué es
Un **agente autónomo** que puedes invocar con `.ginko` (también `.agente` / `.ai`).
A diferencia de Ruby-Hoshino, **NO depende de LangChain**: lo hice a mano (más
ligero y con control total). Usa **OpenRouter** (modelos `:free`) con
**function-calling tipado**, memoria por chat, y reutiliza **nuestra infra**:
`apiBreaker` (rate-limit/caída de la API) y `errors.js`.

## Cómo se activa
El agente **se activa solo si hay key**. Sin key funciona en "modo manual"
(explica cómo activarlo) — el bot sigue 100% vivo.
```
# En .env (NO se sube a GitHub):
OPENROUTER_API_KEY=sk-...          # gratis en https://openrouter.ai/keys
GINKO_AI_MODEL=openai/gpt-oss-120b
GINKO_MEMORY_WINDOW=10
GINKO_MAX_ITERATIONS=8
```

## Arquitectura (`core/lib/agent/`)
| Archivo | Rol |
|---|---|
| `provider.js` | Cliente OpenRouter (Chat Completions + tools). Envuelto en `apiBreaker`. Degradación sin key. |
| `tools.js` | Herramientas "equilibradas". |
| `index.js` | Bucle agéntico + memoria por chat + límite de pasos + system prompt. |
| `cmds/ai/ginko.js` | Comando `.ginko` con subcomandos `reset`/`status`. |

## Tools (alcance equilibrado)
- **Todos** (lectura/diagnóstico/memoria): `list_dir` · `find_files` · `read_file` ·
  `grep_code` · `command_lookup` · `syntax_check` · `read_logs` · `health_check` ·
  `remember_fact` · `recall_memory` · `forget_fact`.
- **Solo DUEÑO** (destructivas): `write_file` · `execute_terminal` · `git_push` ·
  `run_bot_command` · `wa_send_message`.

## Uso en WhatsApp
```
.ginko ¿cómo uso el comando .cache?
.ginko revisa que image.js no tenga errores de sintaxis   (solo owner)
.ginko reset        → limpia la memoria de este chat
.ginko status       → ¿IA activa? ¿cuántas herramientas?
```

## Por qué "superior/equivalente" a Ruby
- **Sin LangChain** (menos deps, sin sus parches). El `provider.js` es directo.
- **`apiBreaker`** ya corto-circuita si OpenRouter se cae/rate-limita (Ruby sufría 429 y lo parcheaba).
- **`errors.js`** para errores usuario vs técnicos.
- **Degradación elegante** sin key (Ruby también lo hace).
- Memoria por chat + hechos.

## Verificación (en sandbox, sin red)
- Bucle con **LLM simulado** (`chatFn`): tool-calling + respuesta final → **OK**.
- Degradación sin key → **OK** (modo manual).
- Filtrado de tools destructivas por owner → **OK**.
- `node --check` del grafo completo (agente + comando) → **carga OK**.
- Sweep sintaxis Lab2 → **227 archivos, 0 errores**.

## Pendiente / siguientes bloques
- **Bloque A.2**: integrar cooldowns (`cooldowns.js`) al despachador (`main.js`).
- **Bloque B**: probar/adoptar los **endpoints de descarga** alternativos
  (twitter-siputzx, terabox, spotify) para reemplazar los muertos.
- **Nota**: el agente usa `execute_terminal`/`git_push`/`run_bot_command` SOLO para
  el owner; el resto son lecturas seguras. Si algo falla, hay checkpoint para revertir.

> ⚠️ El agente está en **Lab2** (experimental). Va al **estable solo tras tu visto bueno** en Termux.
