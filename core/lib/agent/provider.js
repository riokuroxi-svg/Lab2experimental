// ════════════════════════════════════════════════════════════════════
//  agent/provider.js — Proveedor multi-IA del agente Ginko
//
//  Soporta (auto-detectado o por GINKO_AI_PROVIDER):
//   · gemini     → Google Gemini (reutiliza tu GEMINI_API_KEY / global.geminiKey).
//   · openrouter → API compatible con OpenAI vía OpenRouter (modelos :free). [DEFAULT]
//   · openai     → cualquier backend compatible con Chat Completions
//                  (OpenAI, Groq, etc.) usando GINKO_AI_BASE_URL + GINKO_AI_KEY.
//
//  Normaliza todo a una interfaz única para el bucle del agente:
//    chat({ system, messages, tools, temperature, maxTokens })
//      → { content, tool_calls: [{ id, name, arguments(str) }] }
//  donde `messages` son roles user|assistant|tool (sin system).
//
//  Envuelto en `apiBreaker` (corto-circuito si la API se cae/rate-limita) y con
//  degradación elegante: sin key → "modo manual".
// ════════════════════════════════════════════════════════════════════

import { runGuarded } from '#lib/apiBreaker';
import { userError } from '#lib/errors';
import { geminiGenerateContents, geminiText, geminiToolCalls } from '#lib/gemini';

function geminiKey() {
  return (
    global?.geminiKey ||
    global?.geminiRolKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_ROL_KEY ||
    ''
  );
}
function geminiModel() {
  return global?.geminiModel || global?.geminiRolModel || process.env.GEMINI_MODEL || 'gemini-flash-latest';
}

export function getConfig() {
  const provider =
    (process.env.GINKO_AI_PROVIDER || '').toLowerCase() ||
    (process.env.OPENROUTER_API_KEY || process.env.GINKO_AI_KEY ? 'openrouter' : (geminiKey() ? 'gemini' : 'none'));
  const cfg = {
    provider,
    model: process.env.GINKO_AI_MODEL || '',
    baseUrl: process.env.GINKO_AI_BASE_URL || 'https://openrouter.ai/api/v1',
  };
  if (provider === 'gemini') {
    cfg.apiKey = geminiKey();
    cfg.model = geminiModel();
  } else if (provider === 'openrouter' || provider === 'openai') {
    cfg.apiKey = process.env.OPENROUTER_API_KEY || process.env.GINKO_AI_KEY || '';
    cfg.model = cfg.model || 'openai/gpt-oss-120b';
  }
  return cfg;
}

export function isAvailable() {
  const c = getConfig();
  return c.provider !== 'none' && Boolean(c.apiKey && c.model);
}

export function notAvailableMessage() {
  return [
    '> 🌸 *Ginko* está en *modo manual* (sin IA).',
    '> Activalo eligiendo proveedor en tu `.env`:',
    '>  · `OPENROUTER_API_KEY=sk-...`  (OpenRouter, recomendado)',
    '>  · o `GEMINI_API_KEY=...`       (tu key de Google ya la tienes)',
    '> y reinicia el bot.',
  ].join('\n');
}

// Normaliza tool_calls a nuestro formato interno.
// Soporta: formato OpenAI (`function.arguments` en `message.tool_calls`) y el
// formato interno (`c.arguments`, como devuelve geminiToolCalls). Si el valor
// ya es un string NO se re-codifica (evita double-escape de los argumentos).
function normalizeToolCalls(tcs = []) {
  return tcs.map((c) => {
    const rawArgs = c?.function?.arguments ?? c?.arguments;
    const argumentsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {});
    return {
      id: c?.id || '',
      type: c?.type || 'function',
      name: c?.name || c?.function?.name || '',
      arguments: argumentsStr,
    };
  });
}

// ── Punto de entrada único ─────────────────────────────────────────
export async function chat({ system = '', messages = [], tools = [], temperature = 0.4, maxTokens = 1200 } = {}) {
  const cfg = getConfig();
  if (cfg.provider === 'none') throw userError(notAvailableMessage());
  if (!cfg.apiKey) throw userError('> Falta la *API key* del proveedor elegido en tu `.env`. El agente está en modo manual.');
  if (!cfg.model) throw userError('> Falta el *modelo* (GINKO_AI_MODEL) en tu `.env`. El agente no puede activarse.');

  const fn = cfg.provider === 'gemini' ? geminiChat : openAiChat;
  return runGuarded('ai', () => fn(cfg, { system, messages, tools, temperature, maxTokens }));
}

// ── OpenAI-compatible (OpenRouter / OpenAI / Groq / etc.) ──────────
async function openAiChat(cfg, { system, messages, tools, temperature, maxTokens }) {
  const msgs = [{ role: 'system', content: system }, ...translateOpenAiMessages(messages)];
  const payload = { model: cfg.model, messages: msgs, temperature, max_tokens: maxTokens };
  if (tools?.length) { payload.tools = tools; payload.tool_choice = 'auto'; }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/riokuroxi-svg/Ginko-MD',
      'X-Title': 'Ginko-MD',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const er = new Error(`OpenAI-origen HTTP ${res.status}: ${body.slice(0, 200)}`);
    er.status = res.status;
    throw er;
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message || {};
  return { content: message?.content || '', tool_calls: normalizeToolCalls(message?.tool_calls || []), finish_reason: data?.choices?.[0]?.finish_reason };
}

function translateOpenAiMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })) };
    }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    return { role: m.role, content: m.content };
  });
}

// ── Google Gemini (vía #lib/gemini): robusto + reintentos ──────────
async function geminiChat(cfg, { system, messages, tools, temperature, maxTokens }) {
  const contents = translateGeminiMessages(messages);
  const json = await geminiGenerateContents({
    key: cfg.apiKey,
    model: cfg.model,
    system,
    contents,
    tools,
    temperature,
    maxTokens,
    timeoutMs: 60000,
    retries: 1,
    safetyLevel: 'BLOCK_ONLY_HIGH', // el agente debe poder operar tools destructivas (solo owner)
  });
  const tool_calls = geminiToolCalls(json);
  let content = '';
  if (tool_calls.length) {
    // El modelo puede devolver SOLO function calls (sin texto): no exigir texto.
    for (const p of (json?.candidates?.[0]?.content?.parts || [])) {
      if (p?.text && !p?.thought) content += p.text;
    }
    content = content.trim();
  } else {
    content = geminiText(json); // lanza un Error claro (SAFETY, MAX_TOKENS, etc.)
  }
  return { content, tool_calls: normalizeToolCalls(tool_calls), finish_reason: 'stop' };
}

function translateGeminiMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) parts.push({ functionCall: { name: tc.name, args: JSON.parse(tc.arguments || '{}') } });
      out.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const fc = JSON.parse(m.content || '{}');
      out.push({ role: 'user', parts: [{ functionResponse: { name: m.name || 'tool', response: { result: typeof fc === 'string' ? fc : m.content } } }] });
    } else if (m.role === 'assistant') {
      out.push({ role: 'model', parts: [{ text: m.content || '' }] });
    } else {
      out.push({ role: 'user', parts: [{ text: m.content || '' }] });
    }
  }
  return out;
}

export default { chat, isAvailable, getConfig, notAvailableMessage };
