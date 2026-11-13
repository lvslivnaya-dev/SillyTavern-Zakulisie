import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { NOBODY, OFF, UPDATE, assignBlocks, buildExtensions, externalId, filterExtensions, folderName, matchScore, normalize } from '../src/pud/core/extensions.js';
import { ALL, NO_FOLDER, createFolder, moveToFolder } from '../src/pud/core/personas.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { EXT_BUTTON_ID, NATIVE_EXT_DRAWER, startExtensions } from '../src/pud/ui/extensions.js';

const names = ['memory', 'quick-reply', 'third-party/SillyTavern-Kulisy', 'third-party/SillyTavern-Horae', 'third-party/MistraelSL-PersonaPanel'];
const manifests = {
  memory: { display_name: 'Summarize', version: '' },
  'quick-reply': { display_name: 'Quick Reply' },
  'third-party/SillyTavern-Kulisy': { display_name: 'Кулисы', version: '0.1.0', author: 'Слива & Hugh' },
  'third-party/SillyTavern-Horae': { display_name: 'Horae', version: '2.4.1' },
  'third-party/MistraelSL-PersonaPanel': { display_name: 'MistraelSL Persona Panel' },
};
const types = { memory: 'system', 'quick-reply': 'system', 'third-party/SillyTavern-Kulisy': 'local', 'third-party/SillyTavern-Horae': 'local', 'third-party/MistraelSL-PersonaPanel': 'local' };

test('имена: папка, внешнее имя для родных функций, нормализация', () => {
  assert.equal(folderName('third-party/SillyTavern-Kulisy'), 'SillyTavern-Kulisy');
  assert.equal(externalId('third-party/SillyTavern-Kulisy'), '/SillyTavern-Kulisy');
  assert.equal(normalize('SillyTavern-Kulisy'), 'kulisy');
  assert.equal(normalize('Quick Reply'), 'quickreply');
});

test('список: отключённые и с обновлением — отдельные фильтры, включённые сверху, папки', () => {
  const settings = migrateSettings({});
  const list = buildExtensions(names, id => manifests[id], ['third-party/MistraelSL-PersonaPanel'], types, { 'third-party/SillyTavern-Horae': true });
  assert.equal(list.find(item => item.id === 'memory').system, true);
  const ids = options => filterExtensions(list, settings, options).map(item => item.id);
  assert.deepEqual(ids({ view: OFF }), ['third-party/MistraelSL-PersonaPanel']);
  assert.deepEqual(ids({ view: UPDATE }), ['third-party/SillyTavern-Horae']);
  assert.equal(ids({}).at(-1), 'third-party/MistraelSL-PersonaPanel', 'выключенные внизу');
  const folder = createFolder(settings, 'Память и трекеры', 'extensions');
  moveToFolder(settings, 'third-party/SillyTavern-Horae', folder.id, 'extensions');
  assert.deepEqual(ids({ view: folder.id }), ['third-party/SillyTavern-Horae']);
  assert.ok(!ids({ view: NO_FOLDER }).includes('third-party/SillyTavern-Horae'));
  assert.deepEqual(ids({ view: ALL, query: 'кулис' }), ['third-party/SillyTavern-Kulisy']);
});

test('блоки настроек находят хозяина по заголовку и id, ручная привязка сильнее догадки', () => {
  const list = buildExtensions(names, id => manifests[id], [], types);
  const blocks = [
    { key: '#qr_container', title: 'Quick Reply', ids: 'qr_container extension_container' },
    { key: 't:Кулисы', title: 'Кулисы', ids: 'kulisy-settings' },
    { key: '#horae_settings', title: 'Хорэ — дневник', ids: 'horae_settings' },
    { key: 't:Что-то', title: 'Что-то непонятное', ids: '' },
  ];
  assert.ok(matchScore(blocks[0], list.find(item => item.id === 'quick-reply')) >= 3);
  const { owners, orphans } = assignBlocks(blocks, list);
  assert.deepEqual(owners['quick-reply'], ['#qr_container']);
  assert.deepEqual(owners['third-party/SillyTavern-Kulisy'], ['t:Кулисы']);
  assert.deepEqual(owners['third-party/SillyTavern-Horae'], ['#horae_settings'], 'по id блока');
  assert.deepEqual(orphans, ['t:Что-то']);
  const manual = assignBlocks(blocks, list, { 't:Что-то': 'memory', '#qr_container': NOBODY });
  assert.deepEqual(manual.owners.memory, ['t:Что-то']);
  assert.ok(manual.orphans.includes('#qr_container'));
});

