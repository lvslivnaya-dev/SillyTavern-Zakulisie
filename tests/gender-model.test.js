/** Gender: set on a card, in the dossier or when a character is added; the narrator reads it together with the rest. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFolder, addLibraryCharacter, applyOperations, buildPersonaPrompt, createDefaultState, createEntity, createOperation, duplicateLibraryCharacter,
  emptyLibrary, normalizeLibrary, selectKnowledgeLines, updateLibraryCharacter,
} from '../src/core/index.js';
import { linkCards } from '../src/integration/card-links.js';
import { planCards } from '../src/integration/card-prompt.js';

const home = () => { const folder = addFolder(emptyLibrary(), { name: 'Герои' }); return { library: folder.library, folderId: folder.folder.id }; };

test('a card keeps its gender; anything but male or female takes it off; a copy keeps it', () => {
  const { library, folderId } = home();
  const added = addLibraryCharacter(library, { folderId, name: 'Эмма', gender: 'female' });
  assert.equal(added.character.gender, 'female');
  const cleared = updateLibraryCharacter(added.library, added.character.id, { gender: '' });
  assert.equal(cleared.characters[0].gender, undefined);
  const set = updateLibraryCharacter(cleared, added.character.id, { gender: 'male' });
  assert.equal(set.characters[0].gender, 'male');
  assert.equal(normalizeLibrary(JSON.parse(JSON.stringify(set))).characters[0].gender, 'male', 'survives a reload');
  const copy = duplicateLibraryCharacter(set, added.character.id);
  assert.equal(copy.character.gender, 'male');
});

test('the narrator is told the gender: in the knowledge block, in the card sheet and in the persona block', () => {
  const ran = createEntity('Ран');
  const emma = createEntity('Эмма');
  let state = applyOperations(createDefaultState(), [ran, emma].map(entity => createOperation('entity.upsert', entity)));
  state = applyOperations(state, [createOperation('scene.set', { presentIds: [ran.id, emma.id], location: '' })]);
  state = { ...state, ui: { ...state.ui, genders: { [ran.id]: 'male' } } };
  const lines = selectKnowledgeLines(state, { genders: { [emma.id]: 'female', [ran.id]: 'female' } });
  assert.ok(lines.some(line => line === 'gender: Ран=male, Эмма=female'), 'the chat\'s own choice outranks the card\'s');
  assert.ok(!selectKnowledgeLines(applyOperations(createDefaultState(), [createOperation('entity.upsert', ran)])).some(line => line.startsWith('gender:')), 'nothing is said when nothing is known');

  const { library, folderId } = home();
  const card = addLibraryCharacter(library, { folderId, name: 'Эмма', gender: 'female', sections: [{ kind: 'basic', title: 'Basic', text: 'Тихая и упрямая.' }] });
  const linked = linkCards(state, card.library, [card.character.id], { [card.character.id]: emma.id });
  const planned = planCards({ state: { ...linked.state, ui: { ...linked.state.ui, genders: {} } }, library: card.library, config: {}, presentIds: [emma.id] });
  assert.match(planned.block, /## Эмма \(female\)/);

  const persona = buildPersonaPrompt({ name: 'Лиза', gender: 'female', sections: [{ kind: 'visual', title: 'Visual', text: 'Рыжая.' }], records: [] });
  assert.match(persona, /gender: female/);
});

test('a surname two characters share names only the one on stage', async () => {
  const { namedInText } = await import('../src/integration/lore-gate.js');
  const { mentionedEntities } = await import('../src/integration/headcanon-retrieval.js');
  const first = createEntity('Ран Милкович', { aliases: ['Милкович'] });
  const second = createEntity('Ник Милкович', { aliases: ['Милкович'] });
  const people = [first, second];
  assert.deepEqual([...namedInText('Милкович вошёл в зал.', people, new Set([first.id]))], [first.id], 'the one on stage');
  assert.deepEqual([...namedInText('Милкович вошёл в зал.', people, new Set())], [], 'nobody on stage: nobody is named');
  assert.deepEqual([...namedInText('Ник Милкович вошёл.', people, new Set([first.id]))].sort(), [first.id, second.id].sort(), 'the first name still calls its owner');
  let state = applyOperations(createDefaultState(), people.map(entity => createOperation('entity.upsert', entity)));
  state = applyOperations(state, [createOperation('scene.set', { presentIds: [first.id], location: '' })]);
  assert.deepEqual([...mentionedEntities(state, 'Милкович смеётся')], [first.id]);
});

test('taking a card off removes the hero it made, if nothing happened to him; one that was there before stays', async () => {
  const { unlinkCards } = await import('../src/integration/card-links.js');
  const { library, folderId } = home();
  const first = addLibraryCharacter(library, { folderId, name: 'Мика' });
  const second = addLibraryCharacter(first.library, { folderId, name: 'Тора' });
  const old = createEntity('Тора');
  let state = applyOperations(createDefaultState(), [createOperation('entity.upsert', old)]);
  const linked = linkCards(state, second.library, [first.character.id, second.character.id]);
  assert.equal(Object.keys(linked.state.entities).length, 2, 'Мика appeared, Тора was already there');
  const after = unlinkCards(linked.state, [first.character.id, second.character.id]);
  assert.deepEqual(Object.values(after.entities).map(entity => entity.name), ['Тора']);
  assert.equal(after.ui.cardMade, undefined);
});

test('a hero linked before the mark existed (same name as the card, not from the tavern) also leaves with the card', async () => {
  const { unlinkCards } = await import('../src/integration/card-links.js');
  const { library, folderId } = home();
  const card = addLibraryCharacter(library, { folderId, name: 'Мика' });
  const linked = linkCards(createDefaultState(), card.library, [card.character.id]);
  const oldState = { ...linked.state, ui: { ...linked.state.ui } };
  delete oldState.ui.cardMade;
  const after = unlinkCards(oldState, [card.character.id], card.library);
  assert.deepEqual(Object.keys(after.entities), []);
});

test('a shared surname that stuck to one hero does not make him the hero of the relative\'s card', () => {
  const { library, folderId } = home();
  const ran = addLibraryCharacter(library, { folderId, name: 'Ран', aliases: ['Хайтани'] });
  const rindo = addLibraryCharacter(ran.library, { folderId, name: 'Риндо', aliases: ['Хайтани'] });
  const hero = createEntity('Ран', { aliases: ['Хайтани'] });
  const state = applyOperations(createDefaultState(), [createOperation('entity.upsert', hero)]);
  const result = linkCards(state, rindo.library, [rindo.character.id]);
  assert.equal(Object.keys(result.state.entities).length, 2, 'Риндо is a new hero, Ран is not taken over');
  assert.equal(result.state.entities[hero.id].name, 'Ран');
});
