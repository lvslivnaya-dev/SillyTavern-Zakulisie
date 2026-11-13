import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GM_PROMPT, GM_TAG, PROPOSAL_MARK, acceptProposal, addMessage, buildGmPrompt, buildGmRequest, clearTalk, continueTalk, editConclusion,
  emptyGm, normalizeGm, rejectProposal, removeConclusion, setProposal, splitReply, toggleConclusion,
} from '../src/core/gm-assistant.js';

test('the talk and the proposal: «да» makes a standing note, «нет» throws it away, «ещё не всё» keeps talking', () => {
  let gm = addMessage(emptyGm(), 'user', 'Хочу, чтобы Ран был мягче.');
  const reply = splitReply(`Поняла: мягче, но без сюсюканья.\n${PROPOSAL_MARK}\nRan is gentler with the persona: dry humour, no sneering.`);
  assert.equal(reply.text, 'Поняла: мягче, но без сюсюканья.');
  gm = setProposal(addMessage(gm, 'assistant', reply.text), reply.proposal);
  assert.equal(gm.proposal, 'Ran is gentler with the persona: dry humour, no sneering.');
  assert.equal(gm.conclusions.length, 0, 'nothing goes to the narrator before «да»');
  assert.equal(buildGmPrompt(gm), '');

  const yes = acceptProposal(gm);
  assert.equal(yes.proposal, null);
  assert.deepEqual(yes.conclusions.map(item => [item.text, item.on]), [['Ran is gentler with the persona: dry humour, no sneering.', true]]);
  const block = buildGmPrompt(yes);
  assert.ok(block.startsWith(`[${GM_TAG}`) && block.endsWith(`[/${GM_TAG}]`));
  assert.ok(block.includes('- Ran is gentler'));

  assert.equal(rejectProposal(gm).proposal, null);
  assert.equal(rejectProposal(gm).conclusions.length, 0);
  const more = continueTalk(gm);
  assert.equal(more.proposal, null);
  assert.equal(more.messages.at(-1).role, 'user');
  assert.match(more.messages.at(-1).text, /Ещё не всё/);
});

test('the notes: switched off ones do not go out, they can be edited and removed, the limit holds, the talk can be cleared without losing them', () => {
  let gm = setProposal(emptyGm(), 'first');
  gm = acceptProposal(gm);
  gm = acceptProposal(setProposal(gm, 'second'));
  const [first, second] = gm.conclusions;
  assert.ok(buildGmPrompt(gm).includes('- first\n- second'));
  gm = toggleConclusion(gm, first.id);
  assert.ok(!buildGmPrompt(gm).includes('first'));
  gm = editConclusion(gm, second.id, 'second, edited');
  assert.ok(buildGmPrompt(gm).includes('second, edited'));
  assert.equal(editConclusion(gm, second.id, '   ').conclusions[1].text, 'second, edited', 'an empty edit changes nothing');
  assert.equal(buildGmPrompt(gm, { limit: 5 }), '', 'what does not fit the limit is left out');
  const cleared = clearTalk(addMessage(gm, 'user', 'привет'));
  assert.equal(cleared.messages.length, 0);
  assert.equal(cleared.conclusions.length, 2, 'what was agreed stays');
  assert.equal(removeConclusion(gm, first.id).conclusions.length, 1);
});

test('the request: the prompt of the assistant, the last posts of the game, the standing notes and the talk', () => {
  let gm = acceptProposal(setProposal(emptyGm(), 'Keep Ran terse.'));
  gm = addMessage(gm, 'user', 'Что там с темпом?');
  const request = buildGmRequest({
    prompt: '', name: 'Режиссёр', gm,
    chat: [{ name: 'Ран', text: 'Он молчал.', isUser: false }, { name: 'Судзу', text: 'Привет.', isUser: true }],
  });
  assert.equal(request[0].role, 'system');
  assert.ok(request[0].content.startsWith(DEFAULT_GM_PROMPT.slice(0, 40)), 'the built-in prompt when none is set');
  assert.ok(request[0].content.includes('Режиссёр'));
  assert.ok(request[0].content.includes('[рассказчик] Ран: Он молчал.'));
  assert.ok(request[0].content.includes('[автор/персона] Судзу: Привет.'));
  assert.ok(request[0].content.includes('Keep Ran terse.'));
  assert.deepEqual(request.slice(1), [{ role: 'user', content: 'Что там с темпом?' }]);
  assert.ok(buildGmRequest({ prompt: 'Свой промпт.', gm: emptyGm() })[0].content.startsWith('Свой промпт.'));
});

test('stored junk is tidied: wrong roles and empty texts dropped, double ids repaired', () => {
  const gm = normalizeGm({ messages: [{ role: 'x', text: 'a' }, { role: 'user', text: '  ' }, { id: 'm1', role: 'user', text: 'a' }, { id: 'm1', role: 'assistant', text: 'b' }], conclusions: [{ id: 'c', text: 'z', on: false }, { id: 'c', text: 'y' }, 5], proposal: '  ' });
  assert.equal(gm.messages.length, 2);
  assert.notEqual(gm.messages[0].id, gm.messages[1].id);
  assert.equal(gm.conclusions.length, 2);
  assert.equal(gm.conclusions[0].on, false);
  assert.equal(gm.proposal, null);
  assert.deepEqual(normalizeGm('x'), emptyGm());
  assert.deepEqual(splitReply('просто ответ'), { text: 'просто ответ', proposal: null });
});

test('свои ассистенты: сколько угодно, прежний единственный «свой» переезжает в список, удалённый выбранный возвращает Розиту', async () => {
  const { normalizeGmSettings, patchCustoms, resolveAssistant, GM_LIMITS } = await import('../src/core/gm-assistant.js');
  const old = normalizeGmSettings({ assistant: 'custom', custom: { name: 'Нори', character: 'Тихая.', addresses: 'босс; шеф' } });
  assert.deepEqual(old.customs.map(item => [item.id, item.name]), [['custom', 'Нори']]);
  assert.equal(resolveAssistant(old).name, 'Нори');
  assert.deepEqual(normalizeGmSettings({ custom: { name: '', character: '', addresses: [] } }).customs, [], 'пустой прежний «свой» не нужен');

  let { customs, added } = patchCustoms(old.customs, { addCustom: true });
  assert.equal(added, 'own1');
  ({ customs } = patchCustoms(customs, { addCustom: true }));
  ({ customs } = patchCustoms(customs, { editCustom: { id: 'own2', name: 'Ян', addresses: 'шеф, босс' } }));
  const settings = normalizeGmSettings({ assistant: 'own2', customs, avatars: { own2: 'data:image/png;base64,AAAA', gone: 'data:image/png;base64,AAAA' } });
  assert.equal(settings.customs.length, 3);
  assert.deepEqual(resolveAssistant(settings).addresses, ['шеф', 'босс']);
  assert.deepEqual(Object.keys(settings.avatars), ['own2'], 'картинка чужого id не хранится');

  const without = normalizeGmSettings({ ...settings, customs: patchCustoms(settings.customs, { removeCustom: 'own2' }).customs });
  assert.equal(without.assistant, 'rosita', 'выбранного больше нет: возвращается Розита');
  assert.equal(without.customs.length, 2);

  let many = [];
  for (let i = 0; i < GM_LIMITS.customs + 5; i++) many = patchCustoms(many, { addCustom: true }).customs;
  assert.equal(many.length, GM_LIMITS.customs, 'есть разумный предел');
});
