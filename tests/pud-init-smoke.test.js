/** Расширение целиком стартует в заглушке таверны: ловит ошибки, которые видны только при запуске (вроде имени до объявления). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="top-settings-holder"><div id="sys-settings-button" class="drawer"><div class="drawer-toggle"><div class="drawer-icon closedIcon"></div></div><div id="rm_api_block" class="drawer-content closedDrawer"></div></div></div><div id="chat"></div><textarea id="send_textarea" placeholder="Type a message"></textarea></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const name of Object.getOwnPropertyNames(dom.window)) {
  if (/^[A-Z]/.test(name) && typeof dom.window[name] === 'function') { try { globalThis[name] = dom.window[name]; } catch { /* только для чтения */ } }
}
const context = {
  extensionSettings: { pudrenitsa: { enabled: true, chips: { 'NoriMyn::Gemini': [{ id: 'think', label: 'Think' }] } } },
  saveSettingsDebounced() {},
  // чат открыт: библиотека на старте не ходит на сервер (у заглушки его нет)
  getCurrentChatId: () => 'Ран - 2026-11-06',
  eventSource: { on() {}, once() {}, removeListener() {} },
  eventTypes: new Proxy({}, { get: (target, key) => String(key) }),
};
globalThis.SillyTavern = { getContext: () => context };

test('init() стартует без ошибок в консоли и повторно отдаёт тот же контроллер', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.map(item => item?.stack || String(item)).join(' ')); };
  try {
    const module = await import('../src/pud/start.js');
    const controller = await module.initPudrenitsa();
    assert.ok(controller, 'init вернул контроллер');
    assert.deepEqual(controller.failed, []);
    assert.equal(await module.initPudrenitsa(), controller, 'второй init переиспользует контроллер');
    assert.ok(document.getElementById('pud-fonts'), 'шрифты подключены');
    assert.ok(document.getElementById('pud-icon-sprite'), 'спрайт иконок вставлен');
    assert.ok(document.body.classList.contains('pud-on'));
    assert.ok(document.getElementById('pud-hub-button'), 'кнопка окна Пудреница');
    assert.ok(document.getElementById('rm_api_block').closest('.pud-pane'), 'шторка API во вкладке');
    assert.deepEqual(context.extensionSettings.pudrenitsa.chips['NoriMyn::Gemini'], [{ id: 'think', label: 'Think' }], 'сохранённые кнопки не потерялись');

    controller.stop();
    assert.equal(document.getElementById('pud-fonts'), null, 'откат убрал шрифты');
    assert.equal(document.getElementById('pud-icon-sprite'), null, 'откат убрал спрайт');
    assert.equal(document.body.classList.contains('pud-on'), false);
    assert.equal(document.getElementById('rm_api_block').parentElement.id, 'sys-settings-button', 'шторка вернулась');
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, [], errors.join(' | '));
});
