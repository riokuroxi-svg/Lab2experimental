import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeMenuContent,
  getNativeMenuCategory,
  getNativeMenuRows,
  handleNativeMenuResponse,
  renderNativeMenuCategory,
  sendNativeCategoryMenu,
} from '../core/lib/native-menu.js';
import { getSelectedResponse } from '../core/lib/interactive-response.js';

const nativeResponse = (id, stanzaId = 'menu-message-id') => ({
  key: { remoteJid: '5215555555555@s.whatsapp.net', id: 'response-id' },
  message: {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: {
            name: 'single_select',
            paramsJson: JSON.stringify({ id }),
          },
          contextInfo: { stanzaId },
        },
      },
    },
  },
});

test('construye single_select con categorías visibles y filas limitadas', () => {
  const rows = getNativeMenuRows();
  assert.ok(rows.length > 0 && rows.length <= 14);
  assert.deepEqual(rows.slice(0, 6).map((row) => row.title), [
    'Descargas',
    'Economía',
    'Entretenimiento',
    'Gacha',
    'Principal',
    'Grupos',
  ]);
  assert.match(rows[0].description, /📥 .*14 comandos/);
  assert.match(rows[4].description, /🏠 .*7 comandos/);

  const content = buildNativeMenuContent({ body: 'elige', footer: 'fallback', wrapViewOnce: true });
  const interactive = content.viewOnceMessage.message.interactiveMessage;
  assert.equal(interactive.nativeFlowMessage.buttons[0].name, 'single_select');
  const params = JSON.parse(interactive.nativeFlowMessage.buttons[0].buttonParamsJson);
  assert.equal(params.title, 'Categorías');
  assert.equal(params.sections[0].title, '✨ Categorías');
  assert.equal(params.sections[0].rows.length, rows.length);
  assert.equal(params.sections[0].rows[0].id, 'gkmenu:downloads');
  assert.equal(interactive.header.hasMediaAttachment, false);
});

test('permite inspeccionar la ruta directa sin viewOnceMessage', () => {
  const content = buildNativeMenuContent({ wrapViewOnce: false });
  assert.ok(content.interactiveMessage.nativeFlowMessage);
  assert.equal(content.viewOnceMessage, undefined);
});

test('relay manual añade biz y bot solo en chats privados', async () => {
  const calls = [];
  const sock = {
    user: { id: '5215555555555:1@s.whatsapp.net' },
    relayMessage: async (...args) => calls.push(args),
  };

  const privateResult = await sendNativeCategoryMenu({ sock, jid: '5215555555556@s.whatsapp.net', body: 'x' });
  assert.equal(privateResult.sent, true);
  assert.deepEqual(calls[0][2].additionalNodes.map((node) => node.tag), ['biz', 'bot']);
  assert.equal(calls[0][1].viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons[0].name, 'single_select');

  const groupResult = await sendNativeCategoryMenu({ sock, jid: '120363000000000000@g.us', body: 'x' });
  assert.equal(groupResult.sent, true);
  assert.deepEqual(calls[1][2].additionalNodes.map((node) => node.tag), ['biz']);
});

test('decodifica nativeFlowResponseMessage.paramsJson dentro de wrappers', () => {
  const decoded = getSelectedResponse(nativeResponse('gkmenu:economia'));
  assert.equal(decoded.id, 'gkmenu:economia');
  assert.equal(decoded.stanzaId, 'menu-message-id');
  assert.equal(getNativeMenuCategory(nativeResponse('gkmenu:economia')), 'economia');
});

test('mantiene compatibilidad con respuestas antiguas', () => {
  assert.equal(getSelectedResponse({ message: { listResponseMessage: { singleSelectReply: { selectedRowId: 'old-list' }, contextInfo: { stanzaId: 'a' } } } }).id, 'old-list');
  assert.equal(getSelectedResponse({ message: { buttonsResponseMessage: { selectedButtonId: 'old-button' } } }).id, 'old-button');
  assert.equal(getSelectedResponse({ message: { templateButtonReplyMessage: { selectedId: 'old-template' } } }).id, 'old-template');
});

test('renderiza la categoría seleccionada sustituyendo el prefijo', () => {
  const text = renderNativeMenuCategory('main', '#');
  assert.match(text, /PRINCIPAL/);
  assert.match(text, /#ping/);
  assert.equal(renderNativeMenuCategory('no-existe', '.'), '');
});

test('una respuesta válida dispara solo la categoría correspondiente', async () => {
  const sent = [];
  const sock = { sendMessage: async (...args) => sent.push(args) };
  const msg = nativeResponse('gkmenu:grupo');
  const handled = await handleNativeMenuResponse({ msg, sock, prefix: '.' });
  assert.equal(handled, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0][1].text, /GROUPS/);
  assert.match(sent[0][1].text, /\.menu/);
});

test('permite entregar la categoría al handler normal del comando', async () => {
  const sent = [];
  const sock = { sendMessage: async (...args) => sent.push(args) };
  let category = '';
  const handled = await handleNativeMenuResponse({
    msg: nativeResponse('gkmenu:main'),
    sock,
    onCategory: (value) => { category = value; },
  });
  assert.equal(handled, true);
  assert.equal(category, 'main');
  assert.equal(sent.length, 0);
});

test('una fila desconocida recibe fallback textual seguro', async () => {
  const sent = [];
  const sock = { sendMessage: async (...args) => sent.push(args) };
  const handled = await handleNativeMenuResponse({ msg: nativeResponse('gkmenu:desconocida'), sock, prefix: '.' });
  assert.equal(handled, true);
  assert.match(sent[0][1].text, /menumanual/);
});
