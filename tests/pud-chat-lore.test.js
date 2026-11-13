import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { chatLoreBooks } from '../src/pud/core/chat-lore.js';
import { loreApi } from '../src/pud/integration/lorebooks-api.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('сводка: каждая книга со всеми путями, по которым она подключена; пропавший файл помечен', () => {
  const books = chatLoreBooks({
    global: ['Мир Токио'],
    cards: [{ avatar: 'ran.png', name: 'Ран', world: 'Бонтен', extras: ['Мир Токио'] }],
    persona: { avatar: 'suzu.png', name: 'Судзу', book: 'Судзу' },
    chat: 'Пропавший',
    known: ['Мир Токио', 'Бонтен', 'Судзу'],
  });
  assert.deepEqual(books.map(book => book.name), ['Бонтен', 'Мир Токио', 'Пропавший', 'Судзу']);
  assert.deepEqual(books[1].via.map(item => item.label), ['глобально', 'доп. у «Ран»']);
  assert.equal(books[2].missing, true);
  assert.deepEqual(books[3].via, [{ kind: 'persona', label: 'персона «Судзу»' }]);
});

test('окно: показывает сводку и правки, правка уходит в таверну и окно перерисовывается', async () => {
  const { window } = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const { document } = window;
  let chat = 'Бонтен';
  let extras = ['Мир Токио'];
  const calls = [];
  const persona = {
    ready: async () => {}, hasChat: () => true, current: () => 'suzu.png', chatBook: () => chat,
    extraBooks: () => [...extras], setExtraBooks: (avatar, books) => { calls.push(['extra', avatar, books]); extras = books; },
    setChatBook: async (doc, name) => { calls.push(['chat', name]); chat = name; },
    update: async (avatar, patch) => { calls.push(['persona', avatar, patch]); },
  };
  const chars = { ready: async () => {}, setWorld: async (avatar, name) => { calls.push(['card', avatar, name]); } };
  const lore = { ready: async () => {}, setGlobal: (doc, name, on) => calls.push(['global', name, on]) };
  const saved = { selected: loreApi.selected, names: loreApi.names };
  loreApi.selected = () => ['Мир Токио'];
  loreApi.names = () => ['Мир Токио', 'Бонтен', 'Судзу'];
  let shown = null;
  globalThis.SillyTavern = { getContext: () => ({
    characterId: 0, characters: [{ avatar: 'ran.png', name: 'Ран', data: { extensions: { world: 'Бонтен' } } }],
    powerUserSettings: { personas: { 'suzu.png': 'Судзу' }, persona_descriptions: { 'suzu.png': { lorebook: 'Судзу' } } },
    POPUP_TYPE: { TEXT: 1 }, callGenericPopup: async box => { shown = box; },
  }) };
  try {
    const { openChatLore } = await import('../src/pud/ui/chat-lore.js');
    await openChatLore(document, { persona, chars, lore });
    assert.ok(shown, 'окно открылось');
    document.body.append(shown);
    assert.match(shown.textContent, /Мир Токио.*глобально.*доп\. у «Ран»/s);
    assert.match(shown.textContent, /Персона «Судзу»/);
    const chatSelect = shown.querySelector('[data-set="chat"]');
    chatSelect.value = '';
    chatSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(0);
    assert.deepEqual(calls.at(-1), ['chat', '']);
    assert.equal(shown.querySelector('[data-set="chat"]').value, '', 'перерисовано: лорбука чата нет');
    shown.querySelector('[data-drop="extra"]').click();
    await wait(0);
    assert.deepEqual(calls.at(-1), ['extra', 'ran.png', []]);
    shown.querySelector('[data-drop="global"]').click();
    await wait(0);
    assert.deepEqual(calls.at(-1), ['global', 'Мир Токио', false]);
  } finally {
    Object.assign(loreApi, saved);
    delete globalThis.SillyTavern;
  }
});
