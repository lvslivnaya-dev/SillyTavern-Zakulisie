import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  ALL, LEGACY_PERSONA_KEYS, NO_FOLDER, buildPersonas, connect, createFolder, deleteFolder, disconnect, exportPayload,
  filterPersonas, folderCounts, folderOf, forgetPersona, importLegacyPersonas, moveToFolder, parsePersonaFile, personaStats,
} from '../src/pud/core/personas.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { NATIVE_PERSONA_DRAWER, PERSONA_BUTTON_ID, startPersonas } from '../src/pud/ui/personas.js';

const characters = [{ avatar: 'ran.png', name: 'Ран' }, { avatar: 'luffy.png', name: 'Луффи' }];
const groups = [{ id: 'g1', name: 'Бонтен' }];
const makePower = () => ({
  personas: { 'suzu.png': 'Хайтани Судзу', 'hina.png': 'Акаши Хина', 'vesper.png': 'Веспер' },
  persona_descriptions: {
    'suzu.png': { description: 'дерзкая и тихая', lorebook: 'Судзу', title: 'бариста', connections: [{ type: 'character', id: 'ran.png' }, { type: 'group', id: 'g1' }] },
    'hina.png': { description: '', connections: [{ type: 'character', id: 'luffy.png' }] },
    'vesper.png': { description: 'рассказчик' },
  },
  persona_allow_multi_connections: false,
});

test('персоны собираются с именами привязанных персонажей и групп', () => {
  const list = buildPersonas(makePower(), { characters, groups });
  const suzu = list.find(persona => persona.avatar === 'suzu.png');
  assert.deepEqual(suzu.connections.map(item => item.name), ['Ран', 'Бонтен']);
  assert.equal(suzu.title, 'бариста');
  assert.equal(list.find(persona => persona.avatar === 'vesper.png').connections.length, 0);
});

test('фильтры: архив отдельно, избранные первыми, папки, поиск по описанию, привязанные к персонажу', () => {
  const settings = migrateSettings({});
  const list = buildPersonas(makePower(), { characters, groups });
  settings.favorites.personas.push('vesper.png');
  settings.archive.personas.push('hina.png');
  const folder = createFolder(settings, '  Токийские   мстители ');
  assert.equal(folder.name, 'Токийские мстители');
  moveToFolder(settings, 'suzu.png', folder.id);
  const names = options => filterPersonas(list, settings, options).map(persona => persona.avatar);
  assert.deepEqual(names({}), ['vesper.png', 'suzu.png'], 'избранная Веспер сверху, Хина в архиве');
  assert.deepEqual(names({ view: 'archive' }), ['hina.png']);
  assert.deepEqual(names({ view: 'fav' }), ['vesper.png']);
  assert.deepEqual(names({ folder: folder.id }), ['suzu.png']);
  assert.deepEqual(names({ folder: NO_FOLDER }), ['vesper.png']);
  assert.deepEqual(names({ query: 'ДЕРЗКАЯ' }), ['suzu.png']);
  const ran = { type: 'character', id: 'ran.png' };
  assert.deepEqual(names({ view: 'linked', connection: ran }), ['suzu.png']);
  assert.deepEqual(names({ sort: 'linked', connection: ran }), ['suzu.png', 'vesper.png']);
  assert.deepEqual(folderCounts(list, settings), { [ALL]: 2, [NO_FOLDER]: 1, [folder.id]: 1 });
  deleteFolder(settings, folder.id);
  assert.equal(folderOf(settings, 'suzu.png'), '', 'персона осталась без папки');
});

test('привязка: без «нескольких персон» снимается с других; отвязка; статистика', () => {
  const power = makePower();
  const unlinked = connect(power.persona_descriptions, 'vesper.png', { type: 'character', id: 'ran.png' }, false);
  assert.deepEqual(unlinked, ['suzu.png']);
  assert.deepEqual(power.persona_descriptions['vesper.png'].connections, [{ type: 'character', id: 'ran.png' }]);
  assert.equal(power.persona_descriptions['suzu.png'].connections.some(item => item.id === 'ran.png'), false);
  assert.deepEqual(connect(power.persona_descriptions, 'hina.png', { type: 'character', id: 'ran.png' }, true), [], 'с несколькими — никого не отвязывает');
  disconnect(power.persona_descriptions, 'hina.png', { type: 'character', id: 'ran.png' });
  assert.deepEqual(power.persona_descriptions['hina.png'].connections, [{ type: 'character', id: 'luffy.png' }]);
  const stats = personaStats(buildPersonas(power, { characters, groups }), migrateSettings({}));
  assert.equal(stats.total, 3);
  assert.equal(stats.withLorebook, 1);
  assert.equal(stats.words, 4);
});

