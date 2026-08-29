// ════════════════════════════════════════════════════════════════════
//  agent/provider.js — Proveedor de LLM del agente Ginko (OpenRouter)
//
//  Usa la API compatible con OpenAI (Chat Completions + function-calling),
//  apuntando a OpenRouter (baseURL https://openrouter.ai/api/v1). Recomendado
//  por su estabilidad frente a los 429 (a diferencia de Groq, que limita en
//  tokens/minuto). Los modelos `:free` evitan el cobro por token.
//
//  Se envuelve con `apiBreaker` para que, si OpenRouter se cae/rate-limite,
//  el agente se pause amablemente en vez de spamear errores.
//
//  DEGRADACIÓN: si no hay OPENROUTER_API_KEY o modelo, `isAvailable()` da
//  false y `chat()` lanza un UserError claro. El resto del bot sigue vivo.
// ════════════════════════════════════════════════════════════════════

import { runGuarded } from '#lib/apiBreaker';
import { userError } from '#lib/errors';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = process.env.GINKO_AI_MODEL || 'openai/gpt-oss-120b';

export function getConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GINKO_AI_KEY || '';
  const model = process.env.GINKO_AI_MODEL || MODEL;
  return { apiKey, model, baseUrl: process.env.GINKO_AI_BASE_URL || BASE_URL };
}

// ¿Está listo para hablar con la IA? (key + modelo presentes)
export function isAvailable() {
  const { apiKey, model } = getConfig();
  return Boolean(apiKey && model);
}

// Aviso de "modo manual" (sin IA) para mostrar al usuario.
export function notAvailableMessage() {
  return [
    '> 🌸 *Ginko* está en *modo manual* (sin IA).',
    '> Añade una key de OpenRouter para activar el agente:',
    '>  `OPENROUTER_API_KEY=sk-...  GINKO_AI_MODEL=openai/gpt-oss-120b`',
    '> en tu `.env` y reinicia. (Gratis: openrouter.ai/keys)',
  ].join('\n');
}

function normalizeToolCalls(message = {}) {
  const calls = message?.tool_calls || [];
  return calls.map((c) => ({
    id: c?.id || '',
    type: c?.type || 'function',
    name: c?.function?.name || '',
    arguments: c?.function?.arguments || '{}',
  }));
}

// Llama al modelo. Devuelve el mensaje del asistente: { content, tool_calls }.
// Lanza UserError (despachador lo muestra tal cual) o deja propagar el error técnico.
export async function chat({ messages = [], tools = [], temperature = 0.4, maxTokens = 1200 } = {}) {
  const { apiKey, model, baseUrl } = getConfig();
  if (!apiKey) throw userError(notAvailableMessage());
  if (!model) throw userError('> Falta *GINKO_AI_MODEL* en tu `.env`. El agente no puede activarse.');

  // Exportamos la función interna para poder probarla con un stub.
  return guardedChat({ apiKey, model, baseUrl, messages, tools, temperature, maxTokens });
}

// Función interna (sobrescribible en tests con mock).
export async function guardedChat(cfg) {
  const { apiKey, model, baseUrl, messages, tools, temperature, maxTokens } = cfg;
  function doCall() {
    return callOpenRouter({ apiKey, model, baseUrl, messages, tools, temperature, maxTokens });
  }
  return runGuarded('ai', doCall);
}

async function callOpenRouter({ apiKey, model, baseUrl, messages, tools, temperature, maxTokens }) {
  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length) payload.tools = tools;
  if (tools && tools.length) payload.tool_choice = 'auto';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/riokuroxi-svg/Ginko-MD',
      'X-Title': 'Ginko-MD',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message || {};
  return {
    content: message?.content || '',
    tool_calls: normalizeToolCalls(message),
    finish_reason: data?.choices?.[0]?.finish_reason || 'stop',
    usage: data?.usage || null,
    raw: data,
  };
}

export default { chat, isAvailable, getConfig, notAvailableMessage };
