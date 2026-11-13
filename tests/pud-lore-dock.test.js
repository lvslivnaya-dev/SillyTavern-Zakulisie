/** Редактор лорбука сбоку от библиотеки: открывается рядом, тот же лорбук закрывает, другой подменяет, «во 2 вкладке». */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { migrateSettings } from '../src/pud/core/settings.js';
import { startLoreEditor } from '../src/pud/ui/lore-editor.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const entries = text => ({ entries: { 0: { uid: 0, key: ['к'], keysecondary: [], comment: text, content: text, constant: false, vectorized: false, selective: true, selectiveLogic: 0, position: 0, order: 100, depth: 4, displayIndex: 0 } } });

test('редактор сбоку: рядом с библиотекой, повторный клик закрывает, другой лорбук подменяет, 2-я вкладка отдельная', async () => {
  const { window } = new JSDOM('<!doctype html><body><div id="top-settings-holder"></div></body>', { pretendToBeVisual: true });
  const { document } = window;
  const books = { Альфа: entries('альфа'), Бета: entries('бета') };
  const api = {
    ready: async () => {}, names: () => Object.keys(books), selected: () => [], load: async name => structuredClone(books[name]), save: async () => {},
    newEntry: () => 1, keyMap: () => ({ comment: 'comment', key: 'keys' }), setOriginal() {}, deleteOriginal() {}, splitKeys: text => text.split(','),
    tokens: async () => 1, setGlobal() {}, moveEntry: async () => true, editorBook: () => '', closeNativeEditor() {},
  };
  const settings = migrateSettings({});
  const shared = {};
  const undo = startLoreEditor(document, { context: { characters: [], eventTypes: {} }, settings, save() {}, api, shared });
  const library = { rect: { left: 20, top: 50, width: 500, height: 600 }, isOpen: true };
  const editor = () => document.querySelector('[data-win="loreeditor"]');
  const bookName = () => editor().querySelector('[data-tool="book"]').selectedOptions[0]?.textContent;

  assert.equal(await shared.loreEditor.toggleDocked('Альфа', library), true);
  await wait(30);
  assert.equal(editor().hidden, false, 'редактор открылся');
  assert.equal(editor().style.left, '528px', 'встал справа от библиотеки (20 + 500 + зазор 8)');
  assert.equal(editor().style.top, '50px');
  assert.equal(editor().style.height, '600px', 'той же высоты');
  assert.equal(bookName(), 'Альфа');

  assert.equal(await shared.loreEditor.toggleDocked('Бета', library), true);
  await wait(30);
  assert.equal(editor().hidden, false);
  assert.equal(bookName(), 'Бета', 'другой лорбук подменил содержимое, окно то же');

  library.rect = { left: 40, top: 80, width: 500, height: 500 };
  shared.loreEditor.follow();
  assert.equal(editor().style.left, '548px', 'за переехавшей библиотекой едет и редактор');

  assert.equal(await shared.loreEditor.toggleDocked('Бета', library), false, 'второй клик по тому же лорбуку закрывает');
  assert.equal(editor().hidden, true);

  await shared.loreEditor.toggleDocked('Альфа', library);
  await wait(30);
  editor().querySelector('[data-tool="second"]').click();
  await wait(60);
  const second = document.querySelector('[data-win="loreeditor2"]');
  assert.ok(second, 'появилась вторая вкладка');
  assert.equal(second.hidden, false);
  assert.ok(!second.querySelector('[data-tool="second"]'), 'у второй вкладки нет своей кнопки «во 2 вкладке»');
  assert.equal(second.querySelector('[data-tool="book"]').selectedOptions[0]?.textContent, 'Альфа');
  assert.equal(editor().hidden, false, 'первый редактор остался на месте');

  undo();
  assert.equal(document.querySelector('[data-win="loreeditor2"]'), null);
});
