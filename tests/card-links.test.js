/** A card finds its character by an exact name only; several candidates wait for the user's choice. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addFolder, addLibraryCharacter, applyOperation, createDefaultState, createEntity, createOperation, emptyLibrary } from '../src/core/index.js';
import { autoLinkNarratorCards, cardLinks, entityForCard, linkCards, unlinkCards } from '../src/integration/card-links.js';

function chat(...names) {
  let state = createDefaultState();
  const ids = [];
  for (const name of names) {
    const entity = createEntity(name);
    ids.push(entity.id);
    state = applyOperation(state, createOperation('entity.upsert', entity, { transactionId: 't', reason: 'test', timestamp: '2026-01-01T00:00:00Z' }));
  }
  return { state, ids };
}

test('only an exact name finds the character: a similar sound is not enough, and two candidates are not guessed between', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Бонтен' });
  const card = addLibraryCharacter(library, { folderId: folder.id, name: 'Ран Хайтани', aliases: ['Ран'] }).character;
  const lib = { ...library, characters: [card] };
  const alike = chat('Ран Хаитани');
  assert.equal(entityForCard(alike.state, card), '', 'Хаитани sounds like Хайтани, but it is not the name');
  const linkedAlike = linkCards(alike.state, lib, [card.id]);
  assert.equal(linkedAlike.linked[0].created, true, 'nobody is taken by sound: a new character is made');

  const twins = chat('Ран', 'Ран Хайтани');
  const waiting = linkCards(twins.state, lib, [card.id]);
  assert.equal(waiting.linked.length, 0, 'two characters have the name: the card waits');
  assert.match(waiting.skipped[0].why, /несколько героев/);
  assert.equal(Object.keys(waiting.state.entities).length, 2, 'and nobody new is made');
  const chosen = linkCards(twins.state, lib, [card.id], { [card.id]: twins.ids[1] });
  assert.equal(chosen.linked[0].entityId, twins.ids[1], 'the user picks');
  const fresh = linkCards(twins.state, lib, [card.id], { [card.id]: '__new' });
  assert.equal(fresh.linked[0].created, true);
});

test('карточки одной папки с общей фамилией или кличкой не склеиваются в одного героя при массовом включении', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Бонтен' });
  let lib = library;
  const ids = [];
  for (const name of ['Ран Хайтани', 'Рин Хайтани', 'Кокуджо Такэоми']) {
    const made = addLibraryCharacter(lib, { folderId: folder.id, name, aliases: ['Хайтани', 'Бонтен'] });
    lib = made.library;
    ids.push(made.character.id);
  }
  const result = linkCards(chat().state, lib, ids);
  assert.equal(result.linked.length, 3);
  assert.equal(new Set(result.linked.map(item => item.entityId)).size, 3, 'у каждой карточки свой герой');
  assert.deepEqual(result.replaced, [], 'ни одна карточка никого не вытеснила');
});

test('карточка, вставшая на место другой у того же героя, называется в итоге, а не теряется молча', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'АУ' });
  const one = addLibraryCharacter(library, { folderId: folder.id, name: 'Ран Хайтани (канон)', aliases: ['Ран'] });
  const two = addLibraryCharacter(one.library, { folderId: folder.id, name: 'Ран Хайтани (АУ)', aliases: ['Ран'] });
  const start = chat('Ран');
  const result = linkCards(start.state, two.library, [one.character.id, two.character.id]);
  assert.equal(result.linked.length, 2);
  assert.equal(result.replaced.length, 1, 'у героя одна карточка: вытесненная названа');
});

test('cards tied to the narrator switch on once when its chat opens; one switched off by hand stays off; other narrators are not touched', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Магическая битва' });
  const yuta = addLibraryCharacter(library, { folderId: folder.id, name: 'Юта Оккоцу', narrators: ['Jujutsu.png', 'Jujutsu.png', ''] });
  const gojo = addLibraryCharacter(yuta.library, { folderId: folder.id, name: 'Годжо Сатору', narrators: ['Jujutsu.png'] });
  const cafe = addLibraryCharacter(gojo.library, { folderId: folder.id, name: 'Бариста', narrators: ['Cafe.png'] });
  const lib = cafe.library;
  assert.deepEqual(yuta.character.narrators, ['Jujutsu.png'], 'the narrators are tidy: unique, no empty ones');
  const { state } = chat('Юта Оккоцу');
  const opened = autoLinkNarratorCards(state, lib, 'Jujutsu.png');
  assert.equal(opened.linked.length, 2, 'both cards of this narrator are on');
  assert.equal(cardLinks(opened.state).size, 2);
  assert.ok(![...cardLinks(opened.state).keys()].includes(cafe.character.id), 'the card of another narrator is not');
  // switched off by hand: the next opening does not bring it back
  const off = unlinkCards(opened.state, [yuta.character.id], lib);
  const again = autoLinkNarratorCards(off, lib, 'Jujutsu.png');
  assert.equal(again.linked.length, 0);
  assert.equal(again.state, off);
  assert.equal(cardLinks(again.state).has(yuta.character.id), false);
  // no narrator (a group, no chat): nothing happens
  assert.equal(autoLinkNarratorCards(state, lib, '').state, state);
  // a card tied to a narrator LATER is taken at the next opening
  const late = addLibraryCharacter(lib, { folderId: folder.id, name: 'Нанами', narrators: ['Jujutsu.png'] });
  assert.equal(autoLinkNarratorCards(again.state, late.library, 'Jujutsu.png').linked.length, 1);
});
