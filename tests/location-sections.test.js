/** A location note with ### headings becomes a place with parts inside it (Obsidian → library). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDrafts, emptyLibrary, addFolder } from '../src/core/location-library.js';
import { draftsFromMarkdownFiles, draftsFromMarkdownNote } from '../src/integration/location-import.js';

const HOUSE = `---
Fandom: Бесстыжие
keys:
  - дом Галлагеров
  - домой
---
### Дом Галлагеров
Двухэтажный дом. Маршрут: крыльцо, прихожая, кухня.

### Прихожая
%% основные: прихожая Галлагеров, вешалка у двери %%
Узкая прихожая с вешалкой.

### Ванная
%% основные: ванная, душ* %%
Единственная ванная на дом.

# Translate

[ Дом Галлагеров ] - Прихожая

The Entryway
Narrow.
`;

test('headings become places inside the main place, the first section named like the note is the main one', () => {
  const drafts = draftsFromMarkdownNote('Локации/Дом Галлагеров.md', HOUSE);
  assert.deepEqual(drafts.map(draft => draft.name), ['Дом Галлагеров', 'Прихожая (Дом Галлагеров)', 'Ванная (Дом Галлагеров)']);
  assert.match(drafts[0].description, /Маршрут/);
  assert.deepEqual(drafts[0].aliases, ['дом Галлагеров', 'домой']);
  assert.deepEqual(drafts[1].aliases, ['прихожая Галлагеров', 'вешалка у двери']);
  assert.deepEqual(drafts[2].aliases, ['ванная', 'душ']);
  assert.equal(drafts[1].parentName, 'Дом Галлагеров');
  assert.ok(!drafts.some(draft => /Entryway|Narrow/.test(draft.description)), 'the English copy is not a part');
});

test('importing: parts stand inside the main place, two houses may both have a «Ванная»', () => {
  let lib = emptyLibrary();
  const folder = addFolder(lib, { name: 'Бесстыжие' });
  lib = folder.library;
  const drafts = draftsFromMarkdownFiles([
    { path: 'Локации/Дом Галлагеров.md', text: HOUSE },
    { path: 'Локации/Дом Милковичей.md', text: '### Дом Милковичей\nСтарый дом.\n\n### Ванная\nУзкая, ржавая.' },
  ], { split: true });
  const result = addDrafts(lib, drafts, folder.folder.id);
  assert.equal(result.skipped.length, 0);
  const byName = name => result.library.locations.find(place => place.name === name);
  assert.equal(byName('Ванная (Дом Галлагеров)').parentId, byName('Дом Галлагеров').id);
  assert.equal(byName('Ванная (Дом Милковичей)').parentId, byName('Дом Милковичей').id);
});

test('without split and without headings a note stays one place', () => {
  assert.equal(draftsFromMarkdownFiles([{ path: 'Л/Дом.md', text: HOUSE }]).length, 1);
  assert.equal(draftsFromMarkdownNote('Л/Бар.md', 'Тёмный бар.').length, 1);
});

test('a long thing is cut into parts only when it does not fit into one card', () => {
  const note = `---\nвладелец: Рипер\n---\n### Рипер\nЖивое оружие.\n\n### Форма: Коса\n${'А'.repeat(2100)}\n\n### Форма: Меч\nКороткая.`;
  assert.equal(draftsFromMarkdownFiles([{ path: 'Оружие/Рипер.md', text: note }], { split: true, longerThan: 2000 }).length, 3);
  assert.equal(draftsFromMarkdownFiles([{ path: 'Оружие/Меч.md', text: '### Меч\nКоротко.\n\n### Форма: Клинок\nТоже коротко.' }], { split: true, longerThan: 2000 }).length, 1);
  assert.equal(draftsFromMarkdownFiles([{ path: 'Оружие/Рипер.md', text: note }], { split: true, longerThan: 2000 })[1].ownerName, 'Рипер');
});
