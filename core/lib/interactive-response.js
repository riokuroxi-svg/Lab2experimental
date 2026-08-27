const RESPONSE_KEYS = new Set([
  'interactiveResponseMessage',
  'listResponseMessage',
  'buttonsResponseMessage',
  'templateButtonReplyMessage',
]);

const WRAPPER_KEYS = [
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'ephemeralMessage',
  'editedMessage',
  'documentWithCaptionMessage',
  'associatedChildMessage',
];

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function findResponse(node, depth = 0, seen = new Set()) {
  if (!isObject(node) || depth > 8 || seen.has(node)) return null;
  seen.add(node);

  for (const key of RESPONSE_KEYS) {
    if (isObject(node[key])) return { kind: key, value: node[key], container: node };
  }

  // nativeFlowResponseMessage normalmente está dentro de
  // interactiveResponseMessage, pero se acepta también cuando ya fue
  // extraído por smsg o por un listener que trabaja con el payload interno.
  if (isObject(node.nativeFlowResponseMessage)) {
    return { kind: 'interactiveResponseMessage', value: node, native: node.nativeFlowResponseMessage, container: node };
  }

  for (const key of WRAPPER_KEYS) {
    const wrapper = node[key];
    if (!isObject(wrapper)) continue;
    const child = wrapper.message || wrapper;
    const found = findResponse(child, depth + 1, seen);
    if (found) return found;
  }

  return null;
}

function parseParamsJson(value) {
  if (isObject(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value) !== '') return value;
  }
  return '';
}

/**
 * Decodifica respuestas antiguas y nativeFlow en un solo formato.
 *
 * Devuelve null cuando el mensaje no es una respuesta seleccionable y, si lo
 * es, devuelve { id, stanzaId, kind, params, contextInfo }.
 */
export function getSelectedResponse(input) {
  const roots = [input?.message, input?.msg, input].filter(isObject);
  let found = null;
  for (const root of roots) {
    found = findResponse(root);
    if (found) break;
  }
  if (!found) return null;

  const value = found.value || {};
  const native = found.native || value.nativeFlowResponseMessage;
  const params = parseParamsJson(native?.paramsJson);
  const contextInfo = value.contextInfo || native?.contextInfo || found.container?.contextInfo || input?.contextInfo || null;

  let id = '';
  if (found.kind === 'interactiveResponseMessage' && native) {
    id = firstValue(
      params?.id,
      params?.selectedRowId,
      params?.selected_row_id,
      params?.selected_id,
      params?.rowId,
      params?.row_id,
      value.body?.text,
    );
  } else if (found.kind === 'listResponseMessage') {
    id = firstValue(value.singleSelectReply?.selectedRowId, value.selectedRowId);
  } else if (found.kind === 'buttonsResponseMessage') {
    id = firstValue(value.selectedButtonId, value.selectedId);
  } else if (found.kind === 'templateButtonReplyMessage') {
    id = firstValue(value.selectedId, value.selectedButtonId);
  } else if (native) {
    id = firstValue(params?.id, params?.selectedRowId, params?.selected_row_id, params?.selected_id, params?.rowId, params?.row_id);
  }

  if (!id && value.body?.text) id = value.body.text;
  if (!id) return null;

  return {
    id: String(id),
    stanzaId: String(contextInfo?.stanzaId || ''),
    kind: found.kind,
    params,
    contextInfo,
  };
}

export default getSelectedResponse;
