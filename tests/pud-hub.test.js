import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { HUB_BUTTON_ID, HUB_LINKS, HUB_TABS, startHub } from '../src/pud/ui/hub.js';

function tavern() {
  const drawers = HUB_TABS.map(tab => `<div id="${tab.drawer}" class="drawer"><div class="drawer-toggle"><div class="drawer-icon closedIcon"></div></div><div id="${tab.content}" class="drawer-content closedDrawer"><input id="in-${tab.id}"></div></div>`).join('');
  const win = new JSDOM(`<!doctype html><body><div id="top-settings-holder">${drawers}<div id="extensions-settings-button" class="drawer"></div></div></body>`, { pretendToBeVisual: true }).window;
  return win;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('пять родных шторок переезжают во вкладки, их кнопки прячутся, откат возвращает всё на место', () => {
  const { document } = tavern();
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {} });
  const holder = document.getElementById('top-settings-holder');
  assert.equal(holder.firstElementChild.id, HUB_BUTTON_ID, 'кнопка Пудреницы первая на панели');
  for (const tab of HUB_TABS) {
    const content = document.getElementById(tab.content);
    assert.ok(content.closest(`.pud-pane[data-pane="${tab.id}"]`), `${tab.id} во вкладке`);
    assert.ok(document.getElementById(tab.drawer).classList.contains('pud-moved'));
  }
  assert.ok(document.body.classList.contains('pud-hub-on'));
  assert.equal(document.querySelectorAll('.pud-links a').length, HUB_LINKS.length);
  for (const a of document.querySelectorAll('.pud-links a')) assert.equal(a.target, '_blank');

  undo();
  for (const tab of HUB_TABS) {
    const content = document.getElementById(tab.content);
    assert.equal(content.parentElement.id, tab.drawer, `${tab.id} вернулась в свою шторку`);
    assert.ok(!document.getElementById(tab.drawer).classList.contains('pud-moved'));
  }
  assert.equal(document.getElementById(HUB_BUTTON_ID), null);
  assert.equal(document.querySelector('.pud-win'), null);
  assert.ok(!document.body.classList.contains('pud-hub-on'));
});

test('кнопка открывает и закрывает окно, вкладки переключаются', () => {
  const { document } = tavern();
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {} });
  const button = document.getElementById(HUB_BUTTON_ID).firstElementChild;
  const win = document.querySelector('.pud-hub');
  button.click();
  assert.equal(win.hidden, false);
  assert.ok(button.classList.contains('pud-open'));
  document.querySelector('[data-tab="api"]').click();
  assert.equal(document.querySelector('[data-pane="api"]').hidden, false);
  assert.equal(document.querySelector('[data-pane="ai"]').hidden, true);
  button.click();
  assert.equal(win.hidden, true);
  assert.ok(!button.classList.contains('pud-open'));
  undo();
});

test('таверна открывает свою шторку сама — открывается нужная вкладка Пудреницы', async () => {
  const { document } = tavern();
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {} });
  const nativeIcon = document.querySelector('#sys-settings-button .drawer-icon');
  nativeIcon.classList.replace('closedIcon', 'openIcon');
  await tick();
  assert.equal(document.querySelector('.pud-hub').hidden, false);
  assert.equal(document.querySelector('[data-pane="api"]').hidden, false);
  assert.ok(nativeIcon.classList.contains('closedIcon'), 'родная иконка снова «закрыта», следующий вызов тоже сработает');
  undo();
});

test('«Выключить до перезагрузки» вызывает общий откат', () => {
  const { document } = tavern();
  let stopped = 0;
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll: () => { stopped++; } });
  document.querySelector('.pud-off').click();
  assert.equal(stopped, 1);
  undo();
});

test('без верхней панели ничего не делает', () => {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {} });
  assert.equal(document.querySelector('.pud-win'), null);
  undo();
});

test('вкладки по блокам: родные → сливовые приблуды → визуал → ссылки значками → «Закулисье» последним', () => {
  const { document } = tavern();
  const shared = {};
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {}, shared });
  for (const [id, title] of [['palette', 'Палитра'], ['mood', 'Настроение'], ['chips', 'Кнопки пресета'], ['strange', 'Чужая'], ['moodtheme', 'Тема'], ['wand', 'Меню палочки'], ['peek', 'Слива']]) shared.hub.addTab(id, title, 'heart');
  const order = [...document.querySelector('.pud-tabs').children].map(node => node.dataset?.tab ?? node.dataset?.groupHead ?? (node.classList.contains('pud-links') ? 'links' : node.className));
  const at = id => order.indexOf(id);
  const heads = ['native', 'sliva', 'visual'].map(at);
  assert.deepEqual(heads, [...heads].sort((a, b) => a - b), 'блоки идут подряд');
  assert.ok(heads[0] === 0, 'первый блок — родные настройки');
  assert.ok(at('ai') < at('sliva') && at('wand') < at('sliva'), 'родные и меню палочки до сливовых');
  assert.ok(at('chips') < at('peek') && at('peek') < at('mood') && at('mood') < at('strange'), 'сливовые по порядку, незнакомые в конец блока');
  assert.ok(at('strange') < at('visual') && at('bg') > at('visual') && at('palette') < at('moodtheme'), 'визуал отдельным блоком');
  assert.ok(at('moodtheme') < at('links'), 'ссылки после визуала');
  assert.ok(document.querySelector('.pud-links > [data-tab="pud"]'), '«Закулисье» — кнопка в ряду ссылок');
  const links = [...document.querySelectorAll('.pud-links a')];
  assert.equal(links.length, HUB_LINKS.length);
  for (const a of links) { assert.ok(a.title && a.getAttribute('aria-label') === a.title, 'название при наведении'); assert.equal(a.textContent.trim(), '', 'подписи нет, только значок'); }
  undo();
});
