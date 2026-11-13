import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { HIDER_ID, parseRange, startHider } from '../src/pud/ui/hider.js';

test('диапазон: с № по №, порядок не важен, конец обрезается по чату, ошибки по-русски', () => {
  assert.deepEqual(parseRange('0', '15', 20), [0, 15]);
  assert.deepEqual(parseRange('15', '3', 20), [3, 15]);
  assert.deepEqual(parseRange('5', '', 20), [5, 5]);
  assert.deepEqual(parseRange('10', '99', 20), [10, 19]);
  assert.match(parseRange('25', '30', 20), /Последнее сообщение — № 19/);
  assert.match(parseRange('-1', '3', 20), /с 0/);
  assert.match(parseRange('a', '3', 20), /целыми/);
});

test('кнопка встаёт в ряд Guided Generations, по нажатию скрывает выбранное', async () => {
  const { window } = new JSDOM('<!doctype html><body><div id="send_form"><div id="gg-regular-buttons-container"><div class="gg-action-button"></div></div><div id="rightSendForm"></div></div></body>', { pretendToBeVisual: true });
  const { document } = window;
  const calls = [];
  const context = {
    chat: Array.from({ length: 20 }, () => ({ is_system: false })),
    POPUP_TYPE: { CONFIRM: 1 },
    callGenericPopup: async box => { box.querySelector('[data-from]').value = '0'; box.querySelector('[data-to]').value = '15'; return true; },
  };
  const undo = startHider(document, { context, api: { hideRange: async (...args) => { calls.push(args); } } });
  const button = document.getElementById(HIDER_ID);
  assert.equal(button.parentElement.id, 'gg-regular-buttons-container');
  assert.equal(button.parentElement.firstElementChild, button);
  button.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(calls, [[0, 15, false]]);
  // Guided Generations пересоздал свой ряд — кнопка вернулась в новый
  document.getElementById('gg-regular-buttons-container').remove();
  document.getElementById('send_form').insertAdjacentHTML('afterbegin', '<div id="gg-regular-buttons-container"></div>');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(document.getElementById(HIDER_ID).parentElement.id, 'gg-regular-buttons-container');
  undo();
  assert.equal(document.getElementById(HIDER_ID), null);
});
