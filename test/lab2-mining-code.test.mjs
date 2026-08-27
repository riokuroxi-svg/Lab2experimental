import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectOwnerIdentities,
  expandWithParticipants,
  parseActionButtonId,
  sameIdentity,
} from '../core/lib/jidIdentity.js';
import { buildPairingCodeMessage } from '../core/lib/pairingCodeMessage.js';
import { __richUiTest } from '../core/lib/rich-ui.js';
import { getSelectedResponse } from '../core/lib/interactive-response.js';
import fs from 'node:fs';

test('minería reconoce al mismo usuario aunque el tap llegue como lid', () => {
  const participants = [{
    id: '5215551112222@s.whatsapp.net',
    lid: '1234567890@lid',
    phoneNumber: '5215551112222',
  }];
  const owner = collectOwnerIdentities({
    chat: '120363000@g.us',
    sender: '5215551112222@s.whatsapp.net',
  }, { participants });
  const responder = [...expandWithParticipants(new Set(['1234567890@lid']), participants)];
  assert.equal(sameIdentity(responder, owner), true);
});

test('minería no autoriza a otro participante', () => {
  const participants = [
    { id: '5215551112222@s.whatsapp.net', lid: 'owner@lid', phoneNumber: '5215551112222' },
    { id: '5215553334444@s.whatsapp.net', lid: 'other@lid', phoneNumber: '5215553334444' },
  ];
  const owner = collectOwnerIdentities({
    chat: '120363000@g.us',
    sender: '5215551112222@s.whatsapp.net',
  }, { participants });
  const responder = [...expandWithParticipants(new Set(['other@lid']), participants)];
  assert.equal(sameIdentity(responder, owner), false);
});

test('minería entiende IDs de botón nuevos y antiguos', () => {
  assert.deepEqual(parseActionButtonId('__ginko_mine_si_roca', '__ginko_mine_'), {
    action: 'si', eventId: 'roca', token: '',
  });
  assert.deepEqual(parseActionButtonId('__ginko_mine_evabc123_si_roca', '__ginko_mine_'), {
    token: 'evabc123', action: 'si', eventId: 'roca',
  });
});

test('mensaje .code queda formateado con pasos, separador, código y validez', () => {
  const msg = buildPairingCodeMessage('ABCD-1234', 60);
  assert.match(msg, /Sub-Bot — Code/);
  for (const step of ['0)', '1)', '2)', '3)', '4)', '5)']) assert.match(msg, new RegExp(step.replace(')', '\\)')));
  assert.match(msg, /━━━━━━━━━━━━━━━━━━━━/);
  assert.match(msg, /\*ABCD-1234\*/);
  assert.match(msg, /60 segundos/);
});


test('minería reconoce taps envueltos como interactive nativeFlow', () => {
  const selected = getSelectedResponse({
    message: {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            nativeFlowResponseMessage: {
              name: 'quick_reply',
              paramsJson: JSON.stringify({ id: '__ginko_mine_evabc123_si_roca' }),
            },
            contextInfo: { stanzaId: 'msg-evento-1', participant: 'owner@lid' },
          },
        },
      },
    },
  });
  assert.equal(selected.id, '__ginko_mine_evabc123_si_roca');
  assert.equal(selected.stanzaId, 'msg-evento-1');
  assert.deepEqual(parseActionButtonId(selected.id, '__ginko_mine_'), {
    token: 'evabc123', action: 'si', eventId: 'roca',
  });
});

test('imagen de .code queda incluida en media', () => {
  assert.equal(fs.existsSync(new URL('../media/code-banner.jpg', import.meta.url)), true);
});


test('Instagram preview usa fallback cuando la miniatura real es débil', () => {
  const weak = {
    'matched-text': 'https://www.instagram.com/',
    'canonical-url': 'https://www.instagram.com/',
    title: 'Instagram',
    originalThumbnailUrl: 'data:image/png;base64,abc',
    jpegThumbnail: Buffer.alloc(3730),
  };
  assert.equal(__richUiTest.isWeakInstagramThumbnail(weak), true);
  assert.equal(__richUiTest.isWeakInstagramThumbnail({ ...weak, highQualityThumbnail: { url: 'weak-uploaded' } }), true);
  const finalPreview = __richUiTest.applyInstagramPreviewFallback(weak, 'https://www.instagram.com/');
  assert.ok(finalPreview.jpegThumbnail.length > weak.jpegThumbnail.length);
  assert.match(finalPreview.description, /Instagram oficial/);
});

test('Instagram fallback prepara highQualityThumbnail subido como thumbnail-link', async () => {
  const image = await __richUiTest.prepareLinkPreviewFallbackImage({
    waUploadToServer: async () => ({
      mediaUrl: 'https://wa.example/uploaded',
      directPath: '/v/t62.fake-thumbnail',
    }),
  });
  assert.ok(image);
  assert.equal(image.width, 480);
  assert.equal(image.height, 720);
  assert.equal(image.url, 'https://wa.example/uploaded');
  assert.equal(image.directPath, '/v/t62.fake-thumbnail');
  assert.ok(image.jpegThumbnail?.length > 0);

  const finalPreview = __richUiTest.applyInstagramPreviewFallback({
    'matched-text': 'https://www.instagram.com/',
    'canonical-url': 'https://www.instagram.com/',
    title: 'Instagram',
    originalThumbnailUrl: 'data:image/png;base64,abc',
    jpegThumbnail: Buffer.alloc(3730),
  }, 'https://www.instagram.com/', { highQualityThumbnail: image });

  assert.equal(finalPreview.highQualityThumbnail, image);
});


test('Instagram preview arma metadata MMS para favicon en extendedTextMessage', () => {
  const mms = __richUiTest.imageMessageToMmsThumbnailMetadata({
    directPath: '/v/t62.favicon',
    fileSha256: Buffer.from('sha'),
    fileEncSha256: Buffer.from('enc'),
    mediaKey: Buffer.from('key'),
    mediaKeyTimestamp: 123,
    height: 32,
    width: 32,
  });
  assert.equal(mms.thumbnailDirectPath, '/v/t62.favicon');
  assert.equal(mms.thumbnailWidth, 32);
  assert.equal(mms.thumbnailHeight, 32);

  const content = __richUiTest.buildExtendedTextMessageContent('https://www.instagram.com/', {
    'matched-text': 'https://www.instagram.com/',
    title: 'Instagram',
    description: 'Instagram oficial del proyecto.',
    jpegThumbnail: Buffer.from('thumb'),
    highQualityThumbnail: {
      directPath: '/v/t62.preview',
      fileSha256: Buffer.from('sha2'),
      fileEncSha256: Buffer.from('enc2'),
      mediaKey: Buffer.from('key2'),
      mediaKeyTimestamp: 456,
      height: 720,
      width: 480,
    },
    faviconMMSMetadata: mms,
  });

  assert.equal(content.matchedText, 'https://www.instagram.com/');
  assert.equal(content.thumbnailDirectPath, '/v/t62.preview');
  assert.equal(content.faviconMMSMetadata, mms);
});
