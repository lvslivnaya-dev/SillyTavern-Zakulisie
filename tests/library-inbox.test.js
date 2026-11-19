/** The folder «Библиотека»: pictures dropped there by hand become places and things in the library folder they lie in, and stay where they are. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHandlers, parseInboxPath, treeParts, TREES } from '../server-plugin/kulisy-images/index.mjs';
import { INBOX_FOLDER, libraryDirectories, newLibraryFiles, placeFromLibraryPath } from '../src/integration/library-inbox.js';
import { createLibraryCallbacks, createLocationLibraryStore } from '../src/integration/location-library-actions.js';
import { imageUrl, isLibraryTreeImage, isTreeImage } from '../src/integration/wardrobe-images.js';
import { addFolder, addLibraryCharacter, addLibraryItem, addLocation, cleanImagePath, emptyLibrary } from '../src/core/index.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const TREE = 'api/plugins/kulisy-images/library/';
const tempDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const request = (root, { admin = true, body, query, path: urlPath, method = 'GET' } = {}) => ({ user: { directories: { root }, profile: { admin } }, body, query, path: urlPath, method });

function response() {
  const res = { statusCode: 200, body: undefined, file: null };
  res.status = code => { res.statusCode = code; return res; };
  res.send = body => { res.body = body; return res; };
  res.sendStatus = code => { res.statusCode = code; return res; };
  res.sendFile = (name, options) => { res.file = path.join(options.root, name); return res; };
  return res;
}
async function call(handler, req) { const res = response(); await handler(req, res); return res; }

async function setUp() {
  const user = tempDir('kulisy-user-');
  const pictures = tempDir('kulisy-pics-');
  const handlers = createHandlers({ platform: 'linux' });
  await call(handlers.folder, request(user, { body: { folder: pictures } }));
  await call(handlers.treePrepare, request(user, { body: { tree: 'library', dirs: ['Места', 'Вещи', 'Места/Кафе', 'Места/Кафе/Терраса'] } }));
  return { user, pictures, handlers, tree: path.join(pictures, TREES.library.root) };
}

test('plugin: the library tree is its own folder, made once, and deeper than the wardrobe\'s', async () => {
  const { user, pictures, handlers, tree } = await setUp();
  assert.ok(fs.existsSync(path.join(tree, 'Места', 'Кафе', 'Терраса')));
  assert.equal(fs.existsSync(path.join(pictures, 'Гардероб')), false, 'the wardrobe tree is not touched');
  const again = await call(handlers.treePrepare, request(user, { body: { tree: 'library', dirs: ['Места', 'Места/Кафе', '../evil', 'a/b/c/d/e/f/g'] } }));
  assert.equal(again.body.created, 0);
  assert.equal(fs.existsSync(path.join(pictures, 'evil')), false);
});

test('plugin: list, serve, save, move and delete pictures of the library tree', async () => {
  const { user, handlers, tree } = await setUp();
  const terrace = path.join(tree, 'Места', 'Кафе', 'Терраса');
  fs.writeFileSync(path.join(terrace, 'вечерняя терраса.png'), PNG);
  fs.writeFileSync(path.join(terrace, 'notes.txt'), 'no');
  const listed = (await call(handlers.treeList, request(user, { query: { tree: 'library' } }))).body.files;
  assert.deepEqual(listed.map(file => file.public), [`${TREE}Места/Кафе/Терраса/вечерняя терраса.png`]);
  assert.equal(cleanImagePath(listed[0].public), listed[0].public, 'an entry may keep this path');
  assert.deepEqual((await call(handlers.treeList, request(user))).body.files, [], 'the wardrobe list does not show library pictures');

  const url = imageUrl(listed[0].public);
  assert.match(url, /^\/api\/plugins\/kulisy-images\/library\/%D0%9C/);
  const served = await call(handlers.libraryFile, request(user, { path: url.slice('/api/plugins/kulisy-images/library'.length) }));
  assert.equal(served.file, path.join(terrace, 'вечерняя терраса.png'));
  assert.equal((await call(handlers.treeFile, request(user, { path: url.slice('/api/plugins/kulisy-images/library'.length) }))).statusCode, 404, 'the wardrobe route does not serve the library');

  const saved = await call(handlers.treeUpload, request(user, { body: { tree: 'library', image: PNG.toString('base64'), format: 'png', dir: 'Вещи', filename: 'Ключ' } }));
  assert.equal(saved.body.path, `${TREE}Вещи/Ключ.png`);
  const moved = await call(handlers.treeMove, request(user, { body: { path: saved.body.path, dir: 'Места/Кафе' } }));
  assert.equal(moved.body.path, `${TREE}Места/Кафе/Ключ.png`);
  assert.ok(fs.existsSync(path.join(tree, 'Места', 'Кафе', 'Ключ.png')));
  assert.equal((await call(handlers.treeDelete, request(user, { body: { path: moved.body.path } }))).statusCode, 200);
  assert.equal(fs.existsSync(path.join(tree, 'Места', 'Кафе', 'Ключ.png')), false);
  assert.ok(fs.existsSync(path.join(terrace, 'notes.txt')), 'other files are never touched');
});

test('plugin: nothing outside the library tree is read or changed', async () => {
  const { user, handlers } = await setUp();
  for (const bad of [`${TREE}../x.png`, `${TREE}Места/../../x.png`, `${TREE}a/b/c/d/e/f/g.png`]) {
    assert.ok([400, 404].includes((await call(handlers.treeDelete, request(user, { body: { path: bad } }))).statusCode), bad);
  }
  assert.equal((await call(handlers.libraryFile, request(user, { path: '/%2E%2E/x.png' }))).statusCode, 404);
  assert.equal((await call(handlers.treeMove, request(user, { body: { path: `${TREE}Места/a.png`, dir: '../x' } }))).statusCode, 400);
  assert.equal((await call(handlers.treeUpload, request(user, { body: { tree: 'library', image: PNG.toString('base64'), format: 'png', dir: '..', filename: 'x' } }))).statusCode, 400);
  assert.equal(parseInboxPath('a/b/c/d/e/f.png', TREES.library)?.length, 6, 'shelf + four levels of folders');
  assert.equal(parseInboxPath('a/b/c/d/e/f/g.png', TREES.library), null);
  assert.equal(treeParts(`/${TREE}Места/a.png`)?.join('/'), 'Места/a.png');
  assert.equal(cleanImagePath(`${TREE}a/b/c/d/e/f/g.png`), '');
  assert.equal(cleanImagePath(`${TREE}Места/../x.png`), '');
  assert.equal(isLibraryTreeImage(`/${TREE}x.png`), true);
  assert.equal(isTreeImage(`/${TREE}x.png`), false, 'the wardrobe never takes a library picture for its own');
});

test('paths: shelf and folders from where the picture lies; a name only when it is a name', () => {
  assert.deepEqual(placeFromLibraryPath('Места/Кафе/Терраса/вечерняя терраса.jpg'), { kind: 'places', folders: ['Кафе', 'Терраса'], name: 'вечерняя терраса', problem: '' });
  assert.deepEqual(placeFromLibraryPath('Вещи/IMG_2034.jpg'), { kind: 'items', folders: [], name: '', problem: '' });
  assert.equal(placeFromLibraryPath('локации/x.png').kind, 'places');
  assert.match(placeFromLibraryPath('Котики/кот.png').problem, /Котики/);
  assert.match(placeFromLibraryPath('кот.png').problem, /Места/);
});

test('directories: a library folder gets a folder on the computer only on the shelf where something lies in it; unfit names and the hidden home of the personas are left out', () => {
  let library = emptyLibrary();
  library = addFolder(library, { name: 'Кафе' }).library;
  const cafe = library.folders[0];
  library = addFolder(library, { name: 'Терраса', parentId: cafe.id }).library;
  library = addFolder(library, { name: 'Кафе: плохое?' }).library;
  library = addLibraryCharacter(library, { name: 'Рика', persona: true }).library;
  const terrace = library.folders.find(folder => folder.name === 'Терраса');
  assert.deepEqual(libraryDirectories(library), ['Места', 'Вещи'], 'empty folders make no folders on the computer');
  library = addLocation(library, { name: 'Вечерняя терраса', folderId: terrace.id }).library;
  library = addLibraryItem(library, { name: 'Плед', folderId: cafe.id }).library;
  assert.deepEqual(libraryDirectories(library), ['Места', 'Места/Кафе', 'Места/Кафе/Терраса', 'Вещи', 'Вещи/Кафе']);
  assert.deepEqual(newLibraryFiles([{ public: `${TREE}Места/a.png` }, { public: `${TREE}Места/b.png` }], { locations: [{ image: `/${TREE}Места/a.png` }], items: [] }).map(file => file.public), [`${TREE}Места/b.png`]);
});

function setup(files, { ask, confirm = async () => true } = {}) {
  const settings = { locationLibrary: undefined };
  const store = createLocationLibraryStore({ settings: () => settings, save() {} });
  const callbacks = createLibraryCallbacks({
    library: store, getState: () => ({ entities: {}, world: {} }), commitOperations: async () => {}, confirm,
    upload: async () => { throw new Error('import never uploads'); },
    removeImage: async () => { throw new Error('import never deletes'); },
    imageForModel: async () => 'data:image/png;base64,AA',
    ask: ask ?? (async () => JSON.stringify({ name: 'Кофейня', description: 'Тёплая кофейня с окнами на улицу.', traits: ['уютно'] })),
    inbox: { list: async () => files },
  });
  return { store, callbacks };
}
const treeFile = relative => ({ path: relative, public: `${TREE}${relative}` });

test('import: entries point at the files where they lie, in the library folders made for them', async () => {
  const files = [treeFile('Места/Кафе/Терраса/вечерняя терраса.png'), treeFile('Вещи/IMG_2034.jpg'), treeFile('Места/Кафе/кофейня.png'), treeFile('Котики/кот.png')];
  const { store, callbacks } = setup(files);
  const progress = [];
  const result = await callbacks.onLibraryImportInbox({ describe: true, onProgress: (done, total, stage) => progress.push(`${stage}:${done}/${total}`) });
  assert.deepEqual({ ...result, skipped: result.skipped.length }, { added: 3, described: 3, failed: 0, undescribed: 0, skipped: 1 });
  const library = store.get();
  const names = library.folders.map(folder => folder.name).sort();
  assert.deepEqual(names, [INBOX_FOLDER, 'Кафе', 'Терраса'].sort());
  const terrace = library.locations.find(place => place.image === `${TREE}Места/Кафе/Терраса/вечерняя терраса.png`);
  assert.ok(terrace, 'the entry shows the file from its folder: no copy');
  assert.equal(library.folders.find(folder => folder.id === terrace.folderId).name, 'Терраса');
  assert.equal(library.folders.find(folder => folder.id === library.folders.find(f => f.id === terrace.folderId).parentId).name, 'Кафе');
  assert.equal(terrace.name, 'вечерняя терраса', 'a real file name stays the name');
  const thing = library.items.find(item => item.image === `${TREE}Вещи/IMG_2034.jpg`);
  assert.equal(thing.name, 'Кофейня', 'no name in the file: the model named it');
  assert.equal(library.folders.find(folder => folder.id === thing.folderId).name, INBOX_FOLDER, 'a picture right in the shelf goes to «Из папки»');
  assert.deepEqual(progress, ['add:1/3', 'add:2/3', 'add:3/3', 'describe:1/3', 'describe:2/3', 'describe:3/3']);
  assert.equal(newLibraryFiles(files, library).length, 1, 'only the one with the unclear folder is still new');
  const again = await callbacks.onLibraryImportInbox({});
  assert.equal(again.added, 0, 'a second run makes nothing from what was taken');
  assert.equal(again.skipped.length, 1);
});

test('import: a second run takes only what is new, a folder that exists is reused, a refusal changes nothing, a failed description stops no one', async () => {
  const library = addFolder(emptyLibrary(), { name: 'Кафе' }).library;
  const { store, callbacks } = setup([treeFile('Места/кафе/a.png'), treeFile('Места/Кафе/b.png')], { ask: async () => { throw new Error('модель молчит'); } });
  store.set(library);
  const result = await callbacks.onLibraryImportInbox({ describe: true });
  assert.equal(result.added, 2);
  assert.equal(result.undescribed, 2, 'both stay, undescribed');
  assert.equal(store.get().folders.length, 1, 'the folder «Кафе» is found without regard to case, not made twice');
  assert.equal(store.get().locations.length, 2);
  const refused = setup([treeFile('Места/c.png')], { confirm: async () => false });
  assert.equal(await refused.callbacks.onLibraryImportInbox({}), null);
  assert.equal(refused.store.get().locations.length, 0);
  const lone = setup([]);
  await assert.rejects(() => lone.callbacks.onLibraryImportInbox({}), /нет новых картинок/);
});
