import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  duplicateEntry, entryTitle, filterEntries, originalTarget, parseField, sortEntries, strategyOf, strategyPatch,
} from '../src/pud/core/lore-entries.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { startLoreEditor } from '../src/pud/ui/lore-editor.js';

const book = () => ({
  entries: {
    0: { uid: 0, key: ['Судзу'], keysecondary: [], comment: 'Судзу', content: 'Младшая Хайтани.', constant: false, vectorized: false, selective: true, selectiveLogic: 0, position: 0, order: 100, depth: 4, displayIndex: 1, disable: false },
    3: { uid: 3, key: ['Ран'], keysecondary: [], comment: '', content: 'Старший брат.', constant: true, vectorized: false, selective: true, selectiveLogic: 0, position: 1, order: 50, depth: 4, displayIndex: 0, disable: false },
  },
});

test('записи: стратегия, название, поиск, сортировка, копия, поля для originalData', () => {
  const data = book();
  assert.equal(strategyOf(data.entries[3]), 'constant');
  assert.deepEqual(strategyPatch('vector'), { constant: false, vectorized: true });
  assert.equal(entryTitle(data.entries[3]), 'Ран');
  assert.deepEqual(filterEntries(Object.values(data.entries), 'брат').map(entry => entry.uid), [3]);
  assert.deepEqual(sortEntries(Object.values(data.entries)).map(entry => entry.uid), [3, 0], 'как в таверне: по displayIndex');
  assert.deepEqual(sortEntries(Object.values(data.entries), 'order').map(entry => entry.uid), [0, 3]);
  const copy = duplicateEntry(data, 0);
  assert.equal(copy.uid, 1);
  assert.equal(copy.comment, 'Судзу (копия)');
  assert.deepEqual(originalTarget('disable', true, {}), ['enabled', false]);
  assert.deepEqual(originalTarget('key', ['a'], { key: 'keys' }), ['keys', ['a']]);
  assert.equal(parseField('probability', '150'), 100);
  assert.equal(parseField('sticky', ''), null);
  assert.equal(parseField('caseSensitive', 'false'), false);
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('редактор: открыть, править с автосохранением, ключи под ключами, родная шторка ведёт сюда', async () => {
  const { window } = new JSDOM(`<!doctype html><body>
    <div id="top-settings-holder"><div id="WI-SP-button" class="drawer"><div id="WIDrawerIcon" class="drawer-icon closedIcon"></div><div id="WorldInfo" class="drawer-content closedDrawer"></div></div></div>
    <select id="world_editor_select"><option value="">--</option><option value="0">Хайтани Судзу</option><option value="1">One Piece</option></select>
  </body>`, { pretendToBeVisual: true });
  const { document } = window;
  const books = { 'Хайтани Судзу': book(), 'One Piece': { entries: {} } };
  const saved = [];
  const api = {
    ready: async () => {},
    names: () => Object.keys(books),
    selected: () => [],
    load: async name => structuredClone(books[name]),
    save: async (name, data) => { saved.push([name, structuredClone(data)]); books[name] = structuredClone(data); },
    newEntry: (name, data) => { const uid = Math.max(...Object.keys(data.entries).map(Number), -1) + 1; data.entries[uid] = { uid, key: [], keysecondary: [], comment: '', content: '', position: 0, order: 100 }; return data.entries[uid]; },
    keyMap: () => ({ comment: 'comment', key: 'keys' }),
    setOriginal: () => {},
    deleteOriginal: () => {},
    splitKeys: text => text.split(',').map(item => item.trim()).filter(Boolean),
    tokens: async () => 7,
    setGlobal: () => {},
    moveEntry: async () => true,
    editorBook: doc => doc.getElementById('world_editor_select').selectedOptions[0]?.textContent ?? '',
    closeNativeEditor: () => {},
  };
  const settings = migrateSettings({});
  const shared = {};
  const context = { characters: [], eventTypes: {}, POPUP_TYPE: { CONFIRM: 1 }, callGenericPopup: async () => true };
  const undo = startLoreEditor(document, { context, settings, save() {}, api, shared });
  const native = document.getElementById('WI-SP-button');
  assert.ok(native.classList.contains('pud-replaced'), 'родная шторка спрятана');

  await shared.loreEditor.open('Хайтани Судзу');
  await wait(40);
  const win = document.querySelector('.pud-lored');
  assert.equal(win.querySelectorAll('.pud-lerow').length, 2);
  assert.equal(win.querySelector('.pud-lerow.on').dataset.uid, '3', 'выбрана первая по порядку таверны');
  assert.equal(settings.loreEditor.book, 'Хайтани Судзу');

  // вторичные ключи стоят под основными, между ними логика
  const blocks = [...win.querySelector('.pud-lekeys').children];
  assert.equal(blocks[0].querySelector('[data-keys]').dataset.keys, 'key');
  assert.ok(blocks[1].matches('.pud-lelogic'));
  assert.equal(blocks[2].querySelector('[data-keys]').dataset.keys, 'keysecondary');

  const comment = win.querySelector('[data-f="comment"]');
  comment.value = 'Ран Хайтани';
  comment.dispatchEvent(new window.Event('input', { bubbles: true }));
  const keyInput = win.querySelector('[data-keys="keysecondary"] .pud-keyin');
  keyInput.value = 'брат, Роппонги';
  keyInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(win.querySelectorAll('[data-keys="keysecondary"] .pud-key').length, 2);
  win.querySelector('[data-strategy="normal"]').click();
  const position = win.querySelector('[data-f="position"]');
  position.value = '4';
  position.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(win.querySelector('.pud-lepos-depth').hidden, false, 'глубина видна для «на глубине»');
  await wait(900);
  const last = saved.at(-1)[1].entries[3];
  assert.equal(last.comment, 'Ран Хайтани');
  assert.deepEqual(last.keysecondary, ['брат', 'Роппонги']);
  assert.equal(last.constant, false);
  assert.equal(last.position, 4);
  assert.match(win.querySelector('.pud-lerow[data-uid="3"]').textContent, /Ран Хайтани/);

  // новая запись
  win.querySelector('[data-tool="new"]').click();
  await wait(20);
  assert.equal(win.querySelectorAll('.pud-lerow').length, 3);

  // таверна открывает свою шторку на другом лорбуке → открывается наш редактор на нём
  document.getElementById('world_editor_select').value = '1';
  const nativeIcon = document.getElementById('WIDrawerIcon');
  nativeIcon.classList.replace('closedIcon', 'openIcon');
  await wait(80);
  assert.ok(nativeIcon.classList.contains('closedIcon'));
  assert.equal(win.querySelector('[data-tool="book"]').value, 'One Piece');
  assert.equal(saved.some(([name, data]) => name === 'Хайтани Судзу' && Object.keys(data.entries).length === 3), true, 'новая запись сохранилась при переключении');

  undo();
  assert.equal(native.classList.contains('pud-replaced'), false);
  assert.equal(document.querySelector('.pud-lored'), null);
  assert.equal(shared.loreEditor, undefined);
});
