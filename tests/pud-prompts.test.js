import test from 'node:test';
import assert from 'node:assert/strict';
import { addPrompt, defaultPromptText, duplicatePrompt, normalizePrompts, removePrompt, setDefaultPrompt, updatePrompt } from '../src/pud/core/prompts.js';
import { defaultSettings, migrateSettings } from '../src/pud/core/settings.js';

test('промпты: добавить, править, дублировать, удалить', () => {
  let { prompts, id } = addPrompt([], { name: 'Нарратор', text: 'Ты нарратор.' });
  assert.equal(prompts.length, 1);
  prompts = updatePrompt(prompts, id, { text: 'Ты строгий нарратор.' });
  assert.equal(prompts[0].text, 'Ты строгий нарратор.');
  const copy = duplicatePrompt(prompts, id);
  assert.equal(copy.prompts.length, 2);
  assert.equal(copy.prompts[1].name, 'Нарратор (копия)');
  assert.notEqual(copy.prompts[1].id, id);
  assert.equal(removePrompt(copy.prompts, id).length, 1);
});

test('промпты: «по умолчанию» один на всех и снимается повторным выбором', () => {
  let { prompts, id } = addPrompt([], { name: 'А', text: 'aaa' });
  const second = addPrompt(prompts, { name: 'Б', text: 'bbb' });
  prompts = setDefaultPrompt(second.prompts, id);
  assert.equal(defaultPromptText(prompts), 'aaa');
  prompts = setDefaultPrompt(prompts, second.id);
  assert.equal(defaultPromptText(prompts), 'bbb');
  assert.equal(prompts.filter(item => item.isDefault).length, 1);
  assert.equal(defaultPromptText(setDefaultPrompt(prompts, second.id)), '');
  assert.equal(defaultPromptText([]), '');
});

test('промпты: мусор в настройках чистится, повторяющиеся id и два «по умолчанию» исправляются', () => {
  const list = normalizePrompts([null, 5, { id: 'x', name: 'А', text: 'a', isDefault: true }, { id: 'x', name: 'Б', isDefault: true }]);
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
  assert.equal(list.filter(item => item.isDefault).length, 1);
  assert.deepEqual(normalizePrompts('нет'), []);
  assert.deepEqual(migrateSettings({}).prompts, []);
  assert.deepEqual(defaultSettings().prompts, []);
});

test('вкладка «Промпты»: создать, написать текст, отметить по умолчанию, удалить; откат убирает вкладку', async () => {
  const { JSDOM } = await import('jsdom');
  const { startHub } = await import('../src/pud/ui/hub.js');
  const { startPrompts } = await import('../src/pud/ui/prompts.js');
  const win = new JSDOM('<!doctype html><body><div id="top-settings-holder"></div></body>', { pretendToBeVisual: true }).window;
  const { document } = win;
  const settings = { windows: {}, prompts: [] };
  let saves = 0;
  const shared = {};
  const undoHub = startHub(document, { settings, save() {}, stopAll() {}, shared });
  const undo = startPrompts(document, { settings, save: () => { saves += 1; }, hub: shared.hub });

  assert.equal(document.querySelector('.pud-hub .pud-win-title, .pud-hub')?.textContent.includes('Закулисье'), true, 'окно настроек называется Закулисье');
  assert.ok(document.querySelector('[data-tab="prompts"]'), 'есть вкладка «Промпты»');
  assert.ok(document.querySelector('.pud-prompt-grid').textContent.includes('Пока ничего нет'));

  document.querySelector('.pud-prompt-add').click();
  assert.equal(settings.prompts.length, 1);
  const editor = document.querySelector('.pud-prompt-win');
  assert.equal(editor.hidden, false, 'окно правки открылось');
  const name = editor.querySelector('.pud-prompt-name');
  const text = editor.querySelector('.pud-prompt-text');
  name.value = 'Мой нарратор';
  name.dispatchEvent(new win.Event('input'));
  text.value = 'Ты нарратор. Пиши от третьего лица.';
  text.dispatchEvent(new win.Event('input'));
  assert.equal(settings.prompts[0].name, 'Мой нарратор');
  assert.equal(settings.prompts[0].text, 'Ты нарратор. Пиши от третьего лица.');
  assert.ok(saves >= 3, 'правки сохраняются сами');
  assert.ok(document.querySelector('.pud-prompt-card').textContent.includes('Ты нарратор'));

  document.querySelector('[data-act="default"]').click();
  assert.equal(settings.prompts[0].isDefault, true);
  assert.ok(document.querySelector('.pud-prompt-card.on'));

  document.querySelector('[data-act="del"]').click();
  assert.deepEqual(settings.prompts, []);
  assert.equal(editor.hidden, true, 'окно правки закрылось вместе с удалённым промптом');

  undo();
  assert.equal(document.querySelector('[data-tab="prompts"]'), null);
  undoHub();
});