function tavern() {
  return new JSDOM(`<!doctype html><body>
    <div id="top-settings-holder"><div id="${NATIVE_EXT_DRAWER}" class="drawer"><div class="drawer-toggle"><div class="drawer-icon closedIcon"></div></div>
      <div id="rm_extensions_block" class="drawer-content closedDrawer"><div class="extensions_block">
        <label><input id="extensions_notify_updates" type="checkbox"></label><div id="extensions_details"></div>
        <div id="extensions_settings"><div id="kulisy-settings"><div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>Кулисы</b></div><div class="inline-drawer-content">настройки кулис</div></div></div></div>
        <div id="extensions_settings2"><div id="qr_container" class="extension_container"><b>Quick Reply</b></div><div id="empty_container"></div></div>
        <hr><div class="flex-container"><h4>Extras API:</h4><div id="extensions_status">Not connected</div></div>
        <div class="flex-container"><input id="extensions_url"><input id="extensions_api_key"></div>
      </div></div></div></div>
    </body>`, { pretendToBeVisual: true }).window;
}
const frame = () => new Promise(resolve => setTimeout(resolve, 40));
function fakeApi(disabled) {
  const calls = [];
  return {
    calls,
    ready: async () => {},
    names: () => names,
    manifest: id => manifests[id],
    disabled: () => disabled,
    types: () => types,
    setEnabled: async (id, on) => { calls.push(['enabled', id, on]); if (on) disabled.splice(disabled.indexOf(id), 1); else disabled.push(id); },
    remove: async id => { calls.push(['remove', id]); },
    hasUpdate: async id => id.endsWith('Horae'),
    update: async () => 'abc1234',
    install: async () => { calls.push(['install']); },
    reload: () => { calls.push(['reload']); },
  };
}

test('окно расширений: настройки выбранного переезжают в окно и возвращаются; включение копится до перезагрузки', async () => {
  const { document } = tavern();
  const disabled = [];
  const api = fakeApi(disabled);
  const settings = migrateSettings({});
  const context = { eventTypes: {}, POPUP_TYPE: { CONFIRM: 1 }, callGenericPopup: async () => true };
  const undo = startExtensions(document, { context, settings, save() {}, api });
  const native = document.getElementById(NATIVE_EXT_DRAWER);
  assert.ok(native.classList.contains('pud-replaced'));
  assert.ok(document.querySelector('.pud-extras-body #extensions_url'), 'Extras API под ключиком');

  document.getElementById(EXT_BUTTON_ID).firstElementChild.click();
  await frame();
  await frame();
  const win = document.querySelector('.pud-exts');
  assert.equal(win.querySelectorAll('.pud-exrow').length, names.length);

  win.querySelector('.pud-exrow[data-id="third-party/SillyTavern-Kulisy"] .pud-exrow-info').click();
  await frame();
  const block = document.getElementById('kulisy-settings');
  assert.ok(block.closest('.pud-exslot'), 'настройки Кулис в окне');

  win.querySelector('.pud-exrow[data-id="quick-reply"] .pud-exrow-info').click();
  await frame();
  assert.equal(block.parentElement.id, 'extensions_settings', 'Кулисы вернулись на шторку');
  assert.ok(document.getElementById('qr_container').closest('.pud-exslot'));

  const sw = win.querySelector('.pud-exrow[data-id="third-party/SillyTavern-Horae"] .pud-exsw');
  sw.checked = false;
  sw.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  await frame();
  assert.deepEqual(api.calls.at(-1), ['enabled', 'third-party/SillyTavern-Horae', false]);
  assert.equal(win.querySelector('.pud-reload').hidden, false, 'просит перезагрузку');
  win.querySelector('[data-tool="reload"]').click();
  assert.deepEqual(api.calls.at(-1), ['reload']);

  win.querySelector('[data-view="__update__"]').click();
  await frame();
  assert.deepEqual([...win.querySelectorAll('.pud-exrow')].map(row => row.dataset.id), ['third-party/SillyTavern-Horae'], 'проверка обновлений нашла Horae');

  undo();
  assert.equal(document.getElementById(EXT_BUTTON_ID), null);
  assert.equal(document.getElementById('qr_container').parentElement.id, 'extensions_settings2', 'всё вернулось');
  assert.ok(document.getElementById('extensions_url').closest('#rm_extensions_block'));
});
