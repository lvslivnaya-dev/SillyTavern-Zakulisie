import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildCharacters, characterStats, fieldValue, filterCharacters, forgetCharacter, mergePayload } from '../src/pud/core/characters.js';
import { ALL, NO_FOLDER, createFolder, folderOf, moveToFolder } from '../src/pud/core/personas.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { CHAR_BUTTON_ID, NATIVE_CHAR_DRAWER, startCharacters } from '../src/pud/ui/characters.js';

const makeCharacters = () => [
  { avatar: 'ran.png', name: 'Ран', chat: 'Ран - 1', fav: true, chat_size: 100, date_last_chat: 3000, date_added: 10, description: 'старое', data: { description: 'ленивый и опасный', first_mes: 'Опоздала.', creator: 'Слива', extensions: { world: 'Бонтен' } } },
  { avatar: 'luffy.png', name: 'Луффи', chat: 'Луффи - 1', chat_size: 0, date_added: 30, data: { description: 'мясо!', extensions: {} } },
  { avatar: 'mikey.png', name: 'Майки', chat: 'Майки - 1', chat_size: 50, date_last_chat: 5000, date_added: 20, data: { extensions: {} } },
];
const tagMap = { 'ran.png': ['t1'], 'mikey.png': ['t1'], 'luffy.png': ['t2'] };
const tags = [{ id: 't1', name: 'Токийские мстители' }, { id: 't2', name: 'One Piece' }];

test('персонажи для библиотеки: теги по именам, лорбук, избранное, есть ли чаты', () => {
  const [ran, luffy] = buildCharacters(makeCharacters(), tagMap, tags);
  assert.deepEqual(ran.tags, ['Токийские мстители']);
  assert.equal(ran.world, 'Бонтен');
  assert.equal(ran.fav, true);
  assert.equal(luffy.hasChats, false);
  assert.equal(fieldValue(makeCharacters()[0], 'description'), 'ленивый и опасный', 'V2 важнее V1');
  assert.deepEqual(mergePayload('ran.png', 'creator_notes', 'x'), { avatar: 'ran.png', data: { creator_notes: 'x' }, creatorcomment: 'x' });
  assert.deepEqual(mergePayload('ran.png', 'system_prompt', 'y'), { avatar: 'ran.png', data: { system_prompt: 'y' } });
});

test('фильтры персонажей: избранные сверху, с чатами, архив, папки, поиск по тегу, сортировки', () => {
  const settings = migrateSettings({});
  const list = buildCharacters(makeCharacters(), tagMap, tags);
  const names = options => filterCharacters(list, settings, options).map(character => character.avatar);
  assert.deepEqual(names({}), ['ran.png', 'luffy.png', 'mikey.png']);
  assert.deepEqual(names({ view: 'chats' }), ['ran.png', 'mikey.png']);
  assert.deepEqual(names({ sort: 'recent' }), ['ran.png', 'mikey.png', 'luffy.png']);
  assert.deepEqual(names({ sort: 'added' }), ['ran.png', 'luffy.png', 'mikey.png']);
  assert.deepEqual(names({ query: 'one piece' }), ['luffy.png']);
  settings.archive.characters.push('luffy.png');
  assert.deepEqual(names({ view: 'archive' }), ['luffy.png']);
  const folder = createFolder(settings, 'Свастоны', 'characters');
  moveToFolder(settings, 'mikey.png', folder.id, 'characters');
  assert.equal(folderOf(settings, 'mikey.png', 'characters'), folder.id);
  assert.equal(folderOf(settings, 'mikey.png'), '', 'папки персон отдельно');
  assert.deepEqual(names({ folder: folder.id }), ['mikey.png']);
  assert.deepEqual(names({ folder: NO_FOLDER }), ['ran.png']);
  assert.equal(characterStats(list, settings).withLorebook, 1);
  settings.library.pinned.push('mikey.png');
  forgetCharacter(settings, 'mikey.png');
  assert.deepEqual(settings.library.pinned, []);
  assert.equal(ALL, '__all__');
});

