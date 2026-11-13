import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  LEGACY_KEYS, chatKey, groupChats, importLegacy, latestChat, marks, paginate, plural,
  renameMarks, renameOwner, shelfEntries, shelfTags, shortDate, toTime, visibleChats,
} from '../src/pud/core/library.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { CLOSE_ID, HOME_CLASS, HOME_ID, startHome } from '../src/pud/ui/home.js';

const characters = [
  { avatar: 'ran.png', name: 'Ран Хайтани' },
  { avatar: 'mikey.png', name: 'Манджиро Сано' },
  { avatar: 'luffy.png', name: 'Луффи' },
];
const groups = [{ id: 'g1', name: 'Бонтен', avatar_url: '' }];
const recent = [
  { file_name: 'Ран - 1.jsonl', avatar: 'ran.png', last_mes: 3000, chat_items: 40, mes: '<p>Ты опоздала на *сорок* минут.</p>' },
  { file_name: 'Ран - 2.jsonl', avatar: 'ran.png', last_mes: 1000, chat_items: 5, mes: 'старый' },
  { file_name: 'Майки.jsonl', avatar: 'mikey.png', last_mes: 2000, chat_items: 200, mes: 'тайяки' },
  { file_name: 'Сходка.jsonl', group: 'g1', last_mes: 2500, chat_items: 10, mes: 'все в сборе' },
  { file_name: 'Удалённый.jsonl', avatar: 'ghost.png', last_mes: 9000, chat_items: 1, mes: '' },
];
const tagMap = { 'ran.png': ['t1'], 'mikey.png': ['t1'], 'luffy.png': ['t2'] };
const tags = [{ id: 't1', name: 'Токийские мстители' }, { id: 't2', name: 'One Piece' }];

test('чаты собираются по владельцу, свежие первыми; чужие файлы без персонажа отброшены', () => {
  const entries = groupChats(recent, characters, groups, tagMap);
  assert.deepEqual(entries.map(entry => entry.key), ['ran.png', 'group:g1', 'mikey.png']);
  const ran = entries[0];
  assert.equal(ran.chats.length, 2);
  assert.equal(ran.chats[0].name, 'Ран - 1');
  assert.equal(ran.messages, 45);
  assert.deepEqual(ran.tags, ['t1']);
  assert.equal(entries[1].kind, 'group');
  assert.equal(toTime(1700000000), 1700000000000, 'секунды → мс');
  assert.equal(toTime('2026-11-06T10:00:00Z'), Date.parse('2026-11-06T10:00:00Z'));
});

test('полки: недавние с закреплёнными сверху, частые по сообщениям, архив отдельно, фандомы по тегам', () => {
  const settings = migrateSettings({});
  const entries = groupChats(recent, characters, groups, tagMap);
  settings.library.pinned.push('mikey.png');
  settings.archive.characters.push('group:g1');
  const mark = marks(settings);
  assert.deepEqual(shelfEntries(entries, 'recent', mark).map(entry => entry.key), ['mikey.png', 'ran.png']);
  assert.deepEqual(shelfEntries(entries, 'pinned', mark).map(entry => entry.key), ['mikey.png']);
  assert.deepEqual(shelfEntries(entries, 'frequent', mark).map(entry => entry.key), ['mikey.png', 'ran.png']);
  assert.deepEqual(shelfEntries(entries, 'archive', mark).map(entry => entry.key), ['group:g1']);
  assert.deepEqual(shelfEntries(entries, 'tag:t1', mark).map(entry => entry.key), ['ran.png', 'mikey.png']);
  assert.deepEqual(shelfEntries(entries, 'recent', mark, 'ран - 2').map(entry => entry.key), ['ran.png'], 'поиск по названию чата');
  assert.deepEqual(shelfTags(entries, mark, tags), [{ id: 't1', name: 'Токийские мстители', count: 2 }], 'тег без чатов не показывается');
});

test('чаты владельца: избранные сверху, архивные только в архиве, «Открыть» берёт свежий не из архива', () => {
  const settings = migrateSettings({});
  const [ran] = groupChats(recent, characters, groups);
  settings.library.favoriteChats.push(chatKey('ran.png', 'Ран - 2.jsonl'));
  assert.deepEqual(visibleChats(ran, marks(settings)).map(chat => chat.name), ['Ран - 2', 'Ран - 1']);
  settings.library.archivedChats.push(chatKey('ran.png', 'РАН - 1.jsonl'));
  assert.deepEqual(visibleChats(ran, marks(settings)).map(chat => chat.name), ['Ран - 2']);
  assert.deepEqual(visibleChats(ran, marks(settings), { archived: true }).map(chat => chat.name), ['Ран - 1']);
  assert.equal(latestChat(ran, marks(settings)).name, 'Ран - 2');
});

