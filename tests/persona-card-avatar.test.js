import test from 'node:test';
import assert from 'node:assert/strict';
import { addLibraryCharacter, createDefaultState } from '../src/core/index.js';
import { createLibraryCallbacks, createLocationLibraryStore } from '../src/integration/location-library-actions.js';

function setup() {
  const settings = {};
  const store = createLocationLibraryStore({ settings: () => settings, save: () => {} });
  const pushed = [];
  const callbacks = createLibraryCallbacks({
    library: store,
    getState: () => createDefaultState(),
    commitOperations: async () => {},
    replaceState: async () => {},
    confirm: async () => true,
    upload: async (_dataUrl, name) => `user/images/${name}.png`,
    removeImage: async () => {},
    setPersonaAvatar: async (avatar, dataUrl) => { pushed.push([avatar, dataUrl]); },
  });
  return { store, callbacks, pushed };
}

test('фото в карточке персоны становится и аватаром персоны в таверне', async () => {
  const { store, callbacks, pushed } = setup();
  const added = addLibraryCharacter(store.get(), { name: 'Элли', persona: true, avatar: '1700-Elli.png' });
  store.set(added.library);
  await callbacks.onLibrarySetImage({ kind: 'characters', id: added.character.id, imageDataUrl: 'data:image/png;base64,AAAA' });
  assert.deepEqual(pushed, [['1700-Elli.png', 'data:image/png;base64,AAAA']]);
  assert.ok(store.get().characters.find(card => card.id === added.character.id).image, 'и в самой карточке картинка осталась');
});

test('карточка обычного героя в аватар таверны ничего не отправляет, сбой отправки не ломает сохранение карточки', async () => {
  const { store, callbacks, pushed } = setup();
  const folder = callbacks.onLibraryAddFolder({ name: 'МБ' });
  const hero = addLibraryCharacter(store.get(), { name: 'Майки', folderId: folder.id });
  store.set(hero.library);
  await callbacks.onLibrarySetImage({ kind: 'characters', id: hero.character.id, imageDataUrl: 'data:image/png;base64,BBBB' });
  assert.deepEqual(pushed, []);

  const failing = createLibraryCallbacks({
    library: store, getState: () => createDefaultState(), commitOperations: async () => {}, replaceState: async () => {}, confirm: async () => true,
    upload: async (_d, name) => `user/images/${name}.png`, removeImage: async () => {},
    setPersonaAvatar: async () => { throw new Error('сервер молчит'); },
  });
  const persona = addLibraryCharacter(store.get(), { name: 'Элли', persona: true, avatar: 'x.png' });
  store.set(persona.library);
  await failing.onLibrarySetImage({ kind: 'characters', id: persona.character.id, imageDataUrl: 'data:image/png;base64,CCCC' });
  assert.ok(store.get().characters.find(card => card.id === persona.character.id).image, 'карточка сохранила картинку');
});
