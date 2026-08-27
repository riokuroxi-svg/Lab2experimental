import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectOwnerIdentities,
  expandWithParticipants,
  parseActionButtonId,
  sameIdentity,
} from '../core/lib/jidIdentity.js';
import { buildPairingCodeMessage } from '../core/lib/pairingCodeMessage.js';

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