test('страницы по 10 и номер страницы не выходит за край', () => {
  const list = Array.from({ length: 23 }, (_, index) => index);
  assert.deepEqual(paginate(list, 2), { items: [20, 21, 22], page: 2, pages: 3 });
  assert.equal(paginate(list, 9).page, 2);
  assert.equal(paginate([], 3).pages, 1);
});

test('переименования переносят отметки; закрепления и архив Character Chat Pills забираются один раз', () => {
  const settings = migrateSettings({});
  settings.library.favoriteChats.push(chatKey('ran.png', 'Старый.jsonl'));
  renameMarks(settings, 'ran.png', 'Старый.jsonl', 'Новый.jsonl');
  assert.deepEqual(settings.library.favoriteChats, ['ran.png::новый.jsonl']);
  settings.library.pinned.push('ran.png');
  renameOwner(settings, 'ran.png', 'ran1.png');
  assert.deepEqual(settings.library.pinned, ['ran1.png']);
  assert.deepEqual(settings.library.favoriteChats, ['ran1.png::новый.jsonl']);

  const fresh = migrateSettings({});
  const legacy = { [LEGACY_KEYS.pinned]: '["ran.png"]', [LEGACY_KEYS.archived]: '["luffy.png"]', [LEGACY_KEYS.favoriteChats]: 'битый json' };
  assert.equal(importLegacy(fresh, key => legacy[key] ?? null), true);
  assert.deepEqual(fresh.library.pinned, ['ran.png']);
  assert.deepEqual(fresh.archive.characters, ['luffy.png']);
  assert.equal(importLegacy(fresh, key => legacy[key] ?? null), false, 'второй раз не переносит');
});

test('даты и числа по-русски', () => {
  const now = new Date(2026, 10, 6, 15, 0).getTime();
  assert.match(shortDate(new Date(2026, 10, 6, 9, 5).getTime(), now), /^сегодня, 09:05$/);
  assert.equal(shortDate(new Date(2026, 10, 5, 23, 0).getTime(), now), 'вчера');
  assert.match(shortDate(new Date(2025, 0, 2).getTime(), now), /2025/);
  assert.equal(plural(1, 'чат', 'чата', 'чатов'), '1 чат');
  assert.equal(plural(3, 'чат', 'чата', 'чатов'), '3 чата');
  assert.equal(plural(12, 'чат', 'чата', 'чатов'), '12 чатов');
  assert.equal(plural(21, 'чат', 'чата', 'чатов'), '21 чат');
});

/** Мини-таверна: верхняя панель, #chat с приветствием, поле ввода. */
function tavern() {
  const win = new JSDOM(`<!doctype html><body>
    <div id="top-settings-holder"><div id="pud-hub-button"></div></div>
    <div id="sheld"><div id="chat"><div class="mes"><div class="welcomePanel"></div></div></div><div id="form_sheld"></div></div>
    <div id="option_close_chat"></div></body>`, { pretendToBeVisual: true }).window;
  return win;
}
const frame = () => new Promise(resolve => setTimeout(resolve, 40));

function fakeApi() {
  const calls = [];
  return {
    calls,
    fetchRecent: async () => recent,
    openChat: async (entry, file) => { calls.push(['open', entry.key, file]); },
    newChat: async entry => { calls.push(['new', entry.key]); },
    renameChat: async (entry, file, name) => { calls.push(['rename', file, name]); },
    deleteChat: async (entry, file) => { calls.push(['delete', file]); },
    temporaryChat: async () => { calls.push(['temp']); },
    closeChat: () => { calls.push(['close']); },
  };
}

test('стартовый экран: полка вместо приветствия, клик только выделяет, чат открывает кнопка', async () => {
  const { document } = tavern();
  const settings = migrateSettings({});
  const api = fakeApi();
  const context = { characters, groups, tagMap, tags, chat: [{ mes: 'приветствие' }], getCurrentChatId: () => undefined, eventTypes: {} };
  let saves = 0;
  const undo = startHome(document, { context, settings, save: () => { saves++; }, api, storage: { getItem: () => null } });
  assert.ok(document.body.classList.contains(HOME_CLASS), 'с приветствием таверны — стартовый экран');
  assert.equal(document.getElementById(HOME_ID).previousElementSibling.id, 'chat');
  assert.equal(document.getElementById(CLOSE_ID).hidden, true, 'на старте закрывать нечего');
  await frame();

  const cards = [...document.querySelectorAll('.pud-pola')];
  assert.deepEqual(cards.map(card => card.dataset.key), ['ran.png', 'group:g1', 'mikey.png']);
  assert.ok(cards[0].querySelector('.pud-pola-last'), 'лапка на самом свежем');
  assert.equal(cards[0].querySelector('img').getAttribute('src'), 'characters/ran.png', 'большой арт, не миниатюра');

  cards[2].querySelector('.pud-pola-name').click();
  assert.equal(api.calls.length, 0, 'клик по карточке ничего не открывает');
  assert.ok(document.querySelector('.pud-pola[data-key="mikey.png"]').classList.contains('on'));

  cards[0].querySelector('[data-act="open"]').click();
  await frame();
  assert.deepEqual(api.calls[0], ['open', 'ran.png', 'Ран - 1.jsonl']);

  document.querySelector('.pud-pola[data-key="mikey.png"] [data-act="pin"]').click();
  assert.deepEqual(settings.library.pinned, ['mikey.png']);
  assert.equal(document.querySelector('.pud-pola').dataset.key, 'mikey.png', 'закреплённый встал первым');
  assert.ok(saves > 0);

  document.querySelector('[data-shelf="tag:t1"]').click();
  assert.equal(settings.library.shelf, 'tag:t1');
  assert.equal(document.querySelectorAll('.pud-pola').length, 2);

  undo();
  assert.equal(document.getElementById(HOME_ID), null);
  assert.equal(document.getElementById(CLOSE_ID), null);
  assert.equal(document.body.classList.contains(HOME_CLASS), false);
});

