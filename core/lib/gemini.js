// ════════════════════════════════════════════════════════════════════
//  gemini.js — Cliente Gemini robusto y compartido
//
//  Arregla los fallos típicos de los clientes ad-hoc:
//   · NO asume `parts[0].text`: junta los text de TODOS los parts y omite
//     los parts de "thought" (Gemini 2.x los antepone).
//   · Timeout (evita que una petición cuelgue el comando).
//   · Maneja finishReason (SAFETY, MAX_TOKENS, RECITATION, PROHIBITED...)
//     con mensaje claro en vez de "no devolvió respuesta".
//   · Reintenta 1 vez en 429/5xx/errores de red (con backoff).
//   · Extrae el mensaje de error real del body de la API.
// ════════════════════════════════════════════════════════════════════

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function resolveGeminiConfig() {
  const key = global?.geminiRolKey || process.env.GEMINI_ROL_KEY || global?.geminiKey || process.env.GEMINI_API_KEY || '';
  const model = global?.geminiRolModel || process.env.GEMINI_ROL_MODEL || global?.geminiModel || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  return { key, model };
}

const SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function extractError(status, bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.error?.message || parsed?.error?.status || `HTTP ${status}`;
  } catch {
    return `HTTP ${status}`;
  }
}

function isTransient(status) { return status === 429 || status >= 500; }

export function finishReasonMessage(finishReason) {
  switch (finishReason) {
    case 'SAFETY': return 'La IA bloqueó la respuesta por políticas de seguridad.';
    case 'RECITATION': return 'La IA bloqueó la respuesta por citar texto protegido.';
    case 'PROHIBITED_CONTENT': return 'La IA bloqueó la respuesta por contenido prohibido.';
    case 'BLOCKLIST': return 'La IA bloqueó la respuesta por la lista de bloqueo.';
    case 'MAX_TOKENS': return 'La respuesta se cortó por llegar al límite de tokens.';
    default: return '';
  }
}

// Genera contenidos. Devuelve el JSON crudo de Gemini.
// Lanza Error con mensaje claro; reintenta 1 vez en 429/5xx/red.
export async function geminiGenerateContents({
  key,
  model,
  system = '',
  contents = [],
  tools = [],
  temperature = 0.75,
  maxTokens = 900,
  timeoutMs = 30000,
  retries = 1,
  safetyLevel = 'BLOCK_MEDIUM_AND_ABOVE',
} = {}) {
  const url = `${BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const arr = [];
  if (system) {
    arr.push({ role: 'user', parts: [{ text: system }] });
    arr.push({ role: 'model', parts: [{ text: 'Entendido. Seguiré esas instrucciones.' }] });
  }
  arr.push(...contents);

  const body = {
    contents: arr,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      candidateCount: 1,
      // Deshabilitamos el "thinking" de Gemini 3.x: con presupuesto bajo, el
      // thinking se come todo maxOutputTokens y devuelve MAX_TOKENS sin texto
      // final (el fallo intermitente "a veces falla"). Los tokens van al texto.
      thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
    },
    safetySettings: SAFETY.map((s) => ({ ...s, threshold: safetyLevel })),
  };
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: { type: 'OBJECT', properties: t.function.parameters?.properties || {}, required: t.function.parameters?.required || [] },
    })) }];
  }
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Cada intento tiene su PROPIO presupuesto de tiempo (si el 1º casi llega
    // al límite, el retry no arrastra un signal ya abortado).
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(extractError(res.status, text));
        err.status = res.status;
        if (isTransient(res.status) && attempt < retries) { lastError = err; await sleep(500 * (attempt + 1)); continue; }
        throw err;
      }
      return await res.json();
    } catch (e) {
      const status = e?.status || 0;
      const transient = isTransient(status) || e?.name === 'AbortError' || e?.code === 'UND_ERR_CONNECT_TIMEOUT' || e?.type === 'network';
      if (transient && attempt < retries) { lastError = e; await sleep(500 * (attempt + 1)); continue; }
      throw e;
    } finally {
      clearTimeout(to);
    }
  }
  throw lastError || new Error('Gemini: agotados los reintentos.');
}

// Extrae el texto generado de forma ROBUSTA (omite parts "thought").
export function geminiText(json) {
  const candidate = json?.candidates?.[0] || {};
  const parts = candidate?.content?.parts || [];
  let text = '';
  for (const p of parts) {
    if (p?.text && !p?.thought) text += p.text;
  }
  if (!text) {
    const reason = finishReasonMessage(candidate?.finishReason);
    if (reason) throw new Error(reason);
    if (json?.promptFeedback?.blockReason) throw new Error('La IA bloqueó esta respuesta por políticas de seguridad.');
    throw new Error('Gemini no devolvió una respuesta válida.');
  }
  return text.trim();
}

// Extrae las llamadas a herramientas (functionCall) de la respuesta.
export function geminiToolCalls(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const calls = [];
  for (const p of parts) {
    if (p?.functionCall) {
      calls.push({
        id: `gem_${Date.now()}_${calls.length}`,
        type: 'function',
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {}),
      });
    }
  }
  return calls;
}

export default { resolveGeminiConfig, geminiGenerateContents, geminiText, geminiToolCalls };
