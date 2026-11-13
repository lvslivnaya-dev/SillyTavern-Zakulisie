import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  ALL, GLOBAL, NO_FOLDER, bookCounts, buildBooks, canNest, createBookFolder, deleteBookFolder, filterBooks, folderTree,
  importLegacyLorebooks, moveBook, paginate, renameBookMarks, viewOf,
} from '../src/pud/core/lorebooks.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { LORE_BUTTON_ID, startLorebooks } from '../src/pud/ui/lorebooks.js';

const names = ['Токийские мстители - Бонтен', 'Хайтани Судзу', 'One Piece - Персонажи', 'Склонение имён'];
const characters = [{ avatar: 'bonten.png', data: { extensions: { world: 'Токийские мстители - Бонтен' } } }];

test('лорбуки: глобальные, обложка из аватара персонажа, папки и поиск', () => {
  const settings = migrateSettings({});
  const tr = createBookFolder(settings, 'Tokyo Revengers');
  moveBook(settings, 'Токийские мстители - Бонтен', tr.id);
  settings.covers.lorebooks['Хайтани Судзу'] = '/user/images/x.jpg';
  const list = buildBooks(names, ['Склонение имён'], settings, characters, { 'Хайтани Судзу': 4 });
  const bonten = list.find(book => book.name === 'Токийские мстители - Бонтен');
  assert.equal(bonten.owner, 'bonten.png');
  assert.equal(list.find(book => book.name === 'Хайтани Судзу').entries, 4);
  const show = options => filterBooks(list, settings, options).map(book => book.name);
  assert.deepEqual(show({ view: GLOBAL }), ['Склонение имён']);
  assert.deepEqual(show({ view: tr.id }), ['Токийские мстители - Бонтен']);
  assert.equal(show({ view: NO_FOLDER }).length, 3);
  assert.deepEqual(show({ view: ALL, query: 'судзу' }), ['Хайтани Судзу']);
  assert.equal(bookCounts(list, settings)[GLOBAL], 1);
});

test('вложенные папки: дерево, нельзя положить в себя, удаление поднимает содержимое наверх', () => {
  const settings = migrateSettings({});
  const tr = createBookFolder(settings, 'Tokyo Revengers');
  const bonten = createBookFolder(settings, 'Бонтен', tr.id);
  const au = createBookFolder(settings, 'АУ', bonten.id);
  assert.deepEqual(folderTree(settings).map(({ folder, depth }) => [folder.name, depth]), [['Tokyo Revengers', 0], ['Бонтен', 1], ['АУ', 2]]);
  assert.equal(canNest(settings, tr.id, au.id), false, 'родителя нельзя положить во внука');
  assert.equal(canNest(settings, au.id, tr.id), true);
  moveBook(settings, 'Токийские мстители - Бонтен', bonten.id);
  settings.views.lorebooks[bonten.id] = 'list';
  assert.equal(viewOf(settings, bonten.id), 'list');
  assert.equal(viewOf(settings, tr.id), 'grid', 'вид у каждой папки свой');
  deleteBookFolder(settings, bonten.id);
  assert.equal(settings.folders.lorebooks.find(folder => folder.id === au.id).parent, tr.id, 'подпапка поднялась');
  assert.deepEqual(settings.assignments.lorebooks['Токийские мстители - Бонтен'], [tr.id], 'лорбук поднялся');
  renameBookMarks(settings, 'Токийские мстители - Бонтен', 'Бонтен');
  assert.deepEqual(settings.assignments.lorebooks['Бонтен'], [tr.id]);
  assert.equal(paginate(Array.from({ length: 23 }), 5, 10).page, 2);
});

test('перенос из My lorebook manager: папки с вложенностью, раскладка и обложки из файлов, один раз', () => {
  const settings = migrateSettings({});
  const legacy = { folders: [{ id: 'a', name: 'Tokyo Revengers', parentId: null }, { id: 'b', name: 'Бонтен', parentId: 'a' }] };
  const files = [
    { file_id: 'Токийские мстители - Бонтен', extensions: { lorebook_manager: { folderId: 'b', coverPath: 'user/images/lorebook-manager/x.jpeg' } } },
    { file_id: 'Склонение имён', extensions: { lorebook_manager: { coverPath: '../../etc/passwd' } } },
  ];
  assert.equal(importLegacyLorebooks(settings, legacy, files), true);
  const tree = folderTree(settings).map(({ folder, depth }) => [folder.name, depth]);
  assert.deepEqual(tree, [['Tokyo Revengers', 0], ['Бонтен', 1]]);
  const bonten = settings.folders.lorebooks.find(folder => folder.name === 'Бонтен');
  assert.deepEqual(settings.assignments.lorebooks['Токийские мстители - Бонтен'], [bonten.id]);
  assert.equal(settings.covers.lorebooks['Токийские мстители - Бонтен'], '/user/images/lorebook-manager/x.jpeg');
  assert.equal(settings.covers.lorebooks['Склонение имён'], undefined, 'опасный путь не берётся');
  assert.equal(importLegacyLorebooks(settings, legacy, files), false);
});

