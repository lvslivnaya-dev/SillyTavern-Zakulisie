import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { startVisualPresets } from '../src/pud/ui/visual-presets.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function mount() {
  const win = new JSDOM('<!doctype html><body class="pud-on"></body>', { pretendToBeVisual: true, url: 'http://localhost/' }).window;
  const tabs = {};
  const calls = [];
  const state = { palette: { id: 'matcha', custom: null, paws: { background: true, chat: true } }, icons: { pud: { heart: PNG }, studio: {} }, mood: { enabled: true, strength: 70, rules: [] }, background: 'night.jpg' };
  const shared = {
    hub: { addTab(id) { const pane = win.document.createElement('section'); pane.dataset.pane = id; win.document.body.append(pane); tabs[id] = pane; return { pane, remove: () => pane.remove() }; } },
    visual: {
      palette: { get: () => state.palette, set: value => { calls.push(['palette', value]); } },
      icons: { get: () => state.icons, set: value => { calls.push(['icons', value]); } },
      mood: { get: () => state.mood, set: value => { calls.push(['mood', value]); } },
    },
  };
  const background = { current: async () => state.background, apply: name => { if (name === 'gone.jpg') throw new Error('фона «gone.jpg» в списке таверны нет'); calls.push(['background', name]); } };
  return { win, tabs, shared, calls, state, background };
}
const click = (m, node) => node.dispatchEvent(new m.win.MouseEvent('click', { bubbles: true }));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('вкладка «Визуальные пресеты»: сохранить выбранные части, применить, убрать часть, обновить, удалить', async () => {
  const m = mount();
  const settings = {};
  let saved = 0;
  const undo = startVisualPresets(m.win.document, { context: {}, settings, save() { saved += 1; }, shared: m.shared, background: m.background });
  try {
    const pane = m.tabs.vpresets;
    assert.ok(pane, 'своя вкладка в блоке «Визуал»');
    assert.match(pane.textContent, /Пока пусто/);
    // без иконок: снять галочку и сохранить
    const name = pane.querySelector('[data-vp-new]');
    name.value = 'Мятный вечер';
    name.dispatchEvent(new m.win.Event('input', { bubbles: true }));
    const icons = pane.querySelector('[data-vp-inc="icons"]');
    icons.checked = false;
    icons.dispatchEvent(new m.win.Event('change', { bubbles: true }));
    click(m, pane.querySelector('[data-vp="save"]'));
    await tick();
    assert.equal(settings.visualPresets.length, 1);
    assert.deepEqual(Object.keys(settings.visualPresets[0].parts), ['background', 'palette', 'mood'], 'иконок в пресете нет');
    assert.ok(saved >= 1);
    assert.equal(pane.querySelector('[data-vp-name]').value, 'Мятный вечер');
    // применить: меняются только части пресета
    click(m, pane.querySelector('[data-vp="apply"]'));
    await tick();
    assert.deepEqual(m.calls.map(item => item[0]), ['palette', 'mood', 'background']);
    assert.ok(!m.calls.some(item => item[0] === 'icons'), 'иконки не тронуты');
    assert.match(pane.querySelector('.pud-vp-note').textContent, /применено палитра, тема по настроению, фон/i);
    // добавить часть «Иконки» из текущего
    const addIcons = pane.querySelector('.pud-vp [data-vp-part="icons"]');
    addIcons.checked = true;
    addIcons.dispatchEvent(new m.win.Event('change', { bubbles: true }));
    await tick();
    assert.deepEqual(Object.keys(settings.visualPresets[0].parts), ['background', 'palette', 'icons', 'mood']);
    // фона уже нет в таверне: остальное применилось, про фон сказано
    m.state.background = 'gone.jpg';
    click(m, pane.querySelector('.pud-vp [data-vp="refresh"]'));
    await tick();
    m.calls.length = 0;
    click(m, pane.querySelector('[data-vp="apply"]'));
    await tick();
    assert.deepEqual(m.calls.map(item => item[0]), ['palette', 'icons', 'mood']);
    assert.match(pane.querySelector('.pud-vp-note').textContent, /Не вышло: Фон/);
    // удаление в два нажатия
    click(m, pane.querySelector('[data-vp="delete"]'));
    assert.equal(settings.visualPresets.length, 1, 'первое нажатие только спрашивает');
    click(m, pane.querySelector('[data-vp="delete"]'));
    assert.equal(settings.visualPresets.length, 0);
    // нечего сохранять
    for (const id of ['background', 'palette', 'icons', 'mood']) { const box = pane.querySelector(`[data-vp-inc="${id}"]`); box.checked = false; box.dispatchEvent(new m.win.Event('change', { bubbles: true })); }
    click(m, pane.querySelector('[data-vp="save"]'));
    await tick();
    assert.match(pane.querySelector('.pud-vp-note').textContent, /Нечего сохранять/);
  } finally { undo(); }
  assert.equal(m.win.document.querySelector('[data-pane="vpresets"]'), null, 'откат убирает вкладку');
});
