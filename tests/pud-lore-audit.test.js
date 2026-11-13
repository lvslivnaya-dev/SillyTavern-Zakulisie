import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_REPLIES, auditChat, plainKey, wordsText } from '../src/pud/core/lore-audit.js';
import { EXTRA_KEY } from '../src/pud/core/lore-trace.js';

const rx = (word, ending = '') => `/(?<![\\p{L}\\p{M}\\p{N}_-])${word}${ending}(?![\\p{L}\\p{M}\\p{N}_-])/iu`;
const on = (w, u, t, key, key2, tok = 100, how = 'key') => ({ w, u, t, how, key, key2, logic: 'AND ANY', tok });
const reply = on_ => ({ is_user: false, extra: { [EXTRA_KEY]: { on: on_, off: [] } } });
const user = { is_user: true, mes: 'привет' };

test('a key is shown the way a person reads it: no word boundaries, endings folded', () => {
  assert.equal(plainKey(rx('голос', '(?:а|ам|ами|ах|е|ов|ом|у)?')), 'голос…');
  assert.equal(plainKey(rx('майки')), 'майки');
  assert.equal(plainKey('тайяки'), 'тайяки');
  assert.equal(plainKey(''), '');
  assert.equal(plainKey(undefined), '');
});

test('no reports: nothing to audit', () => {
  assert.equal(auditChat([user, { is_user: false, extra: {} }]), null);
  assert.equal(auditChat(null), null);
});

test('a secondary key that lets many entries in nearly every reply is noise; a rare precise one is not', () => {
  const voice = rx('голос', '(?:а|ом)?');
  const chat = [];
  for (let i = 0; i < 6; i += 1) {
    chat.push(user, reply([
      on('Бонтен', 1, '[ Майки ] - Voice', rx('майки'), voice, 300),
      on('Бонтен', 2, '[ Майки ] - Visual', rx('майки'), voice, 700),
      on('Бонтен', 3, '[ Санзу ] - Voice', rx('санзу'), voice, 250),
      on('Бонтен', 9, 'Тайяки', rx('тайяки'), '', 80),
      on('Игрок', 0, 'Репутация', '', '', 150, 'constant'),
    ]));
  }
  const audit = auditChat(chat);
  assert.equal(audit.replies, 6);
  assert.equal(audit.enough, true);
  assert.equal(audit.tokensPerReply, 1480);
  assert.equal(audit.constantPerReply, 150);
  assert.equal(audit.keyPerReply, 1330);
  const voiceKey = audit.secondary.find(item => item.key === 'голос…');
  assert.deepEqual([voiceKey.replies, voiceKey.entries, voiceKey.noisy], [6, 3, true]);
  assert.deepEqual(audit.noisy.map(item => item.key), ['голос…']);
  assert.equal(wordsText(audit), 'голос');
  const taiyaki = audit.primary.find(item => item.key === 'тайяки');
  assert.equal(taiyaki.noisy, false, 'основной ключ и одна запись: не шум');
  // The most expensive entry first, with what lets it in.
  assert.equal(audit.entries[0].t, '[ Майки ] - Visual');
  assert.deepEqual([audit.entries[0].replies, audit.entries[0].total, audit.entries[0].perAppearance], [6, 4200, 700]);
  assert.deepEqual(audit.entries[0].reasons, [{ reason: 'майки + голос…', count: 6 }]);
  assert.equal(audit.entries.find(item => item.t === 'Репутация').constant, true);
});

test('too few replies: numbers yes, verdicts no', () => {
  const voice = rx('голос');
  const chat = [reply([on('Б', 1, 'A', rx('а'), voice), on('Б', 2, 'B', rx('б'), voice), on('Б', 3, 'C', rx('в'), voice)])];
  for (let i = 1; i < MIN_REPLIES - 1; i += 1) chat.push(chat[0]);
  const audit = auditChat(chat);
  assert.equal(audit.replies, MIN_REPLIES - 1);
  assert.equal(audit.enough, false);
  assert.deepEqual(audit.noisy, []);
  assert.equal(audit.secondary[0].noisy, false);
});

test('a key present in few replies or opening few entries is left alone', () => {
  const chat = [];
  for (let i = 0; i < 10; i += 1) {
    chat.push(reply([on('Б', 1, 'A', rx('а'), i < 2 ? rx('редкий') : '', 50), on('Б', 2, 'B', rx('б'), rx('парный'), 50)]));
  }
  const audit = auditChat(chat);
  assert.equal(audit.secondary.find(item => item.key === 'редкий').noisy, false, 'в 2 из 10 ответов');
  assert.equal(audit.secondary.find(item => item.key === 'парный').noisy, false, 'в каждом, но открыл одну запись');
});

test('a key is taken out of an entry in every spelling, and the entry itself is not touched', async () => {
  const { withoutKey } = await import('../src/pud/core/lore-audit.js');
  const entry = { keysecondary: [rx('голос', '(?:а|ом)?'), rx('голос', '(?:ка|ки)'), rx('тембр')], key: [rx('майки')] };
  const { keys, removed } = withoutKey(entry, 'голос…');
  assert.equal(removed, 2);
  assert.deepEqual(keys, [rx('тембр')]);
  assert.equal(entry.keysecondary.length, 3, 'исходная запись не меняется');
  assert.deepEqual(withoutKey({ keysecondary: [] }, 'голос…'), { keys: [], removed: 0 });
  assert.deepEqual(withoutKey({}, 'голос…'), { keys: [], removed: 0 });
});