function tavern() {
  return new JSDOM(`<!doctype html><body>
    <div id="top-settings-holder"><div id="${NATIVE_CHAR_DRAWER}" class="drawer"><div id="unimportantYes" class="drawer-toggle"></div></div></div>
    </body>`, { pretendToBeVisual: true }).window;
}
const frame = () => new Promise(resolve => setTimeout(resolve, 40));

function fakeApi(characters) {
  const calls = [];
  return {
    calls,
    ready: async () => {},
    imageUrl: avatar => `characters/${avatar}`,
    thumbUrl: avatar => `/thumbnail?type=avatar&file=${avatar}`,
    isCurrent: avatar => avatar === 'mikey.png',
    full: async avatar => characters.find(character => character.avatar === avatar),
    setField: async (doc, avatar, field, value) => { calls.push(['field', avatar, field, value]); characters.find(c => c.avatar === avatar).data[field] = value; },
    setWorld: async (avatar, name) => { calls.push(['world', avatar, name]); },
    toggleFav: async (doc, avatar) => { calls.push(['fav', avatar]); },
    openChat: async avatar => { calls.push(['open', avatar]); },
    create: async name => { calls.push(['create', name]); return 'new.png'; },
    duplicate: async () => 'copy.png',
    exportCard: async (doc, avatar, format) => { calls.push(['export', avatar, format]); },
    remove: async avatars => { calls.push(['remove', avatars]); return true; },
    changeImage: async () => true,
    toPersona: async () => true,
    nativeOptions: () => [{ id: 'renameCharButton', title: 'Rename' }],
    runNative: (doc, id) => { calls.push(['native', id]); },
    openNativePanel: () => { calls.push(['panel']); },
    importFiles: () => { calls.push(['import']); },
  };
}
const lore = { ready: async () => {}, worldNames: () => ['Бонтен', 'One Piece'], openLorebook: () => {} };

test('окно персонажей: клик выбирает (справа), чат открывает только кнопка, шестерёнка, описание без открытия чата', async () => {
  const { document } = tavern();
  const characters = makeCharacters();
  const api = fakeApi(characters);
  const settings = migrateSettings({});
  const context = { characters, tagMap, tags, characterId: undefined, eventTypes: {} };
  globalThis.SillyTavern = { getContext: () => context };
  const undo = startCharacters(document, { context, settings, save() {}, api, lore });
  const native = document.getElementById(NATIVE_CHAR_DRAWER);
  assert.ok(native.classList.contains('pud-toggle-hidden'));
  document.getElementById(CHAR_BUTTON_ID).firstElementChild.click();
  await frame();
  const win = document.querySelector('.pud-chars');
  assert.equal(win.hidden, false);
  const body = win.querySelector('.pud-win-body');
  assert.ok(body.firstElementChild.classList.contains('pud-pright'), 'библиотека слева');
  assert.ok(body.querySelector('.pud-side-right'), 'выбранный справа');

  win.querySelector('.pud-prow[data-avatar="luffy.png"] .pud-prow-name').click();
  await frame();
  await frame();
  assert.equal(api.calls.filter(call => call[0] === 'open').length, 0, 'клик по карточке чат не открывает');
  assert.equal(win.querySelector('.pud-cname h3').textContent, 'Луффи');
  assert.match(win.querySelector('.pud-gearpop').textContent, /только открытому/, 'у неоткрытого родных пунктов нет');

  const textarea = win.querySelector('textarea[data-field="description"]');
  textarea.value = 'мясо и приключения';
  textarea.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  textarea.dispatchEvent(new document.defaultView.FocusEvent('focusout', { bubbles: true }));
  await frame();
  assert.deepEqual(api.calls.find(call => call[0] === 'field'), ['field', 'luffy.png', 'description', 'мясо и приключения']);

  win.querySelector('.pud-side-right [data-act="open"]').click();
  await frame();
  assert.deepEqual(api.calls.find(call => call[0] === 'open'), ['open', 'luffy.png']);
  assert.equal(win.hidden, true, 'после открытия чата окно свернулось в док');
  document.getElementById(CHAR_BUTTON_ID).firstElementChild.click();
  await frame();

  win.querySelector('.pud-prow[data-avatar="mikey.png"]').click();
  await frame();
  await frame();
  win.querySelector('[data-act="gear"]').click();
  await frame();
  win.querySelector('[data-native="renameCharButton"]').click();
  await frame();
  assert.deepEqual(api.calls.find(call => call[0] === 'native'), ['native', 'renameCharButton'], 'у открытого — родные пункты «Ещё…»');

  await frame();
  win.querySelector('[data-gear="json"]').click();
  await frame();
  assert.deepEqual(api.calls.find(call => call[0] === 'export'), ['export', 'mikey.png', 'json']);

  undo();
  assert.equal(document.getElementById(CHAR_BUTTON_ID), null);
  assert.equal(native.classList.contains('pud-toggle-hidden'), false);
  delete globalThis.SillyTavern;
});

