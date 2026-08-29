/**
 * Llamada simple a Google Gemini (sin memoria, para narraciones/roles).
 * - Prioriza global.geminiRolKey (key dedicada al RPG/rol, si la configuras en config.private.js
 *   o en .env como GEMINI_ROL_KEY).
 * - Si no existe, cae a global.geminiKey (la misma que usa .ai).
 * - NUNCA tira excepción: si falla devuelve null para que el llamador use texto fallback.
 */

import { resolveGeminiConfig, geminiGenerateContents, geminiText } from '#lib/gemini';

const GEMINI_ROLE_MAX_TOKENS = 220;

// Narración/rol: usa el helper robusto de #lib/gemini (parsing + retries).
async function geminiGenerate(prompt, opts = {}) {
  const { key, model } = resolveGeminiConfig();
  if (!key) return null;
  try {
    const json = await geminiGenerateContents({
      key,
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      temperature: opts.temperature ?? 0.9,
      maxTokens: opts.maxTokens ?? 400,
      timeoutMs: 15000,
      retries: 1,
      safetyLevel: 'BLOCK_ONLY_HIGH', // conserva la postura original
    });
    return geminiText(json).slice(0, 600) || null;
  } catch {
    return null;
  }
}

export { geminiGenerate };
