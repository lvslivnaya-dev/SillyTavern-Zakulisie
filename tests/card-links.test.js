/** A card finds its character by an exact name only; several candidates wait for the user's choice. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addFolder, addLibraryCharacter, applyOperation, createDefaultState, createEntity, createOperation, emptyLibrary } from '../src/core/index.js';
import { entityForCard, linkCards } from '../src/integration/card-links.js';

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