test('тот же HTML не перерисовывается: карточки и картинки не создаются заново', async () => {
  const { skipSameHtml } = await import('../src/pud/ui/dom.js');
  const { document } = new JSDOM('<!doctype html><body><div id="x"></div></body>').window;
  const el = skipSameHtml(document.getElementById('x'));
  el.innerHTML = '<img src="a.png">';
  const first = el.firstElementChild;
  el.innerHTML = '<img src="a.png">';
  assert.equal(el.firstElementChild, first, 'тот же узел');
  el.innerHTML = '<img src="b.png">';
  assert.notEqual(el.firstElementChild, first);
  assert.equal(el.innerHTML, '<img src="b.png">');
});

test('новый нарратор: промпт из библиотеки подставляется в описание, окно открывается с полки на нужном нарраторе', async () => {
  const { document } = tavern();
  const characters = makeCharacters();
  const api = fakeApi(characters);
  characters.push({ avatar: 'new.png', name: 'Новый', data: { description: '' } });
  const settings = migrateSettings({});
  settings.prompts = [{ id: 'p1', name: 'Мой нарратор', text: 'Ты нарратор. Пиши от третьего лица.', isDefault: true }, { id: 'p2', name: 'Другой', text: 'другой', isDefault: false }];
  const asked = [];
  const context = {
    characters, tagMap, tags, characterId: undefined, eventTypes: {}, POPUP_TYPE: { CONFIRM: 1 },
    callGenericPopup: async box => {
      asked.push(box.querySelector('[data-new="prompt"]')?.value);
      box.querySelector('[data-new="name"]').value = 'Новый';
      return true;
    },
  };
  globalThis.SillyTavern = { getContext: () => context };
  const shared = {};
  const undo = startCharacters(document, { context, settings, save() {}, api, lore, shared });
  assert.ok(shared.characters, 'у полки есть вход в окно нарраторов');
  shared.characters.add();
  await frame();
  assert.deepEqual(asked, ['p1'], 'промпт «по умолчанию» выбран заранее');
  assert.deepEqual(api.calls.filter(call => call[0] === 'create' || call[0] === 'field'), [['create', 'Новый'], ['field', 'new.png', 'description', 'Ты нарратор. Пиши от третьего лица.']]);

  const win = document.querySelector('.pud-chars');
  assert.equal(win.hidden, false);
  assert.equal(win.querySelector('.pud-win-title').textContent, 'Нарраторы');
  shared.characters.open(characters[0].avatar);
  await frame();
  assert.ok(win.querySelector('.pud-row.on, .pud-prow.on'), 'выбранный нарратор отмечен');
  undo();
  assert.equal(shared.characters, undefined);
});