test('файл одной персоны: экспорт и разбор, чужой JSON не принимается', () => {
  const [suzu] = buildPersonas(makePower(), { characters, groups });
  const payload = exportPayload(suzu, 'data:image/png;base64,AAA');
  const back = parsePersonaFile(JSON.parse(JSON.stringify(payload)));
  assert.equal(back.name, 'Хайтани Судзу');
  assert.equal(back.image, 'data:image/png;base64,AAA');
  assert.equal(parsePersonaFile({ personas: {} }), null, 'бэкап таверны — не наш формат');
  assert.equal(parsePersonaFile({ ...payload, image: 'javascript:alert(1)' }).image, '', 'картинка только data:image');
});

test('избранное и папки из Persona Panel переносятся один раз; удалённая персона забывается', () => {
  const settings = migrateSettings({});
  const legacy = {
    [LEGACY_PERSONA_KEYS.favorites]: '["suzu.png"]',
    [LEGACY_PERSONA_KEYS.folders]: JSON.stringify({ folders: [{ id: 'x1', name: 'One Piece' }], assignments: { 'hina.png': 'x1' } }),
  };
  assert.equal(importLegacyPersonas(settings, key => legacy[key] ?? null), true);
  assert.deepEqual(settings.favorites.personas, ['suzu.png']);
  assert.equal(settings.folders.personas[0].name, 'One Piece');
  assert.equal(folderOf(settings, 'hina.png'), settings.folders.personas[0].id);
  assert.equal(importLegacyPersonas(settings, key => legacy[key] ?? null), false);
  forgetPersona(settings, 'suzu.png');
  assert.deepEqual(settings.favorites.personas, []);
});

function tavern() {
  return new JSDOM(`<!doctype html><body>
    <div id="top-settings-holder"><div id="${NATIVE_PERSONA_DRAWER}" class="drawer"><div class="drawer-toggle"><div class="drawer-icon closedIcon"></div></div><div class="drawer-content closedDrawer"><div id="user_avatar_block"></div></div></div></div>
    </body>`, { pretendToBeVisual: true }).window;
}
const frame = () => new Promise(resolve => setTimeout(resolve, 40));

function fakeApi(power) {
  const calls = [];
  return {
    calls,
    ready: async () => {},
    power: () => power,
    current: () => 'suzu.png',
    defaultAvatar: () => '',
    allowMulti: () => false,
    worldNames: () => ['Судзу', 'Бонтен'],
    connection: () => ({ type: 'character', id: 'ran.png' }),
    imageUrl: avatar => `User Avatars/${avatar}`,
    thumbUrl: avatar => `/thumbnail?type=persona&file=${avatar}`,
    isLocked: () => false,
    wear: async avatar => { calls.push(['wear', avatar]); },
    update: async (avatar, patch) => { calls.push(['update', avatar, patch]); Object.assign(power.persona_descriptions[avatar], patch); },
    saveConnections: async () => { calls.push(['connections']); },
    setDefault: async () => {},
    setMulti: () => {},
    toggleLock: async () => {},
    create: async ({ name }) => { power.personas['new.png'] = name; power.persona_descriptions['new.png'] = {}; calls.push(['create', name]); return 'new.png'; },
    duplicate: async () => '',
    remove: async avatar => { delete power.personas[avatar]; calls.push(['remove', avatar]); return true; },
    changeImage: () => {},
    imageData: async () => '',
    backup: () => {},
    restore: () => {},
    openLorebook: () => {},
  };
}

