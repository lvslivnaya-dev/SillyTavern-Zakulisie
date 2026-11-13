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
