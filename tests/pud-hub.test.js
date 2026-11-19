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
  for (const [id, title] of [['palette', 'Палитра'], ['mood', 'Настроение'], ['chips', 'Кнопки пресета'], ['strange', 'Чужая'], ['wand', 'Меню палочки'], ['peek', 'Слива']]) shared.hub.addTab(id, title, 'heart');
  const order = [...document.querySelector('.pud-tabs').children].map(node => node.dataset?.tab ?? node.dataset?.groupHead ?? (node.classList.contains('pud-links') ? 'links' : node.className));
  const at = id => order.indexOf(id);
  const heads = ['native', 'sliva', 'visual'].map(at);
  assert.deepEqual(heads, [...heads].sort((a, b) => a - b), 'блоки идут подряд');
  assert.ok(heads[0] === 0, 'первый блок — родные настройки');
  assert.ok(at('ai') < at('sliva') && at('wand') < at('sliva'), 'родные и меню палочки до сливовых');
  assert.ok(at('chips') < at('mood') && at('mood') < at('strange'), 'сливовые по порядку, незнакомые в конец блока');
  assert.ok(at('peek') > at('chips') && at('peek') < at('visual'), 'Слива среди сливовых приблуд, а не в оформлении');
  assert.ok(at('strange') < at('visual') && at('bg') > at('visual') && at('palette') > at('visual'), 'визуал отдельным блоком');
  assert.ok(at('visual') < at('links'), 'ссылки после визуала');
  assert.ok(document.querySelector('.pud-links > [data-tab="pud"]'), '«Закулисье» — кнопка в ряду ссылок');
  const links = [...document.querySelectorAll('.pud-links a')];
  assert.equal(links.length, HUB_LINKS.length);
  for (const a of links) { assert.ok(a.title && a.getAttribute('aria-label') === a.title, 'название при наведении'); assert.equal(a.textContent.trim(), '', 'подписи нет, только значок'); }
  undo();
});

test('кнопка с вкладками: родные настройки под одной кнопкой «Таверна», страницы переключаются рядом, вверху', () => {
  const { document } = tavern();
  const shared = {};
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {}, shared });
  for (const [id, title] of [['chips', 'Кнопки пресета'], ['assistants', 'Ассистенты'], ['repeats', 'Повторы'], ['peek', 'Слива'], ['palette', 'Палитра']]) shared.hub.addTab(id, title, 'heart');
  const heads = [...document.querySelectorAll('.pud-tabs > [data-group]')].map(node => node.dataset.group);
  assert.deepEqual(heads, ['tavern', 'helpers', 'look']);
  assert.ok([...document.querySelectorAll('.pud-tabs > [data-tab]')].filter(node => ['ai', 'api', 'chips'].includes(node.dataset.tab)).every(node => node.classList.contains('pud-grouped')), 'кнопки самих страниц спрятаны');
  assert.ok(!document.querySelector('.pud-tabs > [data-tab="peek"]').classList.contains('pud-grouped'), 'Слива — отдельная вкладка, не в группе «Оформление»');
  document.querySelector('[data-group="tavern"]').click();
  const subs = () => [...document.querySelectorAll('.pud-subbar > button')].map(node => node.textContent);
  assert.deepEqual(subs(), ['Ответ ИИ', 'Соединение', 'Формат ответа', 'Пользователь']);
  assert.equal(document.querySelector('[data-pane="ai"]').hidden, false);
  document.querySelector('.pud-subbar [data-sub="api"]').click();
  assert.equal(document.querySelector('[data-pane="api"]').hidden, false);
  assert.equal(document.querySelector('[data-pane="ai"]').hidden, true);
  assert.ok(document.querySelector('[data-group="tavern"]').classList.contains('on'));
  document.querySelector('[data-group="helpers"]').click();
  assert.deepEqual(subs(), ['Ассистенты', 'Кнопки пресета', 'Повторы'], 'в группе только то, что есть');
  document.querySelector('[data-group="tavern"]').click();
  assert.equal(document.querySelector('[data-pane="api"]').hidden, false, 'группа открывается на странице, где была в последний раз');
  document.querySelector('[data-group="look"]').click();
  assert.ok(subs().includes('Палитра') && !subs().includes('Слива'));
  undo();
});

test('«Палитра отношений» и «Тема по настроению» не вкладки, а шторки внутри «Палитры»: страница-хозяйка может перерисоваться, шторки остаются', () => {
  const { document } = tavern();
  const shared = {};
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {}, shared });
  const palette = shared.hub.addTab('palette', 'Палитра', 'wand');
  const relations = shared.hub.addFold('relpalette', 'Палитра отношений', 'palette');
  relations.pane.innerHTML = '<h3>Отношения</h3><p>шкалы</p>';
  assert.equal(document.querySelector('[data-tab="relpalette"]'), null, 'своей кнопки нет');
  shared.hub.mountFolds('palette', palette.pane);
  const mood = shared.hub.addFold('moodtheme', 'Тема по настроению', 'palette');
  mood.pane.innerHTML = '<p>правила</p>';
  assert.deepEqual([...palette.pane.querySelectorAll('details.pud-foldpage > summary')].map(node => node.textContent), ['Палитра отношений', 'Тема по настроению'], 'шторки встали в палитру, и поздняя — тоже');
  assert.equal(document.querySelector('.pud-subbar [data-sub="relgraph"]'), null);
  palette.pane.innerHTML = '<h3>Палитра</h3>';
  assert.equal(palette.pane.querySelectorAll('details.pud-foldpage').length, 0, 'страница перерисовалась');
  shared.hub.mountFolds('palette', palette.pane);
  assert.equal(palette.pane.querySelectorAll('details.pud-foldpage').length, 2, 'шторки вернулись');
  assert.match(palette.pane.textContent, /шкалы/, 'содержимое шторки не потерялось');
  undo();
});
