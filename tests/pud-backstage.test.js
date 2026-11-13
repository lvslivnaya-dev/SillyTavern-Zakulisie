/** Закулисный декор: эквалайзер на хабе и стартовом экране, плёнка на хвосте гуляющего котика. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EQ_SPOT, EQ_SVG } from '../src/pud/ui/backstage.js';
import { startHub } from '../src/pud/ui/hub.js';
import { startWalkCat } from '../src/pud/ui/walkcat.js';

test('эквалайзер: одиннадцать столбиков трёх цветов палитры над линией, без литеральных цветов', () => {
  const { document } = new JSDOM(`<body>${EQ_SVG}</body>`).window;
  assert.equal(document.querySelectorAll('.pud-eq-bar').length, 11);
  for (const tone of ['a', 'b', 'c']) assert.ok(document.querySelector(`.pud-eq-${tone}`), `есть столбики цвета ${tone}`);
  assert.ok(document.querySelector('.pud-eq-line'));
  assert.doesNotMatch(EQ_SVG, /#[0-9a-f]{3,6}\b|rgb\(/i, 'цвета только из палитры (в css)');
});

test('хаб настроек: внизу эквалайзер; кота, чиби, пульта и спящего котика нет', () => {
  const { document } = new JSDOM('<!doctype html><body><div id="top-settings-holder"></div></body>', { pretendToBeVisual: true }).window;
  const undo = startHub(document, { settings: { windows: {} }, save() {}, stopAll() {} });
  assert.ok(document.querySelector('.pud-hub .pud-eq-spot .pud-eq'));
  for (const gone of ['.pud-sleepcat', '.pud-chibi-spot', '.pud-cat-spot', '.pud-con-spot', '[data-companion-field]']) assert.equal(document.querySelector(gone), null, gone);
  assert.ok(EQ_SPOT.includes('pud-eq'));
  undo();
});

test('гуляющий котик: на кончике хвоста катушка с плёнкой, и хвост с ней виляет вместе', () => {
  const { document } = new JSDOM('<!doctype html><body><div id="send_form"></div></body>', { pretendToBeVisual: true }).window;
  const context = { eventTypes: { STREAM_TOKEN_RECEIVED: 'tok' }, eventSource: { on() {}, removeListener() {} } };
  const undo = startWalkCat(document, { context });
  const tail = document.querySelector('.pud-cat-tail');
  assert.ok(tail.querySelector('.pud-film-reel'), 'катушка внутри группы хвоста');
  assert.ok(tail.querySelector('.pud-film-ribbon'), 'плёнка тянется следом');
  undo();
});
