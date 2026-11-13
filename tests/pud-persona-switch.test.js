import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { migrateSettings } from '../src/pud/core/settings.js';
import { POP_ID, QUICK_ID, quickPersonas, startPersonaSwitch } from '../src/pud/ui/persona-switch.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const names = { 'a.png': 'Акаши Хина', 'b.png': 'Веспер', 'c.png': 'Старая' };

test('быстрый выбор: избранные первыми, архивные спрятаны', () => {
  const settings = migrateSettings({});
  settings.favorites.personas.push('b.png');
  settings.archive.personas.push('c.png');
  assert.deepEqual(quickPersonas(names, settings).map(item => item.avatar), ['b.png', 'a.png']);
});

test('фото надетой персоны у поля ввода, по нажатию — сетка фото, клик надевает', async () => {
  const { window } = new JSDOM('<!doctype html><body><div id="leftSendForm"></div></body>', { pretendToBeVisual: true });
  const { document } = window;
  let current = 'a.png';
  const api = { ready: async () => {}, current: () => current, thumbUrl: avatar => `/thumb/${avatar}`, wear: async avatar => { current = avatar; } };
  const context = { powerUserSettings: { personas: names }, eventTypes: {} };
  const undo = startPersonaSwitch(document, { context, settings: migrateSettings({}), api });
  await wait(10);
  const button = document.getElementById(QUICK_ID);
  assert.equal(button.querySelector('img').getAttribute('src'), '/thumb/a.png');
  assert.match(button.title, /Акаши Хина/);
  button.click();
  await wait(10);
  const pop = document.getElementById(POP_ID);
  assert.equal(pop.hidden, false);
  assert.equal(pop.querySelector('.pud-pq-it.on').dataset.avatar, 'a.png');
  pop.querySelector('[data-avatar="b.png"]').click();
  await wait(10);
  assert.equal(current, 'b.png');
  assert.equal(pop.hidden, true);
  assert.equal(button.querySelector('img').getAttribute('src'), '/thumb/b.png');
  undo();
  assert.equal(document.getElementById(QUICK_ID), null);
  assert.equal(document.getElementById(POP_ID), null);
});