function fakeApi() {
  const calls = [];
  const state = { names: [...names], selected: ['Склонение имён'] };
  return {
    calls,
    state,
    ready: async () => {},
    names: () => state.names,
    selected: () => state.selected,
    files: async () => [],
    entries: async () => 3,
    setGlobal: (doc, name, on) => { calls.push(['global', name, on]); state.selected = on ? [...state.selected, name] : state.selected.filter(item => item !== name); },
    create: async name => { state.names.push(name); return name; },
    remove: async name => { calls.push(['remove', name]); state.names = state.names.filter(item => item !== name); return true; },
    rename: async (doc, oldName, newName) => { calls.push(['rename', oldName, newName]); state.names = state.names.map(item => (item === oldName ? newName : item)); },
    exportBook: async (doc, name) => { calls.push(['export', name]); },
    importFile: async () => {},
    uploadCover: async () => '/user/images/pudrenitsa-covers/c.png',
    open: name => { calls.push(['open', name]); },
  };
}
const frame = () => new Promise(resolve => setTimeout(resolve, 40));

test('окно лорбуков: галерея и список по папкам, глобальный тумблер, переименование двойным кликом', async () => {
  const { document } = new JSDOM('<!doctype html><body><div id="top-settings-holder"><div id="WI-SP-button"><div class="inline-drawer-content"><div id="wiActivationSettings"></div></div></div></div></body>', { pretendToBeVisual: true }).window;
  const api = fakeApi();
  const settings = migrateSettings({});
  const context = { characters, eventTypes: {}, extensionSettings: {}, POPUP_TYPE: { CONFIRM: 1 }, callGenericPopup: async () => true };
  const undo = startLorebooks(document, { context, settings, save() {}, api });
  assert.equal(document.getElementById(LORE_BUTTON_ID).nextElementSibling.id, 'WI-SP-button');
  document.getElementById(LORE_BUTTON_ID).firstElementChild.click();
  await frame();
  await frame();
  await frame();
  const win = document.querySelector('.pud-lore');
  assert.equal(win.querySelectorAll('.pud-lcard').length, 4);
  assert.ok(win.querySelector('.pud-lact #wiActivationSettings'), 'общие настройки активации переехали в окно');
  assert.match(win.querySelector('.pud-lcard[data-name="Хайтани Судзу"] .pud-lcnt').textContent, /3 записи/);

  const sw = win.querySelector('.pud-lcard[data-name="Хайтани Судзу"] .pud-exsw');
  sw.checked = true;
  sw.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  await frame();
  assert.deepEqual(api.calls.at(-1), ['global', 'Хайтани Судзу', true]);

  win.querySelector('[data-mode="list"]').click();
  await frame();
  assert.equal(settings.views.lorebooks.__all__, 'list');
  assert.equal(win.querySelectorAll('.pud-lrow').length, 4);

  const nameEl = win.querySelector('.pud-lrow[data-name="Склонение имён"] .pud-lname');
  nameEl.dispatchEvent(new document.defaultView.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(nameEl.contentEditable, 'true');
  nameEl.textContent = 'Склонение имён и фамилий';
  nameEl.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await frame();
  await frame();
  assert.deepEqual(api.calls.find(call => call[0] === 'rename'), ['rename', 'Склонение имён', 'Склонение имён и фамилий']);

  win.querySelector('.pud-lrow[data-name="Хайтани Судзу"] [data-act="open"]').click();
  await frame();
  assert.deepEqual(api.calls.at(-1), ['open', 'Хайтани Судзу']);
  undo();
  assert.equal(document.getElementById(LORE_BUTTON_ID), null);
  assert.equal(document.getElementById('wiActivationSettings').parentElement.className, 'inline-drawer-content', 'настройки вернулись на место');
});