test('окно «Все чаты»: избранное, архив, открыть, удалить с подтверждением', async () => {
  const { document } = tavern();
  const settings = migrateSettings({});
  const api = fakeApi();
  let confirmed = 0;
  const context = {
    characters, groups, tagMap, tags, chat: [], getCurrentChatId: () => undefined, eventTypes: {},
    POPUP_TYPE: { CONFIRM: 'confirm', INPUT: 'input' },
    callGenericPopup: async () => { confirmed++; return true; },
  };
  const undo = startHome(document, { context, settings, save() {}, api, storage: null });
  await frame();
  document.querySelector('.pud-pola[data-key="ran.png"] [data-act="all"]').click();
  const win = document.querySelector('.pud-chats');
  assert.equal(win.hidden, false, 'окно открылось');
  assert.deepEqual([...win.querySelectorAll('.pud-crow')].map(row => row.dataset.file), ['Ран - 1.jsonl', 'Ран - 2.jsonl']);
  assert.equal(win.querySelector('.pud-crow-mes').textContent, 'Ты опоздала на сорок минут.', 'превью без разметки');

  win.querySelector('.pud-crow[data-file="Ран - 2.jsonl"] [data-act="fav"]').click();
  assert.equal(win.querySelector('.pud-crow').dataset.file, 'Ран - 2.jsonl', 'избранный сверху');

  win.querySelector('.pud-crow[data-file="Ран - 1.jsonl"] [data-act="archive"]').click();
  assert.deepEqual([...win.querySelectorAll('.pud-crow')].map(row => row.dataset.file), ['Ран - 2.jsonl']);
  win.querySelector('[data-arch="1"]').click();
  assert.deepEqual([...win.querySelectorAll('.pud-crow')].map(row => row.dataset.file), ['Ран - 1.jsonl']);
  win.querySelector('[data-arch="0"]').click();

  win.querySelector('.pud-crow[data-file="Ран - 2.jsonl"] [data-act="delete"]').click();
  await frame();
  assert.equal(confirmed, 1);
  assert.deepEqual(api.calls.at(-1), ['delete', 'Ран - 2.jsonl']);
  assert.deepEqual(settings.library.favoriteChats, [], 'отметка удалённого чата убрана');
  undo();
});

test('в открытом чате и во временном чате полки нет, а кнопка «закрыть чат» есть', () => {
  const { document } = tavern();
  document.querySelector('.welcomePanel').remove();
  const settings = migrateSettings({});
  const api = fakeApi();
  const undo = startHome(document, { context: { chat: [{ mes: 'временный' }], getCurrentChatId: () => undefined, eventTypes: {} }, settings, save() {}, api, storage: null });
  assert.equal(document.body.classList.contains(HOME_CLASS), false);
  assert.equal(document.getElementById(CLOSE_ID).hidden, false);
  document.querySelector(`#${CLOSE_ID} .drawer-icon`).click();
  assert.deepEqual(api.calls, [['close']]);
  undo();
});

test('полка: «Новый нарратор» и карандаш на карточке ведут в окно нарраторов; у группы карандаша нет', async () => {
  const { document } = tavern();
  const settings = migrateSettings({});
  const api = fakeApi();
  const context = { characters, groups, tagMap, tags, chat: [{ mes: 'приветствие' }], getCurrentChatId: () => undefined, eventTypes: {} };
  const calls = [];
  const shared = { characters: { open: avatar => calls.push(['open', avatar]), add: () => calls.push(['add']) } };
  const undo = startHome(document, { context, settings, save() {}, api, storage: { getItem: () => null }, shared });
  await frame();
  document.querySelector('.pud-newchar').click();
  assert.deepEqual(calls, [['add']]);
  const cards = [...document.querySelectorAll('.pud-pola')];
  cards[0].querySelector('[data-act="edit"]').click();
  assert.deepEqual(calls.at(-1), ['open', 'ran.png']);
  assert.equal(document.querySelector('.pud-pola[data-key="group:g1"] [data-act="edit"]'), null, 'у группы нет карандаша');
  undo();
});
