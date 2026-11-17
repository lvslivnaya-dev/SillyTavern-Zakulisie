import test from 'node:test';
import assert from 'node:assert/strict';
import { addLibraryCharacter, emptyLibrary, normalizeLibrary, updateLibraryCharacter } from '../src/core/index.js';
import { cleanBirthday } from '../src/core/location-library.js';

test('a birthday is a day and a month with no year; broken ones are not kept', () => {
  assert.equal(cleanBirthday('3-7'), '03-07');
  assert.equal(cleanBirthday('02-29'), '02-29');
  assert.equal(cleanBirthday('02-30'), '');
  assert.equal(cleanBirthday('13-01'), '');
  assert.equal(cleanBirthday('1990-03-07'), '');
  assert.equal(cleanBirthday(''), '');
});

test('a card keeps its birthday through saving and reloading; empty clears it; a persona card has one too', () => {
  let library = emptyLibrary();
  const made = addLibraryCharacter(library, { name: 'Оккоцу Юта', birthday: '3-7' });
  library = made.library;
  assert.equal(made.character.birthday, '03-07');
  library = updateLibraryCharacter(library, made.character.id, { birthday: '12-25' });
  assert.equal(library.characters[0].birthday, '12-25');
  assert.equal(normalizeLibrary(JSON.parse(JSON.stringify(library))).characters[0].birthday, '12-25');
  library = updateLibraryCharacter(library, made.character.id, { name: 'Юта' });
  assert.equal(library.characters[0].birthday, '12-25', 'other changes leave it');
  library = updateLibraryCharacter(library, made.character.id, { birthday: '' });
  assert.equal(library.characters[0].birthday, undefined);
  const persona = addLibraryCharacter(library, { name: 'Аня', persona: true, birthday: '07-01' });
  assert.equal(persona.character.birthday, '07-01');
});
