/** Records between characters: one kind with a type, tied to cards, an AU, sent when everyone is on stage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addBond, addFolder, addLibraryCharacter, buildBondsPrompt, cleanBonds, emptyLibrary, normalizeLibrary, removeBond, selectBonds, updateBond } from '../src/core/index.js';

function sample() {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Герои' });
  const ran = addLibraryCharacter(library, { folderId: folder.id, name: 'Ран' });
  const suzu = addLibraryCharacter(ran.library, { folderId: folder.id, name: 'Судзу', persona: true });
  const mikey = addLibraryCharacter(suzu.library, { folderId: folder.id, name: 'Майки' });
  return { library: mikey.library, ran: ran.character, suzu: suzu.character, mikey: mikey.character };
}

test('a record has a type, a text and cards; the tidy-up fixes the rest', () => {
  const { library, ran, suzu } = sample();
  const made = addBond(library, { type: 'tension', text: '  Он злится,\n\n\n\nно молчит ', cardIds: [ran.id, suzu.id, suzu.id, ''] });
  assert.deepEqual([made.bond.type, made.bond.text, made.bond.cardIds], ['tension', 'Он злится,\n\nно молчит', [ran.id, suzu.id]]);
  assert.equal(cleanBonds([{ text: 'x', type: 'weird', cardIds: ['a'] }])[0].type, 'headcanon', 'an unknown type is a headcanon');
  assert.throws(() => addBond(library, { text: '', cardIds: [ran.id] }), /текст/);
  assert.throws(() => addBond(library, { text: 'Привычка', cardIds: [] }), /одному герою/);
});

test('a record is changed, switched off and removed in the library', () => {
  const { library, ran, suzu } = sample();
  const { library: one, bond } = addBond(library, { type: 'memory', text: 'Они вместе ходили на фестиваль', cardIds: [ran.id, suzu.id] });
  const off = updateBond(one, bond.id, { off: true, au: ['au1'] });
  assert.deepEqual([off.bonds[0].off, off.bonds[0].au], [true, ['au1']]);
  assert.equal(updateBond(off, bond.id, { off: false }).bonds[0].off, undefined);
  assert.equal(removeBond(one, bond.id).bonds.length, 0);
  assert.throws(() => updateBond(one, 'nope', { text: 'x' }), /нет/);
});

test('it goes out when everyone it is tied to is on stage and its AU is on', () => {
  const { library, ran, suzu, mikey } = sample();
  let lib = addBond(library, { type: 'headcanon', text: 'Ран провожает её домой', cardIds: [ran.id, suzu.id] }).library;
  lib = addBond(lib, { type: 'memory', text: 'Общий фестиваль', cardIds: [ran.id, suzu.id], au: ['univer'] }).library;
  lib = addBond(lib, { type: 'tension', text: 'Спор о деньгах', cardIds: [mikey.id], au: [] }).library;
  const pick = (here, au = []) => selectBonds(lib.bonds, { presentCardIds: here, activeAu: au }).map(bond => bond.text);
  assert.deepEqual(pick([ran.id]), [], 'one of the two is missing');
  assert.deepEqual(pick([ran.id, suzu.id]), ['Ран провожает её домой'], 'the one with an AU waits');
  assert.deepEqual(pick([ran.id, suzu.id], ['univer']), ['Ран провожает её домой', 'Общий фестиваль']);
  assert.deepEqual(pick([ran.id, suzu.id, mikey.id], ['mafia']), ['Ран провожает её домой', 'Спор о деньгах'], 'another AU is on');
  const switchedOff = updateBond(lib, lib.bonds[0].id, { off: true });
  assert.deepEqual(selectBonds(switchedOff.bonds, { presentCardIds: [ran.id, suzu.id] }), []);
});

test('the block says who it is about, by the names of the cards', () => {
  const { library, ran, suzu } = sample();
  const lib = addBond(library, { type: 'memory', text: 'Они помнят дождь', cardIds: [ran.id, suzu.id] }).library;
  const names = new Map(lib.characters.map(card => [card.id, card.name]));
  const block = buildBondsPrompt(lib.bonds, { presentCardIds: [ran.id, suzu.id], cardNames: names });
  assert.match(block, /^\[BONDS/);
  assert.match(block, /memory\[Ран, Судзу\]: Они помнят дождь/);
  assert.equal(buildBondsPrompt(lib.bonds, { presentCardIds: [ran.id], cardNames: names }), '', 'nothing to say: no block');
});

test('after loading, a record keeps only cards that still exist, and one with none left goes', () => {
  const { library, ran, suzu } = sample();
  const lib = addBond(addBond(library, { type: 'memory', text: 'Первая', cardIds: [ran.id, suzu.id] }).library, { type: 'memory', text: 'Вторая', cardIds: [suzu.id] }).library;
  const without = { ...lib, characters: lib.characters.filter(card => card.id !== suzu.id) };
  const loaded = normalizeLibrary(JSON.parse(JSON.stringify(without)));
  assert.deepEqual(loaded.bonds.map(bond => [bond.text, bond.cardIds]), [['Первая', [ran.id]]]);
  assert.equal(normalizeLibrary(emptyLibrary()).bonds, undefined, 'no records: no field');
});

test('a section of a card can be for some AU only: kept in the tidy-up, and for a persona it waits until the AU is on', async () => {
  const { makeSection, buildPersonaPrompt } = await import('../src/core/index.js');
  assert.deepEqual(makeSection({ kind: 'visual', text: 'x', au: ['u1', 'u1', ''] }).au, ['u1']);
  assert.equal(makeSection({ kind: 'visual', text: 'x', au: [] }).au, undefined, 'none: for all');
  const card = { name: 'Рика', sections: [makeSection({ kind: 'visual', title: 'Visual', text: 'Рыжая' }), makeSection({ kind: 'other', title: 'Univer', text: 'Студентка', au: ['univer'] })], records: [] };
  assert.doesNotMatch(buildPersonaPrompt(card, { activeAu: [] }), /Студентка/);
  assert.match(buildPersonaPrompt(card, { activeAu: ['univer'] }), /Студентка/);
  assert.match(buildPersonaPrompt(card, { activeAu: [] }), /Рыжая/, 'a section with no AU always goes');
});

test('records between characters travel with their cards: exported with a folder, tied to the new cards on import, no repeats', async () => {
  const { exportLibrary, importLibrary } = await import('../src/core/index.js');
  const { library, ran, suzu } = sample();
  const lib = addBond(library, { type: 'memory', text: 'Они помнят дождь', cardIds: [ran.id, suzu.id], au: ['au1'] }).library;
  const folderId = lib.folders[0].id;
  const file = JSON.parse(JSON.stringify(exportLibrary(lib, folderId)));
  assert.equal(file.bonds.length, 1);
  const done = importLibrary(emptyLibrary(), file, '');
  const names = new Map(done.library.characters.map(card => [card.id, card.name]));
  assert.equal(done.bondsAdded, 1);
  assert.deepEqual(done.library.bonds[0].cardIds.map(id => names.get(id)).sort(), ['Ран', 'Судзу']);
  assert.ok(!done.library.bonds[0].cardIds.includes(ran.id), 'tied to the new cards, not to the ids of the file');
  assert.equal(importLibrary(done.library, file, '').bondsAdded, 0, 'the second import repeats nothing');
  const whole = exportLibrary(lib);
  assert.equal(whole.bonds.length, 1);
  const onlyOne = addBond(lib, { type: 'tension', text: 'Спор', cardIds: [ran.id] }).library;
  assert.equal(exportLibrary(onlyOne, folderId).bonds.length, 2);
});

test('a memory has a strength and can be pinned: the strongest go first, a pinned one stays whatever the size', () => {
  const { library, ran, suzu } = sample();
  const ids = [ran.id, suzu.id];
  let lib = addBond(library, { type: 'memory', text: 'Слабое', cardIds: ids, intensity: 1 }).library;
  lib = addBond(lib, { type: 'tension', text: 'Сильное', cardIds: ids, intensity: 5 }).library;
  lib = addBond(lib, { type: 'memory', text: 'Закреплённое слабое', cardIds: ids, intensity: 1, pinned: true }).library;
  lib = addBond(lib, { type: 'headcanon', text: 'Привычка', cardIds: ids }).library;
  assert.deepEqual([lib.bonds[1].intensity, lib.bonds[2].pinned, lib.bonds[3].intensity], [5, true, undefined]);
  assert.equal(cleanBonds([{ text: 'x', cardIds: ['a'], intensity: 9 }])[0].intensity, 5, 'clamped to 1–5');
  const names = new Map(lib.characters.map(card => [card.id, card.name]));
  const lines = buildBondsPrompt(lib.bonds, { presentCardIds: ids, cardNames: names }).split('\n').filter(line => /^(memory|tension|headcanon)\[/.test(line));
  assert.deepEqual(lines.map(line => line.split(': ')[1]), ['Закреплённое слабое', 'Сильное', 'Привычка', 'Слабое'], 'pinned, then strongest, the rest as they came (no strength = 3)');
  const tight = buildBondsPrompt(lib.bonds, { presentCardIds: ids, cardNames: names, maxCharacters: 300 });
  assert.match(tight, /Закреплённое слабое/, 'a pinned record is not cut by the limit');
});