test('окно персон: своя кнопка вместо родной, клик выбирает, «Надеть» надевает, описание в своём окне', async () => {
  const { document } = tavern();
  const power = makePower();
  const api = fakeApi(power);
  const settings = migrateSettings({});
  const context = { characters, groups, getCurrentChatId: () => 'чат', eventTypes: {} };
  const undo = startPersonas(document, { context, settings, save() {}, api, storage: null });
  const native = document.getElementById(NATIVE_PERSONA_DRAWER);
  assert.ok(native.classList.contains('pud-replaced'));
  assert.equal(native.previousElementSibling.id, PERSONA_BUTTON_ID);

  // таверна открывает свою шторку → открывается окно
  native.querySelector('.drawer-icon').classList.replace('closedIcon', 'openIcon');
  await frame();
  const win = document.querySelector('.pud-personas');
  assert.equal(win.hidden, false);
  assert.ok(native.querySelector('.drawer-icon').classList.contains('closedIcon'), 'родная шторка не открылась');

  const rows = () => [...win.querySelectorAll('.pud-prow')].map(row => row.dataset.avatar);
  assert.deepEqual(rows(), ['hina.png', 'vesper.png', 'suzu.png']);
  assert.ok(win.querySelector('.pud-pleft .pud-ptag-now'), 'слева надетая персона');

  win.querySelector('.pud-prow[data-avatar="hina.png"] .pud-prow-name').click();
  await frame();
  assert.equal(api.calls.length, 0, 'клик только выбирает');
  assert.equal(win.querySelector('.pud-pleft input[data-field="name"]').value, 'Акаши Хина');
  win.querySelector('.pud-pleft [data-act="wear"]').click();
  await frame();
  assert.deepEqual(api.calls.at(-1), ['wear', 'hina.png']);

  win.querySelector('.pud-pleft [data-act="link-here"]').click();
  await frame();
  assert.ok(power.persona_descriptions['hina.png'].connections.some(item => item.id === 'ran.png'), 'привязана к открытому');
  assert.equal(power.persona_descriptions['suzu.png'].connections.some(item => item.id === 'ran.png'), false, 'у Судзу привязку сняли');

  win.querySelector('.pud-prow[data-avatar="vesper.png"] [data-act="edit"]').click();
  await frame();
  const desc = document.querySelector('.pud-pdesc');
  assert.equal(desc.hidden, false);
  assert.equal(desc.querySelector('textarea').value, 'рассказчик');

  undo();
  assert.equal(document.getElementById(PERSONA_BUTTON_ID), null);
  assert.equal(native.classList.contains('pud-replaced'), false);
});

test('выбор нескольких: в архив и удаление с подтверждением', async () => {
  const { document } = tavern();
  const power = makePower();
  const api = fakeApi(power);
  const settings = migrateSettings({});
  let asked = 0;
  const context = { characters, groups, getCurrentChatId: () => undefined, eventTypes: {}, POPUP_TYPE: { CONFIRM: 1 }, callGenericPopup: async () => { asked++; return true; } };
  const undo = startPersonas(document, { context, settings, save() {}, api, storage: null });
  document.getElementById(PERSONA_BUTTON_ID).firstElementChild.click();
  await frame();
  const win = document.querySelector('.pud-personas');
  win.querySelector('[data-tool="select"]').click();
  await frame();
  win.querySelector('.pud-prow[data-avatar="hina.png"]').click();
  win.querySelector('.pud-prow[data-avatar="vesper.png"]').click();
  await frame();
  assert.equal(win.querySelector('.pud-bulk b').textContent, '2');
  win.querySelector('[data-bulk="archive"]').click();
  await frame();
  assert.deepEqual(settings.archive.personas, ['hina.png', 'vesper.png']);
  assert.deepEqual([...win.querySelectorAll('.pud-prow')].map(row => row.dataset.avatar), ['suzu.png']);

  win.querySelector('.pud-prow[data-avatar="suzu.png"]').click();
  await frame();
  win.querySelector('[data-bulk="delete"]').click();
  await frame();
  assert.equal(asked, 1);
  assert.deepEqual(api.calls.at(-1), ['remove', 'suzu.png']);
  undo();
});

