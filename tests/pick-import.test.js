/** Importing a file of Kulisy: the entries are listed and only the picked ones (with their folders) come in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addFolder, addLocation, addLibraryItem, emptyLibrary, exportLibrary, importLibrary, listExport, selectFromExport } from '../src/core/location-library.js';
import { addSong, addSongFolder, emptySongs, exportSongs, importSongs, listSongExport, selectSongExport } from '../src/core/song-library.js';

test('only the picked places and things of a file are imported, with their folders', () => {
  let lib = emptyLibrary();
  const tokyo = addFolder(lib, { name: 'Токио' });
  lib = tokyo.library;
  const kyoto = addFolder(lib, { name: 'Киото' });
  lib = kyoto.library;
  lib = addLocation(lib, { folderId: tokyo.folder.id, name: 'Сибуя', description: 'Район.' }).library;
  lib = addLocation(lib, { folderId: kyoto.folder.id, name: 'Храм', description: 'Старый.' }).library;
  lib = addLibraryItem(lib, { folderId: kyoto.folder.id, name: 'Меч', description: 'Острый.' }).library;
  const data = exportLibrary(lib);
  const list = listExport(data);
  assert.deepEqual(list.map(item => item.name).sort(), ['Меч', 'Сибуя', 'Храм'].sort());
  const shibuya = list.find(item => item.name === 'Сибуя');
  const result = importLibrary(emptyLibrary(), selectFromExport(data, [shibuya.id]));
  assert.deepEqual(result.library.locations.map(item => item.name), ['Сибуя']);
  assert.equal(result.library.items.length, 0);
  assert.deepEqual(result.library.folders.map(item => item.name), ['Токио']);
});

test('only the picked songs of a file are imported', () => {
  let songs = emptySongs();
  const made = addSongFolder(songs, 'Опенинги');
  songs = made.library;
  songs = addSong(songs, { title: 'Первая', artist: 'А', lyrics: 'раз два три', folderId: made.folder.id }).library;
  songs = addSong(songs, { title: 'Вторая', artist: 'Б', lyrics: 'четыре пять шесть' }).library;
  const data = exportSongs(songs);
  const list = listSongExport(data);
  assert.equal(list.length, 2);
  const pick = list.find(item => item.name.startsWith('Первая'));
  const result = importSongs(emptySongs(), selectSongExport(data, [pick.id]));
  assert.equal(result.added, 1);
  assert.deepEqual(result.library.songs.map(song => song.title), ['Первая']);
});
