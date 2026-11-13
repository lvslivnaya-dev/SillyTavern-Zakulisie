import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWindow, fitRect } from '../src/pud/ui/window.js';

const page = () => new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true }).window;

test('окно не уезжает за экран и не бывает меньше минимума', () => {
  const vp = { width: 1200, height: 800 };
  assert.deepEqual(fitRect({ left: -500, top: -50, width: 600, height: 400 }, vp), { left: 8, top: 8, width: 600, height: 400 });
  assert.deepEqual(fitRect({ left: 5000, top: 5000, width: 600, height: 400 }, vp), { left: 592, top: 392, width: 600, height: 400 });
  assert.deepEqual(fitRect({ left: 0, top: 0, width: 10, height: 10 }, vp), { left: 8, top: 8, width: 360, height: 240 });
  assert.deepEqual(fitRect({ left: 0, top: 0, width: 9000, height: 9000 }, vp), { left: 8, top: 8, width: 1184, height: 784 });
  assert.deepEqual(fitRect({ left: 100, top: 0, width: 600, height: 400 }, { ...vp, top: 50 }), { left: 100, top: 58, width: 600, height: 400 }, 'не выше верхней панели');
});

test('открыть, свернуть в док, развернуть, закрыть крестиком', () => {
  const { document } = page();
  const toggles = [];
  const win = createWindow(document, { id: 'hub', title: 'Пудреница', icon: 'compact', onToggle: open => toggles.push(open) });
  const pill = document.querySelector('.pud-dock-pill');
  assert.equal(win.isOpen, false);
  win.open();
  assert.equal(win.isOpen, true);
  document.querySelector('.pud-win-min').click();
  assert.equal(win.isOpen, false);
  assert.equal(pill.hidden, false, 'свёрнутое окно ждёт в доке');
  pill.click();
  assert.equal(win.isOpen, true);
  assert.equal(pill.hidden, true);
  document.querySelector('.pud-win-close').click();
  assert.equal(win.isOpen, false);
  assert.equal(pill.hidden, true, 'закрытое окно в доке не висит');
  assert.deepEqual(toggles, [true, false, true, false]);
});

test('клик мимо окна и Esc его не закрывают', () => {
  const { document, KeyboardEvent } = page();
  const win = createWindow(document, { id: 'w', title: 'W', icon: 'book' });
  win.open();
  document.body.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(win.isOpen, true);
});

test('сохранённая позиция берётся из настроек, уничтожение убирает слой', () => {
  const { document } = page();
  const store = { hub: { left: 40, top: 50, width: 700, height: 500 } };
  const win = createWindow(document, { id: 'hub', title: 'H', icon: 'compact', store });
  win.open();
  assert.equal(win.element.style.left, '40px');
  assert.equal(win.element.style.width, '700px');
  win.destroy();
  assert.equal(document.getElementById('pud-layer'), null);
});