test('окно персон с Закулисьем: слева всегда карточка (пустая создаётся сама), шестерёнка выдвигает настройки таверны над ней', async () => {
  const { document } = tavern();
  const power = makePower();
  const api = fakeApi(power);
  const settings = migrateSettings({});
  const context = { characters, groups, getCurrentChatId: () => 'чат', eventTypes: {} };
  const cards = { 'suzu.png': 'card-suzu' };
  const shown = [];
  let gear = null;
  let destroyed = 0;
  const made = [];
  const bridge = {
    cardIdFor: avatar => cards[avatar] ?? '',
    ensureCard: ({ avatar, name }) => { made.push([avatar, name]); cards[avatar] = `card-${avatar}`; return cards[avatar]; },
    createEditor: (container, { onGear }) => {
      gear = onGear;
      const node = document.createElement('div');
      node.className = 'fake-editor';
      container.append(node);
      return { showCard: id => { shown.push(id); node.textContent = `карточка ${id}`; }, destroy: () => { destroyed += 1; } };
    },
  };
  const undo = startPersonas(document, { context, settings, save() {}, api, storage: null, bridge });
  document.getElementById(PERSONA_BUTTON_ID).firstElementChild.click();
  await frame();
  const win = document.querySelector('.pud-personas');
  const left = () => win.querySelector('.pud-pleft');

  assert.ok(win.classList.contains('pud-cardmode'), 'у надетой персоны есть карточка: слева она');
  assert.equal(left().querySelector('.fake-editor').textContent, 'карточка card-suzu');
  assert.equal(left().querySelector('[data-field="name"]'), null, 'настроек таверны пока не видно');

  gear();
  await frame();
  assert.ok(win.classList.contains('pud-cardmode'), 'карточка остаётся на месте');
  assert.ok(left().querySelector('.fake-editor'), 'и над настройками, и под ними');
  assert.ok(left().querySelector('[data-field="position"]'), 'позиция описания');
  assert.ok(left().querySelector('[data-field="lorebook"]'), 'лорбук персоны');
  assert.ok(left().querySelector('[data-opt="default"]'), 'по умолчанию');
  assert.ok(left().querySelector('[data-act="link-open"]'), 'привязки к персонажам');

  left().querySelector('[data-act="pane"]').click();
  await frame();
  assert.equal(left().querySelector('[data-field="position"]'), null, 'панель настроек сворачивается');
  assert.equal(left().querySelector('.fake-editor').textContent, 'карточка card-suzu');

  // у Хины карточки нет: пустая создаётся сразу, при клике на персону
  win.querySelector('.pud-prow[data-avatar="hina.png"] .pud-prow-name').click();
  await frame();
  assert.deepEqual(made, [['hina.png', 'Акаши Хина']]);
  assert.ok(win.classList.contains('pud-cardmode'));
  assert.equal(left().querySelector('.fake-editor').textContent, 'карточка card-hina.png');

  undo();
  assert.equal(destroyed, 1, 'встроенный редактор снят вместе с окном');
});

test('родная панель персон по просьбе из настроек: таверна открывает её, окно Закулисья не перехватывает; а чужое открытие по-прежнему ведёт в окно', async () => {
  const { document } = tavern();
  const power = makePower();
  const api = fakeApi(power);
  const settings = migrateSettings({});
  const context = { characters, groups, getCurrentChatId: () => 'чат', eventTypes: {} };
  const shared = {};
  const undo = startPersonas(document, { context, settings, save() {}, api, storage: null, shared });
  const native = document.getElementById(NATIVE_PERSONA_DRAWER);
  const icon = native.querySelector('.drawer-icon');
  // как таверна: клик по переключателю открывает шторку
  native.querySelector('.drawer-toggle').addEventListener('click', () => icon.classList.replace('closedIcon', 'openIcon'));

  shared.personas.openNative();
  await frame();
  assert.ok(icon.classList.contains('openIcon'), 'родная шторка осталась открытой');
  assert.equal(document.querySelector('.pud-personas').hidden, true, 'окно персон не открылось поверх');

  icon.classList.replace('openIcon', 'closedIcon');
  await frame();
  native.querySelector('.drawer-toggle').click();
  await frame();
  assert.ok(icon.classList.contains('closedIcon'), 'без просьбы шторка по-прежнему перехватывается');
  assert.equal(document.querySelector('.pud-personas').hidden, false, 'и открывается окно персон');
  undo();
  assert.equal(shared.personas, undefined);
});
