/** The assistant inside the whole extension (a stub SillyTavern): the talk stays out of the game chat, only an accepted conclusion goes to the narrator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div><div id="extensions_settings2"></div><div id="top-settings-holder"><div id="persona-management-button"></div></div><div id="chat"></div><div id="form_sheld"><div id="send_form"></div></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const name of Object.getOwnPropertyNames(dom.window)) { if (/^[A-Z]/.test(name) && typeof dom.window[name] === 'function') { try { globalThis[name] = dom.window[name]; } catch {} } }
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const prompts = new Map();
const requests = [];
const noop = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : noop), apply: () => undefined });
const base = {
  extensionSettings: { disabledExtensions: [], pudrenitsa: { enabled: false }, kulisy: {} },
  chat: [{ name: 'Ран', mes: 'Он молчал.', is_user: false }, { name: 'Судзу', mes: 'Привет.', is_user: true }],
  chatMetadata: {}, characters: [], groups: [], name1: 'User', name2: 'Bot',
  eventSource: { on() {}, once() {}, removeListener() {}, makeLast() {}, makeFirst() {} },
  eventTypes: new Proxy({}, { get: (t, k) => String(k) }),
  getCurrentChatId: () => 'chat1', saveSettingsDebounced() {}, getRequestHeaders: () => ({}),
  setExtensionPrompt(key, value) { prompts.set(key, value); },
  mainApi: 'openai', getTokenCountAsync: async () => 0, getWorldInfoNames: () => [], powerUserSettings: { personas: {} },
  extensionPrompts: {}, saveChat: async () => {}, saveMetadata: async () => {},
  generateRaw: async options => { requests.push(options.prompt); return 'Поняла: Ран станет мягче.\n===ВЫВОД===\nRan is gentler with the persona.'; },
};
const context = new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });
globalThis.SillyTavern = { getContext: () => context };

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const press = id => document.querySelector(`.ku-winbtn[data-window="${id}"] .drawer-icon`).click();

test('the assistant: the talk stays away from the game chat; a proposal waits for «Да»; only then it goes to the narrator', async () => {
  const module = await import('../index.js');
  const controller = await module.init();
  try {
    const gm = controller.personaBridge.assistant;
    const seenViews = [];
    const stop = gm.subscribe(view => seenViews.push(view));
    assert.equal(gm.view().assistant.name, 'Розита', 'the first assistant by default');

    await gm.send('Хочу, чтобы Ран был мягче.');
    await wait(120);

    assert.equal(requests.length, 1, 'one request to the model');
    const sent = requests[0];
    assert.equal(sent[0].role, 'system');
    assert.ok(sent[0].content.includes('[рассказчик] Ран: Он молчал.'), 'the assistant sees the game');
    assert.ok(sent[0].content.includes('Розита') && sent[0].content.includes('цвет мой'), 'its character and forms of address are in the prompt');
    assert.ok(sent[0].content.includes('Автор — женщина'), 'the assistant knows the author is a woman by default');
    assert.deepEqual(sent.slice(1), [{ role: 'user', content: 'Хочу, чтобы Ран был мягче.' }]);
    assert.equal(base.chat.length, 2, 'nothing was written into the game chat');
    assert.equal(context.chatMetadata['kulisy.gm.v1'].messages.length, 2, 'the talk is kept in the chat metadata');
    assert.ok(seenViews.length >= 1 && seenViews.at(-1).messages.length === 2, 'the messenger is told, once per pause, with the state as it is');

    const view = gm.view();
    assert.deepEqual(view.messages.map(item => item.text), ['Хочу, чтобы Ран был мягче.', 'Поняла: Ран станет мягче.']);
    assert.equal(view.proposal, 'Ran is gentler with the persona.');
    assert.equal(prompts.get('kulisy-gm') ?? '', '', 'a proposal alone does not go to the narrator');

    await gm.answer('yes');
    await wait(120);
    assert.equal(gm.view().proposal, null);
    assert.ok((prompts.get('kulisy-gm') ?? '').includes('- Ran is gentler with the persona.'), 'after «Да» it is sent to the narrator');
    assert.ok(!(prompts.get('kulisy-gm') ?? '').includes('Хочу'), 'the talk itself is not');

    // the answer was cut off (a reload): the retry answers the last message again, without a second copy of it
    context.chatMetadata['kulisy.gm.v1'].messages.pop();
    const before = requests.length;
    await gm.retry();
    await wait(120);
    assert.equal(requests.length, before + 1);
    assert.deepEqual(gm.view().messages.map(item => item.role), ['user', 'assistant']);

    // another assistant with its own forms of address; its own API goes through a profile
    await gm.saveSettings({ assistant: 'dias', profileId: 'p1' });
    assert.equal(gm.view().assistant.name, 'Диас');
    assert.equal(gm.view().settings.profileId, 'p1');
    await gm.saveSettings({ assistant: 'custom', custom: { name: 'Нори', character: 'Тихая.', addresses: 'босс; шеф' } });
    assert.deepEqual(gm.view().assistant.addresses, ['босс', 'шеф']);
    await gm.saveSettings({ avatars: { custom: 'data:image/png;base64,AAAA' } });
    assert.equal(gm.view().settings.avatars.custom, 'data:image/png;base64,AAAA');
    await gm.saveSettings({ avatars: { custom: null } });
    assert.equal(gm.view().settings.avatars.custom, undefined);

    // switched off in the list of agreements → gone from the request
    const note = gm.view().conclusions[0];
    await gm.conclusion({ id: note.id, op: 'toggle' });
    await wait(120);
    assert.equal(prompts.get('kulisy-gm') ?? '', '');
    stop();
  } finally { controller.destroy(); }
});
