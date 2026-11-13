/** Мессенджер ассистента и вкладка «Ассистенты» (заглушка bridge): чат отправляет, плашка «Вывод» отвечает Да/Нет/Ещё не всё, настройки меняют ассистента. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { startMessenger, MESSENGER_BUTTON_ID, MESSENGER_ID } from '../src/pud/ui/messenger.js';
import { startAssistants } from '../src/pud/ui/assistants.js';
import { resolveAssistant, normalizeGmSettings, normalizeGm, ASSISTANTS, patchCustoms } from '../src/core/gm-assistant.js';

function fakeBridge() {
  let gm = normalizeGm({ messages: [], conclusions: [{ id: 'c1', text: 'Be gentle.', on: true }], proposal: null });
  let settings = normalizeGmSettings({});
  const busy = false;
  const listeners = new Set();
  const calls = [];
  const view = () => ({ ...gm, busy, name: resolveAssistant(settings).name, assistant: resolveAssistant(settings), settings, profiles: [{ id: 'p1', name: 'Быстрый' }], defaultPrompt: 'встроенный', ready: ASSISTANTS.map(item => ({ id: item.id, name: item.name, tagline: item.tagline, addresses: [...item.addresses] })) });
  const emit = () => { for (const listener of listeners) listener(view()); };
  return {
    calls,
    set(next) { gm = normalizeGm({ ...gm, ...next }); emit(); },
    assistant: {
      view,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      send: async text => { calls.push(['send', text]); gm = normalizeGm({ ...gm, messages: [...gm.messages, { role: 'user', text }] }); emit(); },
      answer: async answer => { calls.push(['answer', answer]); gm = { ...gm, proposal: null }; emit(); },
      conclusion: async payload => { calls.push(['conclusion', payload]); emit(); },
      clear: async () => { calls.push(['clear']); emit(); },
      saveSettings: async patch => { calls.push(['settings', patch]); settings = normalizeGmSettings({ ...settings, ...patch, customs: patchCustoms(settings.customs, patch).customs, avatars: { ...settings.avatars, ...(patch.avatars ?? {}) } }); emit(); },
    },
  };
}

function tavern() {
  return new JSDOM('<!doctype html><body class="pud-on"><div id="form_sheld"><div id="send_form"></div></div></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
}

test('мессенджер: кнопка открывает чат, сообщение уходит ассистенту, плашка «Вывод» отвечает, свернуть закрывает', async () => {
  const dom = tavern();
  const { document } = dom.window;
  const bridge = fakeBridge();
  const opened = [];
  const shared = { hub: { open: tab => opened.push(tab) } };
  const undo = startMessenger(document, { bridge, shared });
  const button = document.getElementById(MESSENGER_BUTTON_ID);
  const win = document.getElementById(MESSENGER_ID);
  assert.ok(button && win);
  assert.ok(win.hidden, 'по умолчанию свёрнут');
  assert.match(button.querySelector('img').src, /^data:image\/svg/, 'нарисованное лицо ассистента по умолчанию');

  button.click();
  assert.ok(!win.hidden);
  assert.equal(win.querySelector('.pud-msgr-name').textContent, 'Розита');
  assert.match(win.querySelector('.pud-msgr-hint').textContent, /писать «OOC» не нужно/);

  const input = win.querySelector('.pud-msgr-input');
  input.value = 'Привет';
  input.dispatchEvent(new dom.window.Event('input'));
  win.querySelector('.pud-msgr-send').click();
  assert.deepEqual(bridge.calls.at(-1), ['send', 'Привет']);
  assert.equal(input.value, '');
  await Promise.resolve();
  assert.equal(win.querySelector('.pud-msgr-msg.user span').textContent, 'Привет');

  // Enter отправляет, Shift+Enter нет
  input.value = 'Ещё одно';
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
  assert.equal(bridge.calls.filter(call => call[0] === 'send').length, 1);
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(bridge.calls.filter(call => call[0] === 'send').length, 2);

  bridge.set({ proposal: 'Ran is gentler.' });
  assert.match(win.querySelector('.pud-msgr-plaque').textContent, /Ran is gentler\./);
  [...win.querySelectorAll('.pud-msgr-plaque button')].find(item => item.textContent === 'Ещё не всё').click();
  assert.deepEqual(bridge.calls.at(-1), ['answer', 'more']);
  await Promise.resolve();
  assert.equal(win.querySelector('.pud-msgr-plaque'), null);

  // договорённости: список, выключатель
  win.querySelector('[data-act="notes"]').click();
  assert.match(win.querySelector('.pud-msgr-notes-body').textContent, /Be gentle\./);
  const toggle = win.querySelector('[data-toggle="c1"]');
  toggle.checked = false;
  toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(bridge.calls.at(-1), ['conclusion', { id: 'c1', op: 'toggle' }]);

  win.querySelector('[data-act="settings"]').click();
  assert.deepEqual(opened, ['assistants'], 'шестерёнка ведёт в настройки ассистентов');

  win.querySelector('[data-act="min"]').click();
  assert.ok(win.hidden);
  // ответ пришёл, пока чат свёрнут: на кнопке точка
  bridge.set({ messages: [...bridge.assistant.view().messages, { role: 'assistant', text: 'Ответ' }] });
  assert.ok(!button.querySelector('.pud-msgr-dot').hidden, 'непрочитанное');
  button.click();
  assert.ok(button.querySelector('.pud-msgr-dot').hidden);

  undo();
  assert.equal(document.getElementById(MESSENGER_BUTTON_ID), null);
  assert.equal(document.getElementById(MESSENGER_ID), null);
});

test('вкладка «Ассистенты»: выбрать ассистента, свой характер и обращения, API', async () => {
  const dom = tavern();
  const { document } = dom.window;
  const bridge = fakeBridge();
  const pane = document.createElement('section');
  document.body.append(pane);
  let removed = 0;
  const undo = startAssistants(document, { bridge, shared: {}, hub: { addTab: () => ({ pane, remove: () => { removed += 1; } }) } });
  assert.equal(pane.querySelectorAll('.pud-asst').length, 3, 'три готовых, своих пока нет');
  pane.querySelector('[data-add-own]').click();
  await Promise.resolve();
  assert.deepEqual(bridge.calls.at(-1), ['settings', { addCustom: true }]);
  assert.equal(pane.querySelectorAll('.pud-asst').length, 4, 'добавлен свой ассистент');
  pane.querySelector('[data-add-own]').click();
  await Promise.resolve();
  assert.equal(pane.querySelectorAll('.pud-asst').length, 5, 'их можно добавлять сколько угодно');
  assert.match(pane.textContent, /цвет мой, цветочек, солнышко/);

  pane.querySelector('[data-id="dias"] [data-act="pick"]').click();
  assert.deepEqual(bridge.calls.at(-1), ['settings', { assistant: 'dias' }]);
  await Promise.resolve();
  assert.ok(pane.querySelector('[data-id="dias"]').classList.contains('on'));

  const addresses = pane.querySelector('[data-own="addresses"]');
  addresses.value = 'босс, шеф';
  addresses.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(bridge.calls.at(-1), ['settings', { editCustom: { id: 'own1', addresses: 'босс, шеф' } }]);
  await Promise.resolve();
  assert.match(pane.textContent, /босс, шеф/);

  const first = pane.querySelector('[data-id="own1"] [data-act="del"]');
  first.click();
  assert.match(pane.querySelector('[data-id="own1"] [data-act="del"]').textContent, /Точно удалить/, 'первое нажатие только предупреждает');
  assert.equal(pane.querySelectorAll('.pud-asst').length, 5);
  pane.querySelector('[data-id="own1"] [data-act="del"]').click();
  await Promise.resolve();
  assert.equal(pane.querySelectorAll('.pud-asst').length, 4, 'второе нажатие удаляет');

  const select = pane.querySelector('[data-field="profile"]');
  assert.ok([...select.options].some(option => option.value === 'p1'), 'профили подключений в списке');
  select.value = 'p1';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(bridge.calls.at(-1), ['settings', { profileId: 'p1' }]);

  undo();
  assert.equal(removed, 1);
});
