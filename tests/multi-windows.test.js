/** Несколько окон сразу: панели по бокам чата, настройка включает и выключает, кнопки подсвечиваются. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="extensions_settings"></div><div id="extensions_settings2"></div><div id="top-settings-holder"><div id="persona-management-button"></div></div><div id="chat"></div><div id="form_sheld"><div id="send_form"></div></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const name of Object.getOwnPropertyNames(dom.window)) { if (/^[A-Z]/.test(name) && typeof dom.window[name] === 'function') { try { globalThis[name] = dom.window[name]; } catch {} } }
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const noop = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : noop), apply: () => undefined });
const base = {
  extensionSettings: { disabledExtensions: [], pudrenitsa: { enabled: false }, kulisy: { studioMulti: true } },
  chat: [], chatMetadata: {}, characters: [], groups: [], name1: 'User', name2: 'Bot',
  eventSource: { on() {}, once() {}, removeListener() {}, makeLast() {}, makeFirst() {} },
  eventTypes: new Proxy({}, { get: (t, k) => String(k) }),
  getCurrentChatId: () => 'chat1', saveSettingsDebounced() {}, getRequestHeaders: () => ({}),
  setExtensionPrompt() {}, mainApi: 'openai', getTokenCountAsync: async () => 0, getWorldInfoNames: () => [], powerUserSettings: { personas: {} },
  extensionPrompts: {}, saveChat: async () => {}, saveMetadata: async () => {},
};
const context = new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });
globalThis.SillyTavern = { getContext: () => context };

const press = id => document.querySelector(`.ku-winbtn[data-window="${id}"] .drawer-icon`).click();
const lit = () => [...document.querySelectorAll('.ku-winbtn')].filter(node => node.querySelector('.openIcon')).map(node => node.dataset.window);
/** The docked panels that are open now: [{ window, side }] in the order of the page. */
const openPanels = () => [...document.querySelectorAll('.kulisy-studio-host')]
  .map(host => ({ root: host.shadowRoot, host }))
  .filter(({ root }) => root.querySelector('.backdrop.docked') && !root.querySelector('.backdrop').hidden)
  .map(({ root }) => ({ title: root.querySelector('.brand strong')?.textContent, left: root.querySelector('.backdrop').classList.contains('left') }));

test('several windows: the first panel stands on the right, the second on the left, a third replaces the older, a second press closes', async () => {
  const module = await import('../index.js');
  const controller = await module.init();
  try {
    press('scene');
    assert.deepEqual(openPanels(), [{ title: 'Сцена', left: false }]);
    press('wardrobe');
    const two = openPanels();
    assert.equal(two.length, 2);
    assert.deepEqual(two.map(item => item.title).sort(), ['Гардероб', 'Сцена']);
    assert.deepEqual(two.find(item => item.title === 'Гардероб'), { title: 'Гардероб', left: true });
    assert.deepEqual(lit().sort(), ['scene', 'wardrobe']);

    press('quests');
    const three = openPanels();
    assert.equal(three.length, 2, 'never more than two');
    assert.deepEqual(three.map(item => item.title).sort(), ['Гардероб', 'Квесты'], 'the older one (the scene) gave way');
    assert.deepEqual(lit().sort(), ['quests', 'wardrobe']);

    press('wardrobe');
    assert.deepEqual(openPanels().map(item => item.title), ['Квесты']);
    assert.deepEqual(lit(), ['quests']);

    // switched off: one window at a time again, the panels close
    context.extensionSettings.kulisy.studioMulti = false;
    press('scene');
    assert.deepEqual(openPanels(), [], 'the side panels are closed');
    assert.deepEqual(lit(), ['scene'], 'one window, in the main Studio');
    press('wardrobe');
    assert.deepEqual(lit(), ['wardrobe'], 'a second press replaces it');
  } finally { controller.destroy(); }
});
